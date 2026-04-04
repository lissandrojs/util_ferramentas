import { db } from '../config/database';
import { generateLicenseKey } from '../utils/licenseUtils';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';

export type LicenseStatus =
  | 'pending_payment'
  | 'active'
  | 'expired'
  | 'revoked'
  | 'suspended';

export interface License {
  id: string;
  license_key: string;
  product_id: string;
  product_name?: string;
  product_price_cents?: number;
  customer_name: string;
  customer_email: string;
  customer_doc?: string;
  status: LicenseStatus;
  max_activations: number;
  activations_count: number;
  activated_at?: string;
  expires_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ValidationResult {
  valid: boolean;
  license?: {
    key: string;
    status: LicenseStatus;
    product: string;
    customer: string;
    expires_at?: string;
    activations_used: number;
    activations_max: number;
  };
  error?: string;
  code?: string;
}

// ── Create a new pending license ─────────────────────────────────
export async function createLicense(params: {
  productId: string;
  customerName: string;
  customerEmail: string;
  customerDoc?: string;
  notes?: string;
}): Promise<License> {
  const product = await db.queryOne<{ id: string; max_activations: number; duration_days?: number }>(
    'SELECT id, max_activations, duration_days FROM products WHERE id = $1 AND is_active = true',
    [params.productId]
  );

  if (!product) {
    throw new AppError('Product not found or inactive', 404, 'PRODUCT_NOT_FOUND');
  }

  let key: string;
  let attempts = 0;
  do {
    key = generateLicenseKey();
    const exists = await db.queryOne('SELECT id FROM licenses WHERE license_key = $1', [key]);
    if (!exists) break;
    attempts++;
  } while (attempts < 5);

  const [license] = await db.query<License>(
    `INSERT INTO licenses
       (license_key, product_id, customer_name, customer_email,
        customer_doc, status, max_activations, notes)
     VALUES ($1, $2, $3, $4, $5, 'pending_payment', $6, $7)
     RETURNING *`,
    [
      key,
      params.productId,
      params.customerName,
      params.customerEmail,
      params.customerDoc || null,
      product.max_activations,
      params.notes || null,
    ]
  );

  await logEvent(license.id, 'created', 'system',
    `License created for ${params.customerEmail}`);

  return license;
}

// ── Activate a license after payment confirmed ───────────────────
export async function activateLicense(
  licenseId: string,
  actor: string = 'system'
): Promise<License> {
  const license = await db.queryOne<License & { duration_days?: number }>(
    `SELECT l.*, p.duration_days
     FROM licenses l
     JOIN products p ON p.id = l.product_id
     WHERE l.id = $1`,
    [licenseId]
  );

  if (!license) throw new AppError('License not found', 404, 'NOT_FOUND');

  if (license.status === 'active') return license;

  if (license.status === 'revoked') {
    throw new AppError('This license has been revoked', 403, 'LICENSE_REVOKED');
  }

  const expiresAt = license.duration_days
    ? new Date(Date.now() + license.duration_days * 24 * 60 * 60 * 1000)
    : null;

  const [updated] = await db.query<License>(
    `UPDATE licenses
     SET status = 'active',
         activated_at = NOW(),
         expires_at = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [licenseId, expiresAt]
  );

  await logEvent(licenseId, 'activated', actor,
    `License activated${expiresAt ? ` — expires ${expiresAt.toLocaleDateString('pt-BR')}` : ' (perpetual)'}`);

  logger.info(`✅ License activated — id: ${licenseId}, key: ${updated.license_key}, by: ${actor}`);
  return updated;
}

// ── Validate a license key (called by your software) ────────────
export async function validateLicense(
  licenseKey: string,
  machineId?: string,
  machineName?: string,
  ipAddress?: string
): Promise<ValidationResult> {
  const license = await db.queryOne<License & { product_name: string }>(
    `SELECT l.*, p.name as product_name
     FROM licenses l
     JOIN products p ON p.id = l.product_id
     WHERE l.license_key = $1`,
    [licenseKey.toUpperCase().trim()]
  );

  if (!license) {
    return { valid: false, error: 'Licença não encontrada', code: 'NOT_FOUND' };
  }

  if (license.status === 'pending_payment') {
    return { valid: false, error: 'Aguardando pagamento', code: 'PENDING_PAYMENT' };
  }

  if (license.status === 'revoked') {
    return { valid: false, error: 'Licença revogada', code: 'REVOKED' };
  }

  if (license.status === 'suspended') {
    return { valid: false, error: 'Licença suspensa', code: 'SUSPENDED' };
  }

  if (license.expires_at && new Date(license.expires_at) < new Date()) {
    // Auto-expire
    await db.query(
      `UPDATE licenses SET status = 'expired', updated_at = NOW() WHERE id = $1`,
      [license.id]
    );
    await logEvent(license.id, 'expired', 'system', 'License auto-expired');
    return { valid: false, error: 'Licença expirada', code: 'EXPIRED' };
  }

  // ── Machine activation tracking ────────────────────────────
  if (machineId) {
    const existing = await db.queryOne(
      `SELECT id, is_active FROM license_activations
       WHERE license_id = $1 AND machine_id = $2`,
      [license.id, machineId]
    );

    if (!existing) {
      // New machine — check activation limit
      const activeCount = await db.queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM license_activations
         WHERE license_id = $1 AND is_active = true`,
        [license.id]
      );

      if (parseInt(activeCount?.count || '0') >= license.max_activations) {
        return {
          valid: false,
          error: `Limite de ${license.max_activations} ativação(ões) atingido`,
          code: 'MAX_ACTIVATIONS_REACHED',
        };
      }

      // Register new machine
      await db.query(
        `INSERT INTO license_activations
           (license_id, machine_id, machine_name, ip_address)
         VALUES ($1, $2, $3, $4)`,
        [license.id, machineId, machineName || null, ipAddress || null]
      );

      await db.query(
        `UPDATE licenses SET activations_count = activations_count + 1 WHERE id = $1`,
        [license.id]
      );

      await logEvent(license.id, 'validated', machineName || machineId,
        `New machine activated: ${machineName || machineId}`);

    } else if (!(existing as { is_active: boolean }).is_active) {
      return {
        valid: false,
        error: 'Esta máquina foi desativada para esta licença',
        code: 'MACHINE_DEACTIVATED',
      };
    } else {
      // Update last seen
      await db.query(
        `UPDATE license_activations SET last_seen_at = NOW()
         WHERE license_id = $1 AND machine_id = $2`,
        [license.id, machineId]
      );
    }
  }

  return {
    valid: true,
    license: {
      key: license.license_key,
      status: license.status,
      product: license.product_name,
      customer: license.customer_name,
      expires_at: license.expires_at,
      activations_used: license.activations_count,
      activations_max: license.max_activations,
    },
  };
}

// ── Revoke a license ─────────────────────────────────────────────
export async function revokeLicense(
  licenseId: string,
  reason: string,
  actor: string
): Promise<void> {
  await db.query(
    `UPDATE licenses SET status = 'revoked', notes = $2, updated_at = NOW()
     WHERE id = $1`,
    [licenseId, reason]
  );
  await logEvent(licenseId, 'revoked', actor, `Revoked: ${reason}`);
}

// ── Helper: log license event ────────────────────────────────────
export async function logEvent(
  licenseId: string,
  eventType: string,
  actor: string,
  description?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await db.query(
    `INSERT INTO license_events (license_id, event_type, actor, description, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [licenseId, eventType, actor, description || null, JSON.stringify(metadata || {})]
  ).catch((err) => logger.error(err, 'Failed to log license event'));
}
