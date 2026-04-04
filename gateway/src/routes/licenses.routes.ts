import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { db } from '../config/database';
import { AppError } from '../utils/AppError';
import { createPixCharge, verifyAsaasWebhook } from '../services/pix.service';
import {
  createLicense,
  activateLicense,
  validateLicense,
  revokeLicense,
  logEvent,
} from '../services/license.service';

// ── Admin-protected router ────────────────────────────────────────
export const licenseAdminRouter = Router();
licenseAdminRouter.use(authenticate, requireRole('admin'));

// ── Public router (no auth) ───────────────────────────────────────
export const licensePublicRouter = Router();

// ── Webhook router (no auth — signature verified internally) ─────
export const licenseWebhookRouter = Router();

// ═══════════════════════════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════════════════════════

// GET /api/admin/products
licenseAdminRouter.get('/products', async (_req: Request, res: Response) => {
  const products = await db.query(
    'SELECT * FROM products ORDER BY created_at DESC'
  );
  return res.json({ success: true, data: products });
});

// POST /api/admin/products
licenseAdminRouter.post('/products', async (req: Request, res: Response) => {
  const schema = z.object({
    name:           z.string().min(2),
    description:    z.string().optional(),
    price_cents:    z.number().int().positive(),
    license_type:   z.enum(['perpetual', 'yearly', 'monthly']).default('perpetual'),
    duration_days:  z.number().int().positive().optional(),
    max_activations: z.number().int().positive().default(1),
  });

  const body = schema.safeParse(req.body);
  if (!body.success) throw new AppError(body.error.errors[0].message, 400, 'VALIDATION_ERROR');

  const [product] = await db.query(
    `INSERT INTO products (name, description, price_cents, license_type, duration_days, max_activations)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      body.data.name, body.data.description || null,
      body.data.price_cents, body.data.license_type,
      body.data.duration_days || null, body.data.max_activations,
    ]
  );

  return res.status(201).json({ success: true, data: product });
});

// PATCH /api/admin/products/:id
licenseAdminRouter.patch('/products/:id', async (req: Request, res: Response) => {
  const allowed = ['name', 'description', 'price_cents', 'is_active', 'max_activations'];
  const updates: string[] = [];
  const values: unknown[] = [];

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates.push(`${key} = $${values.length + 1}`);
      values.push(req.body[key]);
    }
  }

  if (!updates.length) throw new AppError('No valid fields to update', 400, 'VALIDATION_ERROR');

  values.push(req.params.id);
  const [product] = await db.query(
    `UPDATE products SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${values.length} RETURNING *`,
    values
  );

  return res.json({ success: true, data: product });
});

// ═══════════════════════════════════════════════════════════════
// LICENSES — Admin management
// ═══════════════════════════════════════════════════════════════

// GET /api/admin/licenses
licenseAdminRouter.get('/licenses', async (req: Request, res: Response) => {
  const { status, search, page = '1', limit = '20' } = req.query as Record<string, string>;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const conditions: string[] = ['1=1'];
  const params: unknown[] = [];

  if (status) {
    params.push(status);
    conditions.push(`l.status = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(l.license_key ILIKE $${params.length} OR l.customer_email ILIKE $${params.length} OR l.customer_name ILIKE $${params.length})`);
  }

  const where = conditions.join(' AND ');
  params.push(parseInt(limit), offset);

  const [licenses, countResult] = await Promise.all([
    db.query(
      `SELECT l.*, p.name as product_name, p.price_cents,
              pp.status as payment_status, pp.paid_at, pp.gateway,
              pp.qrcode_text
       FROM licenses l
       JOIN products p ON p.id = l.product_id
       LEFT JOIN LATERAL (
         SELECT status, paid_at, gateway, qrcode_text
         FROM pix_payments
         WHERE license_id = l.id
         ORDER BY created_at DESC LIMIT 1
       ) pp ON true
       WHERE ${where}
       ORDER BY l.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    ),
    db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM licenses l WHERE ${where}`,
      params.slice(0, -2)
    ),
  ]);

  return res.json({
    success: true,
    data: licenses,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: parseInt(countResult?.count || '0'),
    },
  });
});

// GET /api/admin/licenses/:id — full detail with events
licenseAdminRouter.get('/licenses/:id', async (req: Request, res: Response) => {
  const license = await db.queryOne(
    `SELECT l.*, p.name as product_name, p.price_cents, p.license_type
     FROM licenses l
     JOIN products p ON p.id = l.product_id
     WHERE l.id = $1`,
    [req.params.id]
  );

  if (!license) throw new AppError('License not found', 404, 'NOT_FOUND');

  const [payments, events, activations] = await Promise.all([
    db.query('SELECT * FROM pix_payments WHERE license_id = $1 ORDER BY created_at DESC', [req.params.id]),
    db.query('SELECT * FROM license_events WHERE license_id = $1 ORDER BY created_at DESC LIMIT 50', [req.params.id]),
    db.query('SELECT * FROM license_activations WHERE license_id = $1 ORDER BY last_seen_at DESC', [req.params.id]),
  ]);

  return res.json({ success: true, data: { license, payments, events, activations } });
});

// POST /api/admin/licenses — manually create a license (already paid / gift)
licenseAdminRouter.post('/licenses', async (req: Request, res: Response) => {
  const schema = z.object({
    product_id:     z.string().uuid(),
    customer_name:  z.string().min(2),
    customer_email: z.string().email(),
    customer_doc:   z.string().optional(),
    activate_now:   z.boolean().default(false),
    notes:          z.string().optional(),
  });

  const body = schema.safeParse(req.body);
  if (!body.success) throw new AppError(body.error.errors[0].message, 400, 'VALIDATION_ERROR');

  const license = await createLicense({
    productId:     body.data.product_id,
    customerName:  body.data.customer_name,
    customerEmail: body.data.customer_email,
    customerDoc:   body.data.customer_doc,
    notes:         body.data.notes,
  });

  if (body.data.activate_now) {
    const activated = await activateLicense(license.id, req.user?.email || 'admin');
    return res.status(201).json({ success: true, data: activated });
  }

  return res.status(201).json({ success: true, data: license });
});

// POST /api/admin/licenses/:id/activate — manual activation
licenseAdminRouter.post('/licenses/:id/activate', async (req: Request, res: Response) => {
  const license = await activateLicense(req.params.id, req.user?.email || 'admin');
  return res.json({ success: true, data: license });
});

// POST /api/admin/licenses/:id/revoke
licenseAdminRouter.post('/licenses/:id/revoke', async (req: Request, res: Response) => {
  const { reason } = req.body;
  await revokeLicense(req.params.id, reason || 'Admin revocation', req.user?.email || 'admin');
  return res.json({ success: true, message: 'License revoked' });
});

// POST /api/admin/licenses/:id/confirm-payment — manually confirm PIX payment
licenseAdminRouter.post('/licenses/:id/confirm-payment', async (req: Request, res: Response) => {
  const license = await db.queryOne<{ id: string; status: string }>(
    'SELECT id, status FROM licenses WHERE id = $1',
    [req.params.id]
  );
  if (!license) throw new AppError('License not found', 404, 'NOT_FOUND');

  // Mark payment as paid
  await db.query(
    `UPDATE pix_payments SET status = 'paid', paid_at = NOW(), updated_at = NOW()
     WHERE license_id = $1 AND status = 'pending'`,
    [req.params.id]
  );

  // Activate license
  const activated = await activateLicense(req.params.id, req.user?.email || 'admin');

  await logEvent(req.params.id, 'payment_confirmed', req.user?.email || 'admin',
    'Payment manually confirmed by admin');

  return res.json({ success: true, data: activated });
});

// DELETE /api/admin/licenses/:id/activations/:machineId — revoke a machine
licenseAdminRouter.delete(
  '/licenses/:id/activations/:machineId',
  async (req: Request, res: Response) => {
    await db.query(
      `UPDATE license_activations SET is_active = false
       WHERE license_id = $1 AND id = $2`,
      [req.params.id, req.params.machineId]
    );
    await db.query(
      `UPDATE licenses SET activations_count = GREATEST(0, activations_count - 1)
       WHERE id = $1`,
      [req.params.id]
    );
    return res.json({ success: true, message: 'Machine deactivated' });
  }
);

// GET /api/admin/licenses/stats — dashboard summary
licenseAdminRouter.get('/stats', async (_req: Request, res: Response) => {
  const [totals, revenue, recent] = await Promise.all([
    db.queryOne<Record<string, string>>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'active')          as active,
         COUNT(*) FILTER (WHERE status = 'pending_payment') as pending,
         COUNT(*) FILTER (WHERE status = 'revoked')         as revoked,
         COUNT(*) FILTER (WHERE status = 'expired')         as expired,
         COUNT(*) as total
       FROM licenses`
    ),
    db.queryOne<{ total: string; month: string }>(
      `SELECT
         COALESCE(SUM(p.price_cents), 0) as total,
         COALESCE(SUM(p.price_cents) FILTER (
           WHERE pp.paid_at >= date_trunc('month', NOW())
         ), 0) as month
       FROM licenses l
       JOIN products p ON p.id = l.product_id
       LEFT JOIN pix_payments pp ON pp.license_id = l.id AND pp.status = 'paid'
       WHERE l.status = 'active'`
    ),
    db.query(
      `SELECT l.license_key, l.customer_email, l.status, l.created_at, p.name as product_name
       FROM licenses l JOIN products p ON p.id = l.product_id
       ORDER BY l.created_at DESC LIMIT 5`
    ),
  ]);

  return res.json({
    success: true,
    data: { totals, revenue, recent },
  });
});

