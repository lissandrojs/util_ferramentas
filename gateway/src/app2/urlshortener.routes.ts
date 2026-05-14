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
  try {
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
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS link_clicks (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        link_id    UUID NOT NULL REFERENCES short_links(id) ON DELETE CASCADE,
        tenant_id  UUID NOT NULL,
        referrer   TEXT,
        user_agent TEXT,
        clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_short_links_slug      ON short_links(slug)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_short_links_tenant_id ON short_links(tenant_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_link_clicks_link_id   ON link_clicks(link_id)`);
    logger.info('✅ URL Shortener tables ready');
  } catch (err) {
    logger.error('migrateUrlShortener error: ' + (err as Error).message);
    throw err;
  }
}


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
