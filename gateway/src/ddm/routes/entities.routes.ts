import { Router, Request, Response } from 'express';
import { z } from 'zod';
import slugify from 'slugify';
import { db } from '../../config/database';

export const entitiesRouter = Router();

const CreateEntitySchema = z.object({
  name:        z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  icon:        z.string().max(50).default('database'),
  color:       z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6c63ff'),
});

// GET /api/entities
entitiesRouter.get('/', async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;

  const entities = await db.query(
    `SELECT e.*,
       (SELECT COUNT(*) FROM entity_fields f WHERE f.entity_type_id = e.id) as field_count
     FROM entity_types e
     WHERE e.tenant_id = $1
     ORDER BY e.created_at DESC`,
    [tenantId]
  );

  return res.json({ success: true, data: entities });
});

// GET /api/entities/:id
entitiesRouter.get('/:id', async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;

  const entity = await db.queryOne(
    'SELECT * FROM entity_types WHERE id = $1 AND tenant_id = $2',
    [req.params.id, tenantId]
  );

  if (!entity) return res.status(404).json({ error: 'Entity type not found' });

  const fields = await db.query(
    'SELECT * FROM entity_fields WHERE entity_type_id = $1 ORDER BY order_index',
    [req.params.id]
  );

  return res.json({ success: true, data: { ...entity, fields } });
});

// POST /api/entities
entitiesRouter.post('/', async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;

  const body = CreateEntitySchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: body.error.errors[0].message });
  }

  const slug = slugify(body.data.name, { lower: true, strict: true });

  const existing = await db.queryOne(
    'SELECT id FROM entity_types WHERE tenant_id = $1 AND slug = $2',
    [tenantId, slug]
  );
  if (existing) {
    return res.status(409).json({ error: 'An entity with this name already exists' });
  }

  const [entity] = await db.query(
    `INSERT INTO entity_types (tenant_id, name, slug, description, icon, color)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [tenantId, body.data.name, slug, body.data.description || null, body.data.icon, body.data.color]
  );

  return res.status(201).json({ success: true, data: entity });
});

// PATCH /api/entities/:id
entitiesRouter.patch('/:id', async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;

  const allowed = ['name', 'description', 'icon', 'color'];
  const updates: string[] = [];
  const values: unknown[] = [];

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates.push(`${key} = $${values.length + 1}`);
      values.push(req.body[key]);
    }
  }

  if (!updates.length) return res.status(400).json({ error: 'No valid fields to update' });

  values.push(req.params.id, tenantId);
  const [entity] = await db.query(
    `UPDATE entity_types SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${values.length - 1} AND tenant_id = $${values.length}
     RETURNING *`,
    values
  );

  if (!entity) return res.status(404).json({ error: 'Entity type not found' });
  return res.json({ success: true, data: entity });
});

// DELETE /api/entities/:id
entitiesRouter.delete('/:id', async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;

  const entity = await db.queryOne(
    'SELECT id FROM entity_types WHERE id = $1 AND tenant_id = $2',
    [req.params.id, tenantId]
  );
  if (!entity) return res.status(404).json({ error: 'Entity type not found' });

  await db.query('DELETE FROM entity_types WHERE id = $1', [req.params.id]);

  return res.json({ success: true, message: 'Entity type deleted' });
});
