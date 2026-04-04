import 'express-async-errors';
import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { Pool } from 'pg';
import { nanoid } from 'nanoid';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const QRCode = require('qrcode') as typeof import('qrcode');import { z } from 'zod';
import winston from 'winston';

// ── Logger ─────────────────────────────────────────────
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    process.env.NODE_ENV === 'production' ? winston.format.json() : winston.format.simple()
  ),
  transports: [new winston.transports.Console()],
});

// ── Database ───────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS short_links (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id    UUID NOT NULL,
      user_id      UUID,
      slug         VARCHAR(20) UNIQUE NOT NULL,
      original_url TEXT NOT NULL,
      title        VARCHAR(255),
      expires_at   TIMESTAMPTZ,
      is_active    BOOLEAN NOT NULL DEFAULT true,
      click_count  INTEGER NOT NULL DEFAULT 0,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS link_clicks (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      link_id    UUID NOT NULL REFERENCES short_links(id) ON DELETE CASCADE,
      tenant_id  UUID NOT NULL,
      referrer   TEXT,
      user_agent TEXT,
      ip_hash    VARCHAR(64),
      clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_short_links_slug      ON short_links(slug);
    CREATE INDEX IF NOT EXISTS idx_short_links_tenant_id ON short_links(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_link_clicks_link_id   ON link_clicks(link_id);
  `);
  logger.info('✅ URL shortener DB ready');
}

// ── Middleware ─────────────────────────────────────────
function getTenantContext(req: Request): { tenantId: string; userId: string; plan: string } | null {
  const tenantId = req.headers['x-tenant-id'] as string;
  const userId   = req.headers['x-user-id']   as string;
  const plan     = req.headers['x-user-plan']  as string || 'free';
  if (!tenantId) return null;
  return { tenantId, userId, plan };
}

// ── Express app ────────────────────────────────────────
const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }));
app.use(express.json());

// ── Static client files ────────────────────────────────
import path from 'path';
app.use(express.static(path.join(__dirname, '../client/dist')));

// ── Schemas ────────────────────────────────────────────
const CreateLinkSchema = z.object({
  url:       z.string().url('Must be a valid URL'),
  title:     z.string().max(255).optional(),
  customSlug: z.string().regex(/^[a-zA-Z0-9_-]{3,20}$/).optional(),
  expiresAt: z.string().datetime().optional(),
});

// ── Routes ─────────────────────────────────────────────

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'url-shortener' }));

// GET /links — list tenant's links
app.get('/api/links', async (req: Request, res: Response) => {
  const ctx = getTenantContext(req);
  if (!ctx) return res.status(401).json({ error: 'Missing tenant context' });

  const page  = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
  const offset = (page - 1) * limit;

  const [links, countResult] = await Promise.all([
    pool.query(
      `SELECT id, slug, original_url, title, click_count, expires_at, is_active, created_at
       FROM short_links
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [ctx.tenantId, limit, offset]
    ),
    pool.query('SELECT COUNT(*) FROM short_links WHERE tenant_id = $1', [ctx.tenantId]),
  ]);

  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 4001}`;

  return res.json({
    success: true,
    data: links.rows.map((l) => ({ ...l, shortUrl: `${baseUrl}/r/${l.slug}` })),
    pagination: {
      page,
      limit,
      total: parseInt(countResult.rows[0].count),
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
    },
  });
});

// POST /links — create a short link
app.post('/api/links', async (req: Request, res: Response) => {
  const ctx = getTenantContext(req);
  if (!ctx) return res.status(401).json({ error: 'Missing tenant context' });

  // Plan limits
  if (ctx.plan === 'free') {
    const count = await pool.query(
      `SELECT COUNT(*) FROM short_links
       WHERE tenant_id = $1
         AND created_at >= date_trunc('month', NOW())`,
      [ctx.tenantId]
    );
    if (parseInt(count.rows[0].count) >= 50) {
      return res.status(429).json({
        error: 'Monthly limit of 50 links reached on Free plan',
        upgradeUrl: '/app1/billing',
        code: 'PLAN_LIMIT_EXCEEDED',
      });
    }
  }

  const body = CreateLinkSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: body.error.errors[0].message });
  }

  const { url, title, customSlug, expiresAt } = body.data;
  const slug = customSlug || nanoid(7);

  try {
    const result = await pool.query(
      `INSERT INTO short_links (tenant_id, user_id, slug, original_url, title, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [ctx.tenantId, ctx.userId || null, slug, url, title || null, expiresAt || null]
    );

    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 4001}`;
    return res.status(201).json({
      success: true,
      data: { ...result.rows[0], shortUrl: `${baseUrl}/r/${slug}` },
    });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') {
      return res.status(409).json({ error: 'That custom slug is already taken' });
    }
    throw err;
  }
});

// GET /links/:id/analytics — click analytics
app.get('/api/links/:id/analytics', async (req: Request, res: Response) => {
  const ctx = getTenantContext(req);
  if (!ctx) return res.status(401).json({ error: 'Missing tenant context' });

  const link = await pool.query(
    'SELECT * FROM short_links WHERE id = $1 AND tenant_id = $2',
    [req.params.id, ctx.tenantId]
  );
  if (!link.rows[0]) return res.status(404).json({ error: 'Link not found' });

  const clicks = await pool.query(
    `SELECT date_trunc('day', clicked_at) as day, COUNT(*) as count
     FROM link_clicks
     WHERE link_id = $1
     GROUP BY day
     ORDER BY day DESC
     LIMIT 30`,
    [req.params.id]
  );

  return res.json({
    success: true,
    data: {
      link: link.rows[0],
      clicks: clicks.rows,
      totalClicks: link.rows[0].click_count,
    },
  });
});

// GET /links/:id/qr — generate QR code
app.get('/api/links/:id/qr', async (req: Request, res: Response) => {
  const ctx = getTenantContext(req);
  if (!ctx) return res.status(401).json({ error: 'Missing tenant context' });

  const link = await pool.query(
    'SELECT slug FROM short_links WHERE id = $1 AND tenant_id = $2',
    [req.params.id, ctx.tenantId]
  );
  if (!link.rows[0]) return res.status(404).json({ error: 'Link not found' });

  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 4001}`;
  const shortUrl = `${baseUrl}/r/${link.rows[0].slug}`;

  const qr = await QRCode.toDataURL(shortUrl, {
    width: 300,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
  });

  return res.json({ success: true, data: { qr, shortUrl } });
});

