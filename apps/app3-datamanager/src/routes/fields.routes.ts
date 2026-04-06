import { Router, Request, Response } from 'express';
import { z } from 'zod';
import slugify from 'slugify';
import { db } from '../database';

export const fieldsRouter = Router({ mergeParams: true });

const FIELD_TYPES = ['string', 'textarea', 'number', 'boolean', 'date', 'file', 'image', 'select'] as const;

const FieldSchema = z.object({
  name:          z.string().min(1).max(100),
  field_key:     z.string().regex(/^[a-z0-9_]+$/).optional(),
  field_type:    z.enum(FIELD_TYPES),
  required:      z.boolean().default(false),
  default_value: z.unknown().optional(),
  options:       z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  validation:    z.object({
    min:       z.number().optional(),
    max:       z.number().optional(),
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
    pattern:   z.string().optional(),
  }).optional(),
  is_searchable:  z.boolean().default(true),
  is_filterable:  z.boolean().default(true),
  show_in_list:   z.boolean().default(true),
  order_index:    z.number().int().default(0),
});

// GET /api/entities/:entityId/fields
fieldsRouter.get('/', async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { entityId } = req.params;

  const entity = await db.queryOne(
    'SELECT id FROM entity_types WHERE id = $1 AND tenant_id = $2',
    [entityId, tenantId]
  );
  if (!entity) return res.status(404).json({ error: 'Entity type not found' });

  const fields = await db.query(
    'SELECT * FROM entity_fields WHERE entity_type_id = $1 ORDER BY order_index',
    [entityId]
  );

  return res.json({ success: true, data: fields });
});

// POST /api/entities/:entityId/fields
fieldsRouter.post('/', async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { entityId } = req.params;

  const entity = await db.queryOne(
    'SELECT id FROM entity_types WHERE id = $1 AND tenant_id = $2',
    [entityId, tenantId]
  );
  if (!entity) return res.status(404).json({ error: 'Entity type not found' });

  const body = FieldSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.errors[0].message });

  const fieldKey = body.data.field_key || slugify(body.data.name, { lower: true, strict: true, replacement: '_' });

  const existing = await db.queryOne(
    'SELECT id FROM entity_fields WHERE entity_type_id = $1 AND field_key = $2',
    [entityId, fieldKey]
  );
  if (existing) return res.status(409).json({ error: `Field key "${fieldKey}" already exists` });

  const [field] = await db.query(
    `INSERT INTO entity_fields
       (entity_type_id, tenant_id, name, field_key, field_type, required,
        default_value, options, validation, is_searchable, is_filterable,
        show_in_list, order_index)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      entityId, tenantId, body.data.name, fieldKey, body.data.field_type,
      body.data.required,
      body.data.default_value !== undefined ? JSON.stringify(body.data.default_value) : null,
      body.data.options ? JSON.stringify(body.data.options) : null,
      body.data.validation ? JSON.stringify(body.data.validation) : null,
      body.data.is_searchable, body.data.is_filterable, body.data.show_in_list,
      body.data.order_index,
    ]
  );

  return res.status(201).json({ success: true, data: field });
});

// PATCH /api/entities/:entityId/fields/:fieldId
fieldsRouter.patch('/:fieldId', async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { entityId, fieldId } = req.params;

  const field = await db.queryOne(
    'SELECT id FROM entity_fields WHERE id = $1 AND entity_type_id = $2 AND tenant_id = $3',
    [fieldId, entityId, tenantId]
  );
  if (!field) return res.status(404).json({ error: 'Field not found' });

  const allowed = ['name', 'required', 'default_value', 'options', 'validation',
                   'is_searchable', 'is_filterable', 'show_in_list', 'order_index'];
  const updates: string[] = [];
  const values: unknown[] = [];

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      const val = ['default_value', 'options', 'validation'].includes(key)
        ? JSON.stringify(req.body[key])
        : req.body[key];
      updates.push(`${key} = $${values.length + 1}`);
      values.push(val);
    }
  }

  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

  values.push(fieldId);
  const [updated] = await db.query(
    `UPDATE entity_fields SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );

  return res.json({ success: true, data: updated });
});

// DELETE /api/entities/:entityId/fields/:fieldId
fieldsRouter.delete('/:fieldId', async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { entityId, fieldId } = req.params;

  await db.query(
    'DELETE FROM entity_fields WHERE id = $1 AND entity_type_id = $2 AND tenant_id = $3',
    [fieldId, entityId, tenantId]
  );

  return res.json({ success: true });
});

// POST /api/entities/:entityId/fields/reorder
fieldsRouter.post('/reorder', async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { entityId } = req.params;
  const { order } = req.body as { order: Array<{ id: string; order_index: number }> };

  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be array' });

  await db.transaction(async (client) => {
    for (const item of order) {
      await client.query(
        'UPDATE entity_fields SET order_index = $1 WHERE id = $2 AND entity_type_id = $3',
        [item.order_index, item.id, entityId]
      );
    }
  });

  return res.json({ success: true });
});
