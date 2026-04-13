import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

// ── Public router (bio pages) ─────────────────────────────
export const bioPublicRouter = Router();

// ── Protected router (CRUD) ───────────────────────────────
export const bioRouter = Router();
bioRouter.use(authenticate);

// ── DB migration ──────────────────────────────────────────
export async function migrateBioLink(): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS bio_pages (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id   UUID NOT NULL,
      username    VARCHAR(50) UNIQUE NOT NULL,
      title       VARCHAR(100) NOT NULL DEFAULT 'Minha Bio',
      description TEXT,
      avatar_url  TEXT,
      theme       VARCHAR(30) NOT NULL DEFAULT 'dark',
      bg_color    VARCHAR(20) DEFAULT '#0a0a0f',
      accent_color VARCHAR(20) DEFAULT '#6c63ff',
      is_active   BOOLEAN NOT NULL DEFAULT true,
      total_views INTEGER NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS bio_links (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      page_id     UUID NOT NULL REFERENCES bio_pages(id) ON DELETE CASCADE,
      title       VARCHAR(100) NOT NULL,
      url         TEXT NOT NULL,
      icon        VARCHAR(50) DEFAULT '🔗',
      type        VARCHAR(30) DEFAULT 'link',
      order_index INTEGER NOT NULL DEFAULT 0,
      is_active   BOOLEAN NOT NULL DEFAULT true,
      click_count INTEGER NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS bio_views (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      page_id     UUID NOT NULL REFERENCES bio_pages(id) ON DELETE CASCADE,
      referrer    TEXT,
      user_agent  TEXT,
      viewed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS bio_link_clicks (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      link_id     UUID NOT NULL REFERENCES bio_links(id) ON DELETE CASCADE,
      page_id     UUID NOT NULL,
      referrer    TEXT,
      clicked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_bio_pages_username  ON bio_pages(username);
    CREATE INDEX IF NOT EXISTS idx_bio_pages_tenant    ON bio_pages(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_bio_links_page      ON bio_links(page_id);
    CREATE INDEX IF NOT EXISTS idx_bio_views_page      ON bio_views(page_id);
  `);
  logger.info('✅ Bio Link tables ready');
}

// ── Schemas ───────────────────────────────────────────────
const PageSchema = z.object({
  username:    z.string().min(3).max(50).regex(/^[a-z0-9_-]+$/, 'Apenas letras minúsculas, números, _ e -'),
  title:       z.string().min(1).max(100),
  description: z.string().max(300).optional(),
  avatar_url:  z.string().url().optional().or(z.literal('')),
  theme:       z.enum(['dark','light','gradient','minimal','neon']).default('dark'),
  bg_color:    z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

const LinkSchema = z.object({
  title:       z.string().min(1).max(100),
  url:         z.string().url('URL inválida'),
  icon:        z.string().max(50).optional(),
  type:        z.enum(['link','youtube','instagram','tiktok','twitter','whatsapp','email','phone','spotify','github']).default('link'),
  order_index: z.number().int().min(0).optional(),
  is_active:   z.boolean().optional(),
});

// ─────────────────────────────────────────────────────────
// CRUD ROUTES (protected)
// ─────────────────────────────────────────────────────────

// GET /api/bio/pages — list my pages
bioRouter.get('/pages', async (req: Request, res: Response) => {
  const pages = await db.query(
    `SELECT p.*, COUNT(l.id) as link_count
     FROM bio_pages p
     LEFT JOIN bio_links l ON l.page_id = p.id AND l.is_active = true
     WHERE p.tenant_id = $1
     GROUP BY p.id
     ORDER BY p.created_at DESC`,
    [req.user!.tenantId]
  );
  return res.json({ success: true, data: pages });
});

// POST /api/bio/pages — create page
bioRouter.post('/pages', async (req: Request, res: Response) => {
  const body = PageSchema.safeParse(req.body);
  if (!body.success) throw new AppError(body.error.errors[0].message, 400, 'VALIDATION_ERROR');

  const conflict = await db.queryOne('SELECT id FROM bio_pages WHERE username = $1', [body.data.username]);
  if (conflict) throw new AppError('Este username já está em uso', 409, 'USERNAME_TAKEN');

  const [page] = await db.query(
    `INSERT INTO bio_pages (tenant_id, username, title, description, avatar_url, theme, bg_color, accent_color)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.user!.tenantId, body.data.username, body.data.title,
     body.data.description || null, body.data.avatar_url || null,
     body.data.theme, body.data.bg_color || null, body.data.accent_color || null]
  );
  return res.status(201).json({ success: true, data: page });
});

// GET /api/bio/pages/:id — get page with links
bioRouter.get('/pages/:id', async (req: Request, res: Response) => {
  const page = await db.queryOne(
    'SELECT * FROM bio_pages WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.user!.tenantId]
  );
  if (!page) throw new AppError('Página não encontrada', 404, 'NOT_FOUND');

  const links = await db.query(
    'SELECT * FROM bio_links WHERE page_id = $1 ORDER BY order_index ASC, created_at ASC',
    [req.params.id]
  );
  return res.json({ success: true, data: { ...page, links } });
});

// PATCH /api/bio/pages/:id — update page
bioRouter.patch('/pages/:id', async (req: Request, res: Response) => {
  const existing = await db.queryOne(
    'SELECT id FROM bio_pages WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.user!.tenantId]
  );
  if (!existing) throw new AppError('Página não encontrada', 404, 'NOT_FOUND');

  const body = PageSchema.partial().safeParse(req.body);
  if (!body.success) throw new AppError(body.error.errors[0].message, 400, 'VALIDATION_ERROR');

  if (body.data.username) {
    const conflict = await db.queryOne(
      'SELECT id FROM bio_pages WHERE username = $1 AND id != $2',
      [body.data.username, req.params.id]
    );
    if (conflict) throw new AppError('Username já em uso', 409, 'USERNAME_TAKEN');
  }

  const allowed = ['username','title','description','avatar_url','theme','bg_color','accent_color','is_active'];
  const sets: string[] = ['updated_at = NOW()'];
  const vals: unknown[] = [];
  for (const key of allowed) {
    if (body.data[key as keyof typeof body.data] !== undefined) {
      vals.push(body.data[key as keyof typeof body.data]);
      sets.push(`${key} = $${vals.length}`);
    }
  }
  vals.push(req.params.id);
  const [page] = await db.query(`UPDATE bio_pages SET ${sets.join(',')} WHERE id = $${vals.length} RETURNING *`, vals);
  return res.json({ success: true, data: page });
});

// DELETE /api/bio/pages/:id
bioRouter.delete('/pages/:id', async (req: Request, res: Response) => {
  await db.query('DELETE FROM bio_pages WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user!.tenantId]);
  return res.json({ success: true });
});

// ── LINKS CRUD ────────────────────────────────────────────

// POST /api/bio/pages/:id/links
bioRouter.post('/pages/:id/links', async (req: Request, res: Response) => {
  const page = await db.queryOne('SELECT id FROM bio_pages WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user!.tenantId]);
  if (!page) throw new AppError('Página não encontrada', 404, 'NOT_FOUND');

  const body = LinkSchema.safeParse(req.body);
  if (!body.success) throw new AppError(body.error.errors[0].message, 400, 'VALIDATION_ERROR');

  const countRow = await db.queryOne<{ count: string }>('SELECT COUNT(*) as count FROM bio_links WHERE page_id = $1', [req.params.id]);
  const nextOrder = parseInt(countRow?.count || '0');

  const [link] = await db.query(
    `INSERT INTO bio_links (page_id, title, url, icon, type, order_index)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.params.id, body.data.title, body.data.url,
     body.data.icon || iconForType(body.data.type),
     body.data.type, body.data.order_index ?? nextOrder]
  );
  return res.status(201).json({ success: true, data: link });
});

// PATCH /api/bio/pages/:id/links/:linkId
bioRouter.patch('/pages/:id/links/:linkId', async (req: Request, res: Response) => {
  const page = await db.queryOne('SELECT id FROM bio_pages WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user!.tenantId]);
  if (!page) throw new AppError('Página não encontrada', 404, 'NOT_FOUND');

  const body = LinkSchema.partial().safeParse(req.body);
  if (!body.success) throw new AppError(body.error.errors[0].message, 400, 'VALIDATION_ERROR');

  const allowed = ['title','url','icon','type','order_index','is_active'];
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const key of allowed) {
    if (body.data[key as keyof typeof body.data] !== undefined) {
      vals.push(body.data[key as keyof typeof body.data]);
      sets.push(`${key} = $${vals.length}`);
    }
  }
  if (!sets.length) throw new AppError('Nada para atualizar', 400, 'VALIDATION_ERROR');
  vals.push(req.params.linkId, req.params.id);
  const [link] = await db.query(`UPDATE bio_links SET ${sets.join(',')} WHERE id = $${vals.length - 1} AND page_id = $${vals.length} RETURNING *`, vals);
  return res.json({ success: true, data: link });
});

// DELETE /api/bio/pages/:id/links/:linkId
bioRouter.delete('/pages/:id/links/:linkId', async (req: Request, res: Response) => {
  await db.query('DELETE FROM bio_links WHERE id = $1 AND page_id = $2', [req.params.linkId, req.params.id]);
  return res.json({ success: true });
});

// POST /api/bio/pages/:id/links/reorder
bioRouter.post('/pages/:id/links/reorder', async (req: Request, res: Response) => {
  const page = await db.queryOne('SELECT id FROM bio_pages WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user!.tenantId]);
  if (!page) throw new AppError('Página não encontrada', 404, 'NOT_FOUND');

  const { order } = z.object({ order: z.array(z.object({ id: z.string().uuid(), order_index: z.number() })) }).parse(req.body);
  for (const item of order) {
    await db.query('UPDATE bio_links SET order_index = $1 WHERE id = $2 AND page_id = $3', [item.order_index, item.id, req.params.id]);
  }
  return res.json({ success: true });
});

// ── ANALYTICS ─────────────────────────────────────────────

// GET /api/bio/pages/:id/analytics
bioRouter.get('/pages/:id/analytics', async (req: Request, res: Response) => {
  const page = await db.queryOne<{ id: string; total_views: number }>(
    'SELECT id, total_views FROM bio_pages WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.user!.tenantId]
  );
  if (!page) throw new AppError('Página não encontrada', 404, 'NOT_FOUND');

  const [viewsByDay, topLinks] = await Promise.all([
    db.query(
      `SELECT date_trunc('day', viewed_at) as day, COUNT(*) as views
       FROM bio_views WHERE page_id = $1 AND viewed_at > NOW() - INTERVAL '30 days'
       GROUP BY day ORDER BY day DESC`,
      [req.params.id]
    ),
    db.query(
      `SELECT l.id, l.title, l.url, l.icon, l.type, COUNT(c.id) as clicks
       FROM bio_links l
       LEFT JOIN bio_link_clicks c ON c.link_id = l.id AND c.clicked_at > NOW() - INTERVAL '30 days'
       WHERE l.page_id = $1
       GROUP BY l.id ORDER BY clicks DESC`,
      [req.params.id]
    ),
  ]);

  return res.json({ success: true, data: { total_views: page.total_views, views_by_day: viewsByDay, top_links: topLinks } });
});

// ── CHECK USERNAME ─────────────────────────────────────────
bioRouter.get('/check-username/:username', async (req: Request, res: Response) => {
  const exists = await db.queryOne('SELECT id FROM bio_pages WHERE username = $1', [req.params.username]);
  return res.json({ available: !exists });
});

// ─────────────────────────────────────────────────────────
// PUBLIC PAGE ROUTES
// ─────────────────────────────────────────────────────────

// GET /bio/:username — public bio page (HTML)
bioPublicRouter.get('/:username', async (req: Request, res: Response) => {
  const page = await db.queryOne<{
    id: string; username: string; title: string; description: string;
    avatar_url: string; theme: string; bg_color: string; accent_color: string;
    is_active: boolean; total_views: number;
  }>('SELECT * FROM bio_pages WHERE username = $1 AND is_active = true', [req.params.username]);

  if (!page) {
    res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>Página não encontrada</title></head><body style="font-family:sans-serif;background:#0a0a0f;color:#e8e8f0;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center"><div><h1>404</h1><p style="color:#8888a8">Esta página não existe ou foi desativada.</p><a href="/" style="color:#6c63ff">← Util Ferramentas</a></div></body></html>`);
  }

  const links = await db.query<{
    id: string; title: string; url: string; icon: string; type: string; click_count: number;
  }>('SELECT id, title, url, icon, type, click_count FROM bio_links WHERE page_id = $1 AND is_active = true ORDER BY order_index ASC', [page.id]);

  // Record view async
  setImmediate(async () => {
    await db.query('UPDATE bio_pages SET total_views = total_views + 1 WHERE id = $1', [page.id]);
    await db.query('INSERT INTO bio_views (page_id, referrer, user_agent) VALUES ($1,$2,$3)',
      [page.id, req.headers.referer || null, req.headers['user-agent'] || null]);
  });

  const SITE_URL = process.env.SITE_URL || 'https://util-ferramentas.onrender.com';
  const themes: Record<string, { bg: string; card: string; text: string; sub: string; border: string }> = {
    dark:     { bg: '#0a0a0f', card: '#111118', text: '#e8e8f0', sub: '#8888a8', border: '#2a2a38' },
    light:    { bg: '#f5f5f7', card: '#ffffff', text: '#1a1a2e', sub: '#666680', border: '#e5e5ea' },
    gradient: { bg: 'linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%)', card: 'rgba(255,255,255,.07)', text: '#e8e8f0', sub: '#aaaacc', border: 'rgba(255,255,255,.12)' },
    minimal:  { bg: '#fafafa', card: '#ffffff', text: '#000000', sub: '#666666', border: '#eeeeee' },
    neon:     { bg: '#080810', card: '#10101a', text: '#e0e0ff', sub: '#8888cc', border: '#303050' },
  };
  const t = themes[page.theme] || themes.dark;
  const acc = page.accent_color || '#6c63ff';
  const bg  = page.bg_color ? `background:${page.bg_color}` : `background:${t.bg}`;

  const avatarHtml = page.avatar_url
    ? `<img src="${escHtml(page.avatar_url)}" alt="${escHtml(page.title)}" class="avatar" loading="eager"/>`
    : `<div class="avatar-placeholder">${escHtml(page.title.charAt(0).toUpperCase())}</div>`;

  const linksHtml = links.map(l => `
  <a href="${SITE_URL}/bio-click/${l.id}" class="link-btn" target="_blank" rel="noopener noreferrer" data-id="${l.id}">
    <span class="link-icon">${escHtml(l.icon || '🔗')}</span>
    <span class="link-title">${escHtml(l.title)}</span>
    <span class="link-arrow">↗</span>
  </a>`).join('\n');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  return res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escHtml(page.title)} — Bio Link</title>
<meta name="description" content="${escHtml(page.description || `Links de ${page.title}`)}"/>
<meta property="og:title" content="${escHtml(page.title)}"/>
<meta property="og:description" content="${escHtml(page.description || '')}"/>
${page.avatar_url ? `<meta property="og:image" content="${escHtml(page.avatar_url)}"/>` : ''}
<meta name="twitter:card" content="summary"/>
<link rel="canonical" href="${SITE_URL}/bio/${escHtml(page.username)}"/>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;min-height:100vh;${bg};color:${t.text};display:flex;flex-direction:column;align-items:center;padding:2.5rem 1rem 4rem}
.page{width:100%;max-width:480px;display:flex;flex-direction:column;align-items:center;gap:0}
.avatar{width:88px;height:88px;border-radius:50%;object-fit:cover;border:3px solid ${acc};margin-bottom:1rem}
.avatar-placeholder{width:88px;height:88px;border-radius:50%;background:${acc};display:flex;align-items:center;justify-content:center;font-size:2rem;font-weight:700;color:#fff;margin-bottom:1rem}
h1{font-size:1.3rem;font-weight:700;color:${t.text};margin-bottom:.375rem;text-align:center}
.bio-desc{font-size:.9rem;color:${t.sub};text-align:center;max-width:360px;line-height:1.6;margin-bottom:1.75rem}
.links{width:100%;display:flex;flex-direction:column;gap:.75rem}
.link-btn{display:flex;align-items:center;gap:.75rem;padding:.9rem 1.125rem;background:${t.card};border:1px solid ${t.border};border-radius:14px;color:${t.text};text-decoration:none;font-weight:500;font-size:.95rem;transition:transform .15s,border-color .15s,box-shadow .15s;cursor:pointer}
.link-btn:hover{transform:translateY(-2px);border-color:${acc};box-shadow:0 4px 20px ${acc}33}
.link-icon{font-size:1.25rem;min-width:28px;text-align:center}
.link-title{flex:1}
.link-arrow{color:${t.sub};font-size:.9rem;opacity:.6}
.powered{margin-top:2.5rem;font-size:.75rem;color:${t.sub};opacity:.6;text-align:center}
.powered a{color:${t.sub}}
@media(prefers-reduced-motion:reduce){.link-btn{transition:none}}
</style>
</head>
<body>
<div class="page">
  ${avatarHtml}
  <h1>${escHtml(page.title)}</h1>
  ${page.description ? `<p class="bio-desc">${escHtml(page.description)}</p>` : ''}
  <div class="links">
    ${linksHtml || '<p style="color:' + t.sub + ';text-align:center;padding:2rem 0">Nenhum link ainda.</p>'}
  </div>
  <p class="powered">Criado com <a href="${SITE_URL}" target="_blank" rel="noopener">Util Ferramentas</a></p>
</div>
</body>
</html>`);
});

// GET /bio-click/:linkId — record click and redirect
bioPublicRouter.get('/bio-click/:linkId', async (req: Request, res: Response) => {
  const link = await db.queryOne<{ url: string; page_id: string }>(
    'SELECT url, page_id FROM bio_links WHERE id = $1 AND is_active = true', [req.params.linkId]
  );
  if (!link) return res.status(404).send('Link não encontrado');

  setImmediate(async () => {
    await db.query('UPDATE bio_links SET click_count = click_count + 1 WHERE id = $1', [req.params.linkId]);
    await db.query('INSERT INTO bio_link_clicks (link_id, page_id, referrer) VALUES ($1,$2,$3)',
      [req.params.linkId, link.page_id, req.headers.referer || null]);
  });

  return res.redirect(301, link.url);
});

// ── Helpers ───────────────────────────────────────────────
function escHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function iconForType(type: string): string {
  const icons: Record<string, string> = {
    youtube: '▶️', instagram: '📷', tiktok: '🎵', twitter: '𝕏',
    whatsapp: '💬', email: '✉️', phone: '📱', spotify: '🎧',
    github: '💻', link: '🔗',
  };
  return icons[type] || '🔗';
}