// DELETE /links/:id
app.delete('/api/links/:id', async (req: Request, res: Response) => {
  const ctx = getTenantContext(req);
  if (!ctx) return res.status(401).json({ error: 'Missing tenant context' });

  await pool.query(
    'DELETE FROM short_links WHERE id = $1 AND tenant_id = $2',
    [req.params.id, ctx.tenantId]
  );

  return res.json({ success: true });
});

// ── Public redirect — GET /r/:slug ─────────────────────
app.get('/r/:slug', async (req: Request, res: Response) => {
  const { slug } = req.params;

  const link = await pool.query(
    `SELECT id, original_url, expires_at, is_active, tenant_id
     FROM short_links WHERE slug = $1`,
    [slug]
  );

  if (!link.rows[0] || !link.rows[0].is_active) {
    return res.status(404).send('Link not found or inactive');
  }

  const { id, original_url, expires_at, tenant_id } = link.rows[0];

  if (expires_at && new Date(expires_at) < new Date()) {
    return res.status(410).send('This link has expired');
  }

  // Async analytics — don't block redirect
  setImmediate(async () => {
    await pool.query('UPDATE short_links SET click_count = click_count + 1 WHERE id = $1', [id]);
    await pool.query(
      `INSERT INTO link_clicks (link_id, tenant_id, referrer, user_agent)
       VALUES ($1, $2, $3, $4)`,
      [id, tenant_id, req.headers.referer || null, req.headers['user-agent'] || null]
    );
  });

  return res.redirect(301, original_url);
});

// ── SPA fallback ───────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// ── Error handler ──────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Bootstrap ──────────────────────────────────────────
const PORT = process.env.PORT || 4001;

initDb().then(() => {
  app.listen(PORT, () => {
    logger.info(`🔗 URL Shortener running on port ${PORT}`);
  });
}).catch((err) => {
  logger.error('Fatal:', err);
  process.exit(1);
});
