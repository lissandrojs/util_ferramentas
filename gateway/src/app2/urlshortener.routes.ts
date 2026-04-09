import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import QRCode from 'qrcode';
import { z } from 'zod';
import { logger } from '../utils/logger';

// ── Reuse gateway DB pool ──────────────────────────────────
import { db } from '../config/database';

// ── Nanoid for short slugs ─────────────────────────────────
function nanoid(size = 7): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const array = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export const urlShortenerRouter = Router();

// ── DB migrations (called once at startup) ─────────────────
export async function migrateUrlShortener(): Promise<void> {
  await db.query(`
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
      clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_short_links_slug      ON short_links(slug);
    CREATE INDEX IF NOT EXISTS idx_short_links_tenant_id ON short_links(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_link_clicks_link_id   ON link_clicks(link_id);
  `);
  logger.info('✅ URL shortener tables ready');
}

// ── Helper: get base URL ───────────────────────────────────
function getBaseUrl(req: Request): string {
  return process.env.BASE_URL
    || process.env.ALLOWED_ORIGINS?.split(',')[0]
    || `${req.protocol}://${req.get('host')}`;
}

const CreateLinkSchema = z.object({
  url:        z.string().url('Must be a valid URL'),
  title:      z.string().max(255).optional(),
  customSlug: z.string().regex(/^[a-zA-Z0-9_-]{3,20}$/).optional(),
  expiresAt:  z.string().datetime().optional(),
});

// ── GET /api/app2/links ─────────────────────────────────────
urlShortenerRouter.get('/links', async (req: Request, res: Response) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(401).json({ error: 'Not authenticated' });

  const page   = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit  = Math.min(50, parseInt(req.query.limit as string) || 20);
  const offset = (page - 1) * limit;

  const [links, total] = await Promise.all([
    db.query<{ id: string; slug: string; original_url: string; title: string; click_count: number; expires_at: string; is_active: boolean; created_at: string }>(
      `SELECT id, slug, original_url, title, click_count, expires_at, is_active, created_at
       FROM short_links WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset]
    ),
    db.queryOne<{ count: string }>('SELECT COUNT(*) as count FROM short_links WHERE tenant_id = $1', [tenantId]),
  ]);

  const baseUrl = getBaseUrl(req);
  return res.json({
    success: true,
    data: links.map(l => ({ ...l, shortUrl: `${baseUrl}/r/${l.slug}` })),
    pagination: {
      page, limit,
      total: parseInt(total?.count || '0'),
      totalPages: Math.ceil(parseInt(total?.count || '0') / limit),
    },
  });
});

// ── POST /api/app2/links ────────────────────────────────────
urlShortenerRouter.post('/links', async (req: Request, res: Response) => {
  const tenantId = req.user?.tenantId;
  const userId   = req.user?.sub;
  const plan     = req.user?.plan || 'free';
  if (!tenantId) return res.status(401).json({ error: 'Not authenticated' });

  if (plan === 'free') {
    const count = await db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM short_links
       WHERE tenant_id = $1 AND created_at >= date_trunc('month', NOW())`,
      [tenantId]
    );
    if (parseInt(count?.count || '0') >= 50) {
      return res.status(429).json({ error: 'Monthly limit of 50 links reached on Free plan', code: 'PLAN_LIMIT_EXCEEDED' });
    }
  }

  const body = CreateLinkSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.errors[0].message });

  const { url, title, customSlug, expiresAt } = body.data;
  const slug = customSlug || nanoid(7);

  try {
    const [link] = await db.query(
      `INSERT INTO short_links (tenant_id, user_id, slug, original_url, title, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [tenantId, userId || null, slug, url, title || null, expiresAt || null]
    );
    const baseUrl = getBaseUrl(req);
    return res.status(201).json({ success: true, data: { ...link, shortUrl: `${baseUrl}/r/${slug}` } });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') {
      return res.status(409).json({ error: 'That custom slug is already taken' });
    }
    throw err;
  }
});

// ── GET /api/app2/links/:id/analytics ──────────────────────
urlShortenerRouter.get('/links/:id/analytics', async (req: Request, res: Response) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(401).json({ error: 'Not authenticated' });

  const link = await db.queryOne('SELECT * FROM short_links WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]);
  if (!link) return res.status(404).json({ error: 'Link not found' });

  const clicks = await db.query(
    `SELECT date_trunc('day', clicked_at) as day, COUNT(*) as count
     FROM link_clicks WHERE link_id = $1
     GROUP BY day ORDER BY day DESC LIMIT 30`,
    [req.params.id]
  );

  return res.json({ success: true, data: { link, clicks, totalClicks: (link as { click_count: number }).click_count } });
});

// ── GET /api/app2/links/:id/qr ──────────────────────────────
urlShortenerRouter.get('/links/:id/qr', async (req: Request, res: Response) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(401).json({ error: 'Not authenticated' });

  const link = await db.queryOne<{ slug: string }>('SELECT slug FROM short_links WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]);
  if (!link) return res.status(404).json({ error: 'Link not found' });

  const baseUrl = getBaseUrl(req);
  const shortUrl = `${baseUrl}/r/${link.slug}`;
  const qr = await QRCode.toDataURL(shortUrl, { width: 300, margin: 2 });

  return res.json({ success: true, data: { qr, shortUrl } });
});

// ── DELETE /api/app2/links/:id ──────────────────────────────
urlShortenerRouter.delete('/links/:id', async (req: Request, res: Response) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(401).json({ error: 'Not authenticated' });
  await db.query('DELETE FROM short_links WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]);
  return res.json({ success: true });
});

// ── Public redirect: GET /r/:slug ───────────────────────────
// Mounted at root level (not under /api/app2)
export const redirectRouter = Router();

redirectRouter.get('/r/:slug', async (req: Request, res: Response) => {
  const link = await db.queryOne<{
    id: string; original_url: string; expires_at: string;
    is_active: boolean; tenant_id: string;
  }>('SELECT id, original_url, expires_at, is_active, tenant_id FROM short_links WHERE slug = $1', [req.params.slug]);

  if (!link || !link.is_active) return res.status(404).send('Link not found');
  if (link.expires_at && new Date(link.expires_at) < new Date()) return res.status(410).send('Link expired');

  setImmediate(async () => {
    await db.query('UPDATE short_links SET click_count = click_count + 1 WHERE id = $1', [link.id]);
    await db.query(
      'INSERT INTO link_clicks (link_id, tenant_id, referrer, user_agent) VALUES ($1, $2, $3, $4)',
      [link.id, link.tenant_id, req.headers.referer || null, req.headers['user-agent'] || null]
    );
  });

  return res.redirect(301, link.original_url);
});
