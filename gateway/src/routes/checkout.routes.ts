import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { authenticate, requireRole, generateTokens } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import bcrypt from 'bcryptjs';
import { logger } from '../utils/logger';
import { sendWelcomeEmail } from '../services/email.service';

export const checkoutRouter = Router();    // public
export const adminCheckoutRouter = Router(); // admin only
adminCheckoutRouter.use(authenticate, requireRole('admin'));

// ── Plans definition ──────────────────────────────────────
export const PLANS = {
  free: {
    key: 'free',
    name: 'Gratuito',
    price_cents: 0,
    description: 'Para começar',
    apps: ['app4', 'app5'],
    features: [
      'Download de vídeos (App4)',
      'Conversor JSON↔Excel (App5)',
      'Sem limite de uso',
    ],
  },
  pro: {
    key: 'pro',
    name: 'Pro',
    price_cents: parseInt(process.env.PRO_PLAN_PRICE_CENTS || '2990'), // R$29,90
    description: 'Acesso completo',
    apps: ['app2', 'app3', 'app4', 'app5'],
    features: [
      'Tudo do plano Gratuito',
      'Encurtador de Links (App2)',
      'Gerenciador de Dados (App3)',
      'Suporte prioritário',
    ],
  },
};

// ── GET /api/checkout/plans — public ─────────────────────
checkoutRouter.get('/plans', (_req: Request, res: Response) => {
  return res.json({ success: true, data: Object.values(PLANS) });
});

// ── POST /api/checkout/request — submit purchase intent ──
// User fills form → gets shown QR Code → marks as sent
const RequestSchema = z.object({
  name:  z.string().min(2).max(100),
  email: z.string().email(),
  plan:  z.enum(['pro']),    // only pro is purchaseable; free is automatic
});

checkoutRouter.post('/request', async (req: Request, res: Response) => {
  const body = RequestSchema.safeParse(req.body);
  if (!body.success) throw new AppError(body.error.errors[0].message, 400, 'VALIDATION_ERROR');

  const { name, email, plan } = body.data;
  const planDef = PLANS[plan];

  // Check if already has a pending/approved request
  const existing = await db.queryOne<{ status: string }>(
    `SELECT status FROM purchase_requests WHERE email = $1 AND status IN ('pending_payment','payment_sent','approved')`,
    [email]
  );
  if (existing?.status === 'approved') {
    return res.status(409).json({ success: false, error: 'Este email já possui uma conta ativa. Faça login.' });
  }
  if (existing?.status === 'payment_sent') {
    return res.status(409).json({ success: false, error: 'Você já enviou o pagamento. Aguarde a aprovação do admin.' });
  }

  // Generate a short txid for payment identification (e.g. "UTL-A3F2")
  const txid = 'UTL-' + Math.random().toString(36).toUpperCase().slice(2, 6);

  // Upsert purchase request
  await db.query(
    `INSERT INTO purchase_requests (name, email, plan, amount_cents, status, pix_txid)
     VALUES ($1, $2, $3, $4, 'pending_payment', $5)
     ON CONFLICT DO NOTHING`,
    [name, email, plan, planDef.price_cents, txid]
  );

  const pix_key = process.env.PIX_KEY || '';
  // Always serve from /pix-qrcode.png in gateway/public/
  // Just drop your bank's QR code image there with that filename
  const pix_static_image = '/pix-qrcode.png';

  return res.json({
    success: true,
    data: {
      txid,
      amount_cents: planDef.price_cents,
      amount_brl:   (planDef.price_cents / 100).toFixed(2),
      pix_key,
      pix_static_image,
      plan: planDef.name,
      instructions: `Faça o PIX de R$${(planDef.price_cents / 100).toFixed(2)} para a chave abaixo. Use "${txid}" como descrição/identificador. Após o pagamento clique em "Já paguei".`,
    },
  });
});