// ═══════════════════════════════════════════════════════════════
// PUBLIC — Checkout flow
// ═══════════════════════════════════════════════════════════════

// GET /api/licenses/products — list active products (public)
licensePublicRouter.get('/products', async (_req: Request, res: Response) => {
  const products = await db.query(
    `SELECT id, name, description, price_cents, currency,
            license_type, duration_days, max_activations
     FROM products WHERE is_active = true ORDER BY price_cents ASC`
  );
  return res.json({ success: true, data: products });
});

// POST /api/licenses/checkout — initiate purchase, get PIX QRCode
licensePublicRouter.post('/checkout', async (req: Request, res: Response) => {
  const schema = z.object({
    product_id:     z.string().uuid(),
    customer_name:  z.string().min(2).max(100),
    customer_email: z.string().email(),
    customer_doc:   z.string().optional(),
  });

  const body = schema.safeParse(req.body);
  if (!body.success) throw new AppError(body.error.errors[0].message, 400, 'VALIDATION_ERROR');

  const product = await db.queryOne<{
    id: string; name: string; price_cents: number; is_active: boolean;
  }>(
    'SELECT id, name, price_cents, is_active FROM products WHERE id = $1',
    [body.data.product_id]
  );

  if (!product || !product.is_active) {
    throw new AppError('Product not found', 404, 'NOT_FOUND');
  }

  // Create license in pending state
  const license = await createLicense({
    productId: body.data.product_id,
    customerName: body.data.customer_name,
    customerEmail: body.data.customer_email,
    customerDoc: body.data.customer_doc,
  });

  // Generate PIX charge
  const pix = await createPixCharge({
    amountCents: product.price_cents,
    customerName: body.data.customer_name,
    customerEmail: body.data.customer_email,
    customerDoc: body.data.customer_doc,
    description: `Licença: ${product.name}`,
    txId: license.id.replace(/-/g, '').slice(0, 25),
  });

  // Save payment record
  const [payment] = await db.query(
    `INSERT INTO pix_payments
       (license_id, amount_cents, pix_type, txid, pix_key,
        qrcode_base64, qrcode_text, gateway, gateway_id,
        expires_at, gateway_payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id, status, expires_at`,
    [
      license.id, product.price_cents,
      pix.gateway === 'static' ? 'static' : 'dynamic',
      pix.txid || null, pix.pix_key,
      pix.qrcode_base64, pix.qrcode_text,
      pix.gateway, pix.gateway_id || null,
      pix.expires_at || null,
      JSON.stringify(pix),
    ]
  );

  return res.status(201).json({
    success: true,
    data: {
      license_id: license.id,
      license_key: license.license_key,
      payment_id: (payment as { id: string }).id,
      product: product.name,
      amount_cents: product.price_cents,
      pix: {
        qrcode_base64: pix.qrcode_base64,
        qrcode_text: pix.qrcode_text,
        expires_at: pix.expires_at,
        gateway: pix.gateway,
      },
    },
  });
});

