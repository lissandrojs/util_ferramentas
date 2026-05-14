import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { logger } from '../utils/logger';

export const habitsRouter   = Router(); // auth required — mounted at /api/habits
export const habitsPublicRouter = Router(); // no auth — public stats

// ── DB Migration (called in bootstrapApp) ─────────────────
export async function migrateHabits(): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS habits (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID NOT NULL,
      tenant_id   UUID NOT NULL,
      title       VARCHAR(120) NOT NULL,
      description TEXT,
      icon        VARCHAR(10)  NOT NULL DEFAULT 'check',
      color       VARCHAR(20)  NOT NULL DEFAULT '#6c63ff',
      frequency   VARCHAR(20)  NOT NULL DEFAULT 'daily',
      target_days INTEGER[]    NOT NULL DEFAULT '{1,2,3,4,5,6,0}',
      is_active   BOOLEAN      NOT NULL DEFAULT true,
      order_index INTEGER      NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      archived_at TIMESTAMPTZ
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS habit_completions (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      habit_id     UUID        NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
      user_id      UUID        NOT NULL,
      completed_on DATE        NOT NULL,
      note         TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (habit_id, completed_on)
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_habits_user       ON habits(user_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_habits_tenant     ON habits(tenant_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_completions_habit ON habit_completions(habit_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_completions_user  ON habit_completions(user_id, completed_on)`);
  logger.info('✅ Habits tables ready');
}

// ── Helpers ────────────────────────────────────────────────
function today(): string {
  return new Date().toISOString().split('T')[0];
}

function dateRange(days: number): string[] {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

async function calcStreak(habitId: string, userId: string): Promise<number> {
  const rows = await db.query<{ completed_on: string }>(
    `SELECT completed_on FROM habit_completions
     WHERE habit_id = $1 AND user_id = $2
     ORDER BY completed_on DESC`,
    [habitId, userId]
  );
  if (!rows.length) return 0;

  const dates = rows.map(r => r.completed_on.toString().split('T')[0]);
  let streak = 0;
  const t = new Date(); t.setHours(0,0,0,0);

  for (let i = 0; i < 365; i++) {
    const check = new Date(t);
    check.setDate(check.getDate() - i);
    const iso = check.toISOString().split('T')[0];
    if (dates.includes(iso)) {
      streak++;
    } else {
      // Allow today not being done yet
      if (i === 0) continue;
      break;
    }
  }
  return streak;
}

// ── GET /api/habits — list habits with today's status + streak
habitsRouter.get('/', async (req: Request, res: Response) => {
  const userId   = req.user!.sub;
  const tenantId = req.user!.tenantId;
  const t        = today();

  const habits = await db.query<{
    id: string; title: string; description: string; icon: string; color: string;
    frequency: string; target_days: number[]; order_index: number; created_at: string;
  }>(
    `SELECT id, title, description, icon, color, frequency, target_days, order_index, created_at
     FROM habits
     WHERE user_id = $1 AND tenant_id = $2 AND is_active = true AND archived_at IS NULL
     ORDER BY order_index, created_at`,
    [userId, tenantId]
  );

  // Batch-load completions for last 30 days
  const since = new Date(); since.setDate(since.getDate() - 29);
  const completions = await db.query<{ habit_id: string; completed_on: string }>(
    `SELECT habit_id, completed_on::text FROM habit_completions
     WHERE user_id = $1 AND completed_on >= $2`,
    [userId, since.toISOString().split('T')[0]]
  );

  const completionMap = new Map<string, Set<string>>();
  for (const c of completions) {
    const key = c.habit_id;
    if (!completionMap.has(key)) completionMap.set(key, new Set());
    completionMap.get(key)!.add(c.completed_on.split('T')[0]);
  }

  const last21 = dateRange(21);

  const result = await Promise.all(habits.map(async (h) => {
    const dones = completionMap.get(h.id) || new Set<string>();
    const streak = await calcStreak(h.id, userId);
    const completedToday = dones.has(t);
    const history = last21.map(d => ({ date: d, done: dones.has(d) }));
    const totalDone = dones.size;

    return { ...h, streak, completedToday, history, totalDone };
  }));

  return res.json({ success: true, data: result });
});

// ── POST /api/habits — create habit ───────────────────────
const CreateSchema = z.object({
  title:       z.string().min(1).max(120),
  description: z.string().max(300).optional(),
  icon:        z.string().max(10).default('✅'),
  color:       z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6c63ff'),
  frequency:   z.enum(['daily', 'weekly']).default('daily'),
  target_days: z.array(z.number().min(0).max(6)).default([0,1,2,3,4,5,6]),
});

habitsRouter.post('/', async (req: Request, res: Response) => {
  const body = CreateSchema.parse(req.body);
  const userId = req.user!.sub;
  const tenantId = req.user!.tenantId;

  const countRow = await db.queryOne<{ count: string }>(
    'SELECT COUNT(*) as count FROM habits WHERE user_id = $1 AND is_active = true AND archived_at IS NULL',
    [userId]
  );
  const orderIndex = parseInt(countRow?.count || '0');

  const [habit] = await db.query(
    `INSERT INTO habits (user_id, tenant_id, title, description, icon, color, frequency, target_days, order_index)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [userId, tenantId, body.title, body.description||null, body.icon, body.color,
     body.frequency, body.target_days, orderIndex]
  );

  return res.status(201).json({ success: true, data: habit });
});

// ── PATCH /api/habits/:id — edit habit ───────────────────
habitsRouter.patch('/:id', async (req: Request, res: Response) => {
  const { title, description, icon, color, frequency, target_days } = req.body;
  const userId = req.user!.sub;

  const [habit] = await db.query(
    `UPDATE habits SET
       title       = COALESCE($1, title),
       description = COALESCE($2, description),
       icon        = COALESCE($3, icon),
       color       = COALESCE($4, color),
       frequency   = COALESCE($5, frequency),
       target_days = COALESCE($6, target_days)
     WHERE id = $7 AND user_id = $8
     RETURNING *`,
    [title||null, description||null, icon||null, color||null,
     frequency||null, target_days||null, req.params.id, userId]
  );

  if (!habit) return res.status(404).json({ error: 'Hábito não encontrado' });
  return res.json({ success: true, data: habit });
});

// ── DELETE /api/habits/:id — archive habit ────────────────
habitsRouter.delete('/:id', async (req: Request, res: Response) => {
  await db.query(
    'UPDATE habits SET archived_at = NOW(), is_active = false WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user!.sub]
  );
  return res.json({ success: true });
});

// ── POST /api/habits/:id/complete — toggle today ──────────
habitsRouter.post('/:id/complete', async (req: Request, res: Response) => {
  const userId  = req.user!.sub;
  const habitId = req.params.id;
  const date    = (req.body.date as string) || today();

  // Verify ownership
  const habit = await db.queryOne<{ id: string }>(
    'SELECT id FROM habits WHERE id = $1 AND user_id = $2',
    [habitId, userId]
  );
  if (!habit) return res.status(404).json({ error: 'Hábito não encontrado' });

  // Toggle: if already done, remove; if not done, add
  const existing = await db.queryOne(
    'SELECT id FROM habit_completions WHERE habit_id = $1 AND user_id = $2 AND completed_on = $3',
    [habitId, userId, date]
  );

  if (existing) {
    await db.query(
      'DELETE FROM habit_completions WHERE habit_id = $1 AND user_id = $2 AND completed_on = $3',
      [habitId, userId, date]
    );
  } else {
    await db.query(
      `INSERT INTO habit_completions (habit_id, user_id, completed_on, note)
       VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [habitId, userId, date, req.body.note || null]
    );
  }

  const streak = await calcStreak(habitId, userId);
  const completedToday = !existing;

  return res.json({ success: true, data: { completedToday, streak, done: !existing } });
});

// ── GET /api/habits/stats — overview stats ────────────────
habitsRouter.get('/stats', async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const t      = today();

  const [totalHabits, doneToday, totalCompletions, bestStreak] = await Promise.all([
    db.queryOne<{ count: string }>('SELECT COUNT(*) as count FROM habits WHERE user_id = $1 AND is_active = true AND archived_at IS NULL', [userId]),
    db.queryOne<{ count: string }>(`SELECT COUNT(DISTINCT habit_id) as count FROM habit_completions WHERE user_id = $1 AND completed_on = $2`, [userId, t]),
    db.queryOne<{ count: string }>('SELECT COUNT(*) as count FROM habit_completions WHERE user_id = $1', [userId]),
    db.queryOne<{ max_streak: string }>(`
      WITH streaks AS (
        SELECT habit_id,
          ROW_NUMBER() OVER (PARTITION BY habit_id ORDER BY completed_on) -
          EXTRACT(DOY FROM completed_on::date)::integer as grp,
          COUNT(*) OVER (PARTITION BY habit_id, ROW_NUMBER() OVER (PARTITION BY habit_id ORDER BY completed_on) - EXTRACT(DOY FROM completed_on::date)::integer) as streak_len
        FROM habit_completions WHERE user_id = $1
      )
      SELECT COALESCE(MAX(streak_len), 0)::text as max_streak FROM streaks
    `, [userId]).catch(() => ({ max_streak: '0' })),
  ]);

  // Last 7 days completion rate
  const last7 = dateRange(7);
  const completions7 = await db.query<{ completed_on: string }>(
    `SELECT DISTINCT completed_on::text FROM habit_completions WHERE user_id = $1 AND completed_on >= $2`,
    [userId, last7[0]]
  );
  const done7 = new Set(completions7.map(r => r.completed_on.split('T')[0]));

  const habits7 = await db.queryOne<{ count: string }>(
    'SELECT COUNT(*) as count FROM habits WHERE user_id = $1 AND is_active = true',
    [userId]
  );
  const totalH = parseInt(habits7?.count || '0');

  const weekChart = last7.map(d => ({
    day:  new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }),
    date: d,
    done: completions7.filter(c => c.completed_on.startsWith(d)).length,
    total: totalH,
  }));

  return res.json({
    success: true,
    data: {
      totalHabits:    parseInt(totalHabits?.count    || '0'),
      doneToday:      parseInt(doneToday?.count      || '0'),
      totalCompletions: parseInt(totalCompletions?.count || '0'),
      bestStreak:     parseInt(bestStreak?.max_streak || '0'),
      weekChart,
    },
  });
});

// ── PATCH /api/habits/reorder ─────────────────────────────
habitsRouter.patch('/reorder', async (req: Request, res: Response) => {
  const { order } = req.body as { order: { id: string; index: number }[] };
  const userId = req.user!.sub;
  await Promise.all(
    order.map(({ id, index }) =>
      db.query('UPDATE habits SET order_index = $1 WHERE id = $2 AND user_id = $3', [index, id, userId])
    )
  );
  return res.json({ success: true });
});