// ── POST /api/checkout/confirm-payment — user marks as paid
checkoutRouter.post('/confirm-payment', async (req: Request, res: Response) => {
  const { txid, email } = z.object({ txid: z.string(), email: z.string().email() }).parse(req.body);

  const found = await db.queryOne<{ id: string; status: string }>(
    'SELECT id, status FROM purchase_requests WHERE pix_txid = $1 AND email = $2',
    [txid, email]
  );
  if (!found) throw new AppError('Solicitação não encontrada', 404, 'NOT_FOUND');
  if (found.status === 'approved') return res.json({ success: true, message: 'Conta já aprovada! Faça login.' });
  if (found.status === 'payment_sent') return res.json({ success: true, message: 'Pagamento já registrado. Aguarde aprovação.' });

  await db.query(
    `UPDATE purchase_requests SET status = 'payment_sent', updated_at = NOW() WHERE id = $1`,
    [found.id]
  );

  logger.info(`Payment confirmed by user: ${email} txid=${txid}`);
  return res.json({ success: true, message: 'Pagamento registrado! O admin irá verificar e liberar seu acesso em até 24h.' });
});

// ── GET /api/checkout/status?email= — check approval status
checkoutRouter.get('/status', async (req: Request, res: Response) => {
  const email = req.query.email as string;
  if (!email) throw new AppError('email obrigatório', 400, 'VALIDATION_ERROR');

  const request = await db.queryOne<{ status: string; plan: string }>(
    'SELECT status, plan FROM purchase_requests WHERE email = $1 ORDER BY created_at DESC LIMIT 1',
    [email]
  );

  return res.json({
    success: true,
    data: {
      status: request?.status || 'none',
      plan:   request?.plan   || null,
      message: {
        none:            'Nenhuma solicitação encontrada',
        pending_payment: 'Aguardando pagamento',
        payment_sent:    'Pagamento enviado — aguardando aprovação do admin',
        approved:        'Aprovado! Faça login com as credenciais enviadas por email',
        rejected:        'Solicitação rejeitada. Entre em contato pelo suporte.',
      }[request?.status || 'none'] || 'Status desconhecido',
    },
  });
});

// ═════════════════════════════════════════════════════════
// ADMIN ROUTES
// ═════════════════════════════════════════════════════════

// ── GET /api/admin/checkout/requests — list all pending ──
adminCheckoutRouter.get('/requests', async (_req: Request, res: Response) => {
  const requests = await db.query(
    `SELECT id, name, email, plan, amount_cents, status, pix_txid, admin_notes, approved_by, approved_at, created_at, updated_at
     FROM purchase_requests
     ORDER BY
       CASE status
         WHEN 'payment_sent'    THEN 1
         WHEN 'pending_payment' THEN 2
         WHEN 'approved'        THEN 3
         WHEN 'rejected'        THEN 4
       END,
       created_at DESC`
  );
  return res.json({ success: true, data: requests });
});

// ── POST /api/admin/checkout/approve/:id ─────────────────
// Creates the user account + tenant, sends credentials
adminCheckoutRouter.post('/approve/:id', async (req: Request, res: Response) => {
  const request = await db.queryOne<{
    id: string; name: string; email: string; plan: string; status: string;
  }>('SELECT * FROM purchase_requests WHERE id = $1', [req.params.id]);

  if (!request) throw new AppError('Solicitação não encontrada', 404, 'NOT_FOUND');
  if (request.status === 'approved') throw new AppError('Já aprovada', 409, 'ALREADY_APPROVED');

  // Admin can optionally set a custom password, else auto-generate
  const customPassword = req.body.password as string | undefined;
  const password = customPassword || generatePassword();
  const passwordHash = await bcrypt.hash(password, 12);

  await db.transaction(async (client) => {
    // Create tenant
    const slug = request.email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase() + '-' + Date.now().toString(36);
    const tenantRows = await client.query<{ id: string }>(
      `INSERT INTO tenants (name, slug, plan) VALUES ($1, $2, $3) RETURNING id`,
      [`${request.name}'s Workspace`, slug, request.plan]
    );
    const tenantId1 = tenantRows.rows[0].id;

    // Create user
    await client.query(
      `INSERT INTO users (tenant_id, email, password_hash, name, role) VALUES ($1, $2, $3, $4, 'admin')`,
      [tenantId1, request.email, passwordHash, request.name]
    );

    // Mark as approved
    await client.query(
      `UPDATE purchase_requests
       SET status = 'approved', approved_by = $1, approved_at = NOW(), admin_notes = $2, updated_at = NOW()
       WHERE id = $3`,
      [req.user!.email, req.body.notes || null, request.id]
    );
  });

  logger.info(`Purchase approved: ${request.email} plan=${request.plan} by ${req.user!.email}`);

  // Send welcome email with credentials (fire and forget — don't block response)
  sendWelcomeEmail({
    to:       request.email,
    name:     request.name,
    password,
    plan:     request.plan,
    loginUrl: `${process.env.SITE_URL || ''}/app1`,
  }).catch(err => logger.error('Welcome email failed: ' + err.message));

  return res.json({
    success: true,
    message: `Conta criada para ${request.email}`,
    data: {
      email:    request.email,
      password,
      plan:     request.plan,
    },
  });
});