// GET /api/licenses/status/:licenseId — poll payment status (for checkout page)
licensePublicRouter.get('/status/:licenseId', async (req: Request, res: Response) => {
  const result = await db.queryOne<{
    status: string;
    license_key: string;
    payment_status: string;
    paid_at: string | null;
  }>(
    `SELECT l.status, l.license_key,
            pp.status as payment_status, pp.paid_at
     FROM licenses l
     LEFT JOIN LATERAL (
       SELECT status, paid_at FROM pix_payments
       WHERE license_id = l.id ORDER BY created_at DESC LIMIT 1
     ) pp ON true
     WHERE l.id = $1`,
    [req.params.licenseId]
  );

  if (!result) throw new AppError('Not found', 404, 'NOT_FOUND');

  return res.json({ success: true, data: result });
});

// GET /api/licenses/validate/:key — validate from your software
licensePublicRouter.get('/validate/:key', async (req: Request, res: Response) => {
  const { machine_id, machine_name } = req.query as Record<string, string>;

  const result = await validateLicense(
    req.params.key,
    machine_id,
    machine_name,
    req.ip
  );

  return res.status(result.valid ? 200 : 403).json(result);
});

// POST /api/licenses/validate — same but POST (for sensitive machine IDs)
licensePublicRouter.post('/validate', async (req: Request, res: Response) => {
  const { key, machine_id, machine_name } = req.body;

  if (!key) throw new AppError('License key required', 400, 'VALIDATION_ERROR');

  const result = await validateLicense(key, machine_id, machine_name, req.ip);
  return res.status(result.valid ? 200 : 403).json(result);
});

