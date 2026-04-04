import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../config/database';
import { generateTokens, authenticate } from '../middleware/auth';
import { AppError } from '../utils/AppError';

export const authRouter = Router();

// ── Validation schemas ─────────────────────────────────
const RegisterSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(72),
  tenantName: z.string().min(2).max(100).optional(),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// ── POST /api/auth/register ────────────────────────────
authRouter.post('/register', async (req: Request, res: Response) => {
  const body = RegisterSchema.safeParse(req.body);
  if (!body.success) {
    throw new AppError(body.error.errors[0].message, 400, 'VALIDATION_ERROR');
  }

  const { name, email, password, tenantName } = body.data;

  const existing = await db.queryOne(
    'SELECT id FROM users WHERE email = $1',
    [email]
  );
  if (existing) {
    throw new AppError('Email already in use', 409, 'EMAIL_CONFLICT');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  return db.transaction(async (client) => {
    // Create tenant for this user (each user starts with their own tenant)
    const slug = tenantName
      ? tenantName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      : email.split('@')[0];

    const tenantResult = await client.query<{ id: string }>(
      `INSERT INTO tenants (name, slug, plan)
       VALUES ($1, $2, 'free')
       RETURNING id`,
      [tenantName || `${name}'s Workspace`, slug]
    );
    const tenant = tenantResult.rows[0];

    const userResult = await client.query<{ id: string }>(
      `INSERT INTO users (tenant_id, email, password_hash, name, role)
       VALUES ($1, $2, $3, $4, 'admin')
       RETURNING id`,
      [tenant.id, email, passwordHash, name]
    );
    const user = userResult.rows[0];

    const tokens = generateTokens({
      sub: user.id,
      tenantId: tenant.id,
      email,
      role: 'admin',
      plan: 'free',
    });

    return res.status(201).json({
      success: true,
      data: {
        user: { id: user.id, name, email, role: 'admin' },
        tenant: { id: tenant.id, slug, plan: 'free' },
        ...tokens,
      },
    });
  });
});

// ── POST /api/auth/login ───────────────────────────────
authRouter.post('/login', async (req: Request, res: Response) => {
  const body = LoginSchema.safeParse(req.body);
  if (!body.success) {
    throw new AppError(body.error.errors[0].message, 400, 'VALIDATION_ERROR');
  }

  const { email, password } = body.data;

  const user = await db.queryOne<{
    id: string;
    password_hash: string;
    name: string;
    role: string;
    is_active: boolean;
    tenant_id: string;
  }>(
    `SELECT u.id, u.password_hash, u.name, u.role, u.is_active, u.tenant_id
     FROM users u WHERE u.email = $1`,
    [email]
  );

  if (!user || !await bcrypt.compare(password, user.password_hash)) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  if (!user.is_active) {
    throw new AppError('Account disabled', 403, 'ACCOUNT_DISABLED');
  }

  const tenant = await db.queryOne<{ plan: string; slug: string }>(
    'SELECT plan, slug FROM tenants WHERE id = $1',
    [user.tenant_id]
  );

  // Update last login
  await db.query(
    'UPDATE users SET last_login_at = NOW() WHERE id = $1',
    [user.id]
  );

  const tokens = generateTokens({
    sub: user.id,
    tenantId: user.tenant_id,
    email,
    role: user.role,
    plan: tenant?.plan || 'free',
  });

  return res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        name: user.name,
        email,
        role: user.role,
      },
      tenant: {
        id: user.tenant_id,
        slug: tenant?.slug,
        plan: tenant?.plan,
      },
      ...tokens,
    },
  });
});

// ── GET /api/auth/me ───────────────────────────────────
authRouter.get('/me', authenticate, async (req: Request, res: Response) => {
  const user = await db.queryOne<{
    id: string;
    name: string;
    email: string;
    role: string;
    created_at: string;
  }>(
    'SELECT id, name, email, role, created_at FROM users WHERE id = $1',
    [req.user!.sub]
  );

  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  const tenant = await db.queryOne<{ id: string; name: string; slug: string; plan: string }>(
    'SELECT id, name, slug, plan FROM tenants WHERE id = $1',
    [req.user!.tenantId]
  );

  return res.json({
    success: true,
    data: { user, tenant },
  });
});

// ── POST /api/auth/logout ──────────────────────────────
authRouter.post('/logout', authenticate, async (_req: Request, res: Response) => {
  // In production: invalidate refresh token in DB/Redis
  return res.json({ success: true, message: 'Logged out successfully' });
});