// ── POST /api/admin/checkout/reject/:id ──────────────────
adminCheckoutRouter.post('/reject/:id', async (req: Request, res: Response) => {
  const { notes } = z.object({ notes: z.string().optional() }).parse(req.body);

  await db.query(
    `UPDATE purchase_requests
     SET status = 'rejected', admin_notes = $1, approved_by = $2, updated_at = NOW()
     WHERE id = $3`,
    [notes || null, req.user!.email, req.params.id]
  );

  return res.json({ success: true, message: 'Solicitação rejeitada' });
});

// ── GET /api/admin/plans — list plan/app config ───────────
adminCheckoutRouter.get('/plans', async (_req: Request, res: Response) => {
  const planApps = await db.query('SELECT * FROM plan_apps ORDER BY plan, app_key');
  return res.json({ success: true, data: planApps, plans: PLANS });
});

// ── PATCH /api/admin/plans/:plan/:appKey — toggle access ─
adminCheckoutRouter.patch('/plans/:plan/:appKey', async (req: Request, res: Response) => {
  const { can_access } = z.object({ can_access: z.boolean() }).parse(req.body);
  await db.query(
    `INSERT INTO plan_apps (plan, app_key, can_access)
     VALUES ($1, $2, $3)
     ON CONFLICT (plan, app_key) DO UPDATE SET can_access = $3`,
    [req.params.plan, req.params.appKey, can_access]
  );
  return res.json({ success: true });
});

// ── PATCH /api/admin/tenants/:id/plan — upgrade/downgrade a tenant
adminCheckoutRouter.patch('/tenants/:id/plan', async (req: Request, res: Response) => {
  const { plan } = z.object({ plan: z.enum(['free', 'pro', 'enterprise']) }).parse(req.body);
  await db.query('UPDATE tenants SET plan = $1, updated_at = NOW() WHERE id = $2', [plan, req.params.id]);
  return res.json({ success: true });
});

// ── POST /api/admin/create-user — create user directly (admin) ─
adminCheckoutRouter.post('/create-user', async (req: Request, res: Response) => {
  const schema = z.object({
    name:     z.string().min(2),
    email:    z.string().email(),
    plan:     z.enum(['free', 'pro', 'enterprise']).default('free'),
    password: z.string().min(6).optional(),
  });
  const body = schema.parse(req.body);

  const existing = await db.queryOne('SELECT id FROM users WHERE email = $1', [body.email]);
  if (existing) throw new AppError('Email já em uso', 409, 'EMAIL_CONFLICT');

  const password = body.password || generatePassword();
  const passwordHash = await bcrypt.hash(password, 12);
  const slug = body.email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase() + '-' + Date.now().toString(36);

  await db.transaction(async (client) => {
    const tenantRows = await client.query<{ id: string }>(
      `INSERT INTO tenants (name, slug, plan) VALUES ($1, $2, $3) RETURNING id`,
      [`${body.name}'s Workspace`, slug, body.plan]
    );
    const tenantId2 = tenantRows.rows[0].id;
    await client.query(
      `INSERT INTO users (tenant_id, email, password_hash, name, role) VALUES ($1, $2, $3, $4, 'admin')`,
      [tenantId2, body.email, passwordHash, body.name]
    );
  });

  return res.status(201).json({ success: true, data: { email: body.email, password, plan: body.plan } });
});

// ── Helpers ───────────────────────────────────────────────
function generatePassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