// ═══════════════════════════════════════════════════════════════
// WEBHOOKS — from payment gateways
// ═══════════════════════════════════════════════════════════════

// POST /api/webhooks/pix/asaas
licenseWebhookRouter.post('/pix/asaas', async (req: Request, res: Response) => {
  const signature = req.headers['asaas-access-token'] as string;
  const rawBody   = JSON.stringify(req.body);

  if (!verifyAsaasWebhook(rawBody, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.body;

  if (event.event === 'PAYMENT_RECEIVED' || event.event === 'PAYMENT_CONFIRMED') {
    const payment = event.payment;
    const externalRef = payment?.externalReference; // our license ID prefix (txId)

    if (!externalRef) return res.json({ received: true });

    // Find payment by gateway ID or txid
    const dbPayment = await db.queryOne<{ id: string; license_id: string }>(
      `SELECT id, license_id FROM pix_payments
       WHERE gateway_id = $1 OR txid = $2
       LIMIT 1`,
      [payment.id, externalRef]
    );

    if (dbPayment) {
      await db.query(
        `UPDATE pix_payments
         SET status = 'paid', paid_at = NOW(),
             end_to_end_id = $2, updated_at = NOW()
         WHERE id = $1`,
        [dbPayment.id, payment.pixTransaction?.endToEndIdentifier || null]
      );

      await activateLicense(dbPayment.license_id, 'webhook:asaas');
    }
  }

  return res.json({ received: true });
});

// POST /api/webhooks/pix/efipay
licenseWebhookRouter.post('/pix/efipay', async (req: Request, res: Response) => {
  const notifications = req.body?.pix || [];

  for (const pix of notifications) {
    if (!pix.txid) continue;

    const dbPayment = await db.queryOne<{ id: string; license_id: string }>(
      `SELECT id, license_id FROM pix_payments WHERE txid = $1`,
      [pix.txid]
    );

    if (dbPayment) {
      await db.query(
        `UPDATE pix_payments
         SET status = 'paid', paid_at = $2, end_to_end_id = $3, updated_at = NOW()
         WHERE id = $1`,
        [dbPayment.id, pix.horario, pix.endToEndId || null]
      );

      await activateLicense(dbPayment.license_id, 'webhook:efipay');
    }
  }

  return res.json({ received: true });
});
