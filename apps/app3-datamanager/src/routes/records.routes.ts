import { Router, Request, Response } from 'express';
import multer from 'multer';
import { db } from '../database';
import { storage } from '../services/storage.service';
import { validateRecord, buildSearchText } from '../services/validation.service';
import { dispatchWebhook } from '../services/webhook.service';

export const recordsRouter = Router({ mergeParams: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/plain', 'text/csv',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    cb(null, allowed.includes(file.mimetype));
  },
});

// ── Helper: get entity + fields ────────────────────────────────
async function getEntityWithFields(entityId: string, tenantId: string) {
  const entity = await db.queryOne<{ id: string; name: string }>(
    'SELECT id, name FROM entity_types WHERE id = $1 AND tenant_id = $2',
    [entityId, tenantId]
  );
  if (!entity) return null;

  const fields = await db.query<{
    id: string; field_key: string; name: string; field_type: string;
    required: boolean; default_value: unknown; options: unknown;
    validation: unknown; is_searchable: boolean;
  }>(
    'SELECT * FROM entity_fields WHERE entity_type_id = $1 ORDER BY order_index',
    [entityId]
  );

  return { entity, fields };
}

// GET /api/entities/:entityId/records
recordsRouter.get('/', async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { entityId } = req.params;
  const {
    page = '1', limit = '20',
    search, sort_field, sort_dir = 'desc',
    ...filters
  } = req.query as Record<string, string>;

  const ef = await getEntityWithFields(entityId, tenantId);
  if (!ef) return res.status(404).json({ error: 'Entity type not found' });

  const pageNum  = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const offset   = (pageNum - 1) * limitNum;

  const conditions: string[] = ['r.entity_type_id = $1', 'r.tenant_id = $2', 'r.deleted_at IS NULL'];
  const params: unknown[] = [entityId, tenantId];

  // Full-text search
  if (search) {
    params.push(search);
    conditions.push(`r.search_vector @@ plainto_tsquery('portuguese', $${params.length})`);
  }

  // JSONB filters — ?filter_fieldKey=value
  for (const [key, value] of Object.entries(filters)) {
    if (key.startsWith('filter_')) {
      const fieldKey = key.replace('filter_', '');
      params.push(value);
      conditions.push(`r.data->>'${fieldKey}' = $${params.length}`);
    }
  }

  const where = conditions.join(' AND ');

  // Sort
  let orderBy = 'r.created_at DESC';
  if (sort_field) {
    const dir = sort_dir === 'asc' ? 'ASC' : 'DESC';
    orderBy = `r.data->>'${sort_field}' ${dir} NULLS LAST`;
  }

  const [records, countResult] = await Promise.all([
    db.query(
      `SELECT r.id, r.data, r.created_at, r.updated_at FROM entity_records r
       WHERE ${where} ORDER BY ${orderBy}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    ),
    db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM entity_records r WHERE ${where}`,
      params
    ),
  ]);

  // Attach file URLs
  const recordIds = records.map((r) => (r as { id: string }).id);
  let files: Array<{ record_id: string; field_key: string; id: string; original_name: string; public_url: string }> = [];
  if (recordIds.length > 0) {
    files = await db.query(
      `SELECT record_id, field_key, id, original_name, public_url
       FROM record_files WHERE record_id = ANY($1::uuid[])`,
      [recordIds]
    ) as typeof files;
  }

  const filesByRecord = files.reduce((acc, f) => {
    if (!acc[f.record_id]) acc[f.record_id] = {};
    acc[f.record_id][f.field_key] = { id: f.id, name: f.original_name, url: f.public_url };
    return acc;
  }, {} as Record<string, Record<string, unknown>>);

  const enriched = records.map((r) => {
    const rec = r as { id: string; data: Record<string, unknown>; created_at: string; updated_at: string };
    return {
      ...rec,
      data: { ...rec.data, ...(filesByRecord[rec.id] || {}) },
    };
  });

  return res.json({
    success: true,
    data: enriched,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: parseInt(countResult?.count || '0'),
      totalPages: Math.ceil(parseInt(countResult?.count || '0') / limitNum),
    },
    entity: ef.entity,
    fields: ef.fields,
  });
});

// GET /api/entities/:entityId/records/:id
recordsRouter.get('/:id', async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { entityId, id } = req.params;

  const record = await db.queryOne<{ id: string; data: Record<string, unknown>; created_at: string }>(
    'SELECT * FROM entity_records WHERE id = $1 AND entity_type_id = $2 AND tenant_id = $3 AND deleted_at IS NULL',
    [id, entityId, tenantId]
  );
  if (!record) return res.status(404).json({ error: 'Record not found' });

  const files = await db.query(
    'SELECT * FROM record_files WHERE record_id = $1',
    [id]
  );

  return res.json({ success: true, data: { ...record, files } });
});

// POST /api/entities/:entityId/records
recordsRouter.post('/', upload.any(), async (req: Request, res: Response) => {
  const { tenantId, userId } = req.tenant!;
  const { entityId } = req.params;

  const ef = await getEntityWithFields(entityId, tenantId);
  if (!ef) return res.status(404).json({ error: 'Entity type not found' });

  // Parse body (could be multipart or JSON)
  let rawData: Record<string, unknown> = {};
  if (req.body && typeof req.body === 'object') rawData = { ...req.body };

  // Validate
  const validation = validateRecord(rawData, ef.fields as Parameters<typeof validateRecord>[1]);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Validation failed', details: validation.errors });
  }

  const [record] = await db.query<{ id: string }>(
    `INSERT INTO entity_records (entity_type_id, tenant_id, data, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [entityId, tenantId, JSON.stringify(validation.data), userId]
  );

  const recordId = record.id;

  // Handle file uploads
  const uploadedFiles = (req.files as Express.Multer.File[]) || [];
  for (const file of uploadedFiles) {
    const fieldKey = file.fieldname;
    const stored = await storage.save(
      { originalname: file.originalname, mimetype: file.mimetype, size: file.size, buffer: file.buffer },
      `${tenantId}/${entityId}`
    );

    await db.query(
      `INSERT INTO record_files
         (tenant_id, record_id, entity_type_id, field_key, original_name, stored_name,
          mime_type, size_bytes, storage_type, storage_path, public_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [tenantId, recordId, entityId, fieldKey, file.originalname, stored.storedName,
       file.mimetype, file.size, stored.storageType, stored.storagePath, stored.publicUrl]
    );
  }

  // Update search vector
  const searchText = buildSearchText(validation.data, ef.fields as Parameters<typeof buildSearchText>[1]);
  if (searchText) {
    await db.query(
      `UPDATE entity_records SET search_vector = to_tsvector('portuguese', $1) WHERE id = $2`,
      [searchText, recordId]
    );
  }

  // Update record count
  await db.query(
    'UPDATE entity_types SET record_count = record_count + 1 WHERE id = $1',
    [entityId]
  );

  dispatchWebhook(tenantId, entityId, 'record.created', { id: recordId, data: validation.data });

  return res.status(201).json({ success: true, data: record });
});

// PATCH /api/entities/:entityId/records/:id
recordsRouter.patch('/:id', upload.any(), async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { entityId, id } = req.params;

  const ef = await getEntityWithFields(entityId, tenantId);
  if (!ef) return res.status(404).json({ error: 'Entity type not found' });

  const existing = await db.queryOne<{ data: Record<string, unknown> }>(
    'SELECT data FROM entity_records WHERE id = $1 AND entity_type_id = $2 AND tenant_id = $3 AND deleted_at IS NULL',
    [id, entityId, tenantId]
  );
  if (!existing) return res.status(404).json({ error: 'Record not found' });

  const merged = { ...existing.data, ...req.body };
  const validation = validateRecord(merged, ef.fields as Parameters<typeof validateRecord>[1]);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Validation failed', details: validation.errors });
  }

  const [record] = await db.query(
    `UPDATE entity_records SET data = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [JSON.stringify(validation.data), id]
  );

  // Handle new file uploads
  const uploadedFiles = (req.files as Express.Multer.File[]) || [];
  for (const file of uploadedFiles) {
    const fieldKey = file.fieldname;
    // Delete old file for this field if exists
    const oldFile = await db.queryOne<{ storage_path: string }>(
      'SELECT storage_path FROM record_files WHERE record_id = $1 AND field_key = $2',
      [id, fieldKey]
    );
    if (oldFile) {
      await storage.delete(oldFile.storage_path);
      await db.query('DELETE FROM record_files WHERE record_id = $1 AND field_key = $2', [id, fieldKey]);
    }

    const stored = await storage.save(
      { originalname: file.originalname, mimetype: file.mimetype, size: file.size, buffer: file.buffer },
      `${tenantId}/${entityId}`
    );

    await db.query(
      `INSERT INTO record_files
         (tenant_id, record_id, entity_type_id, field_key, original_name, stored_name,
          mime_type, size_bytes, storage_type, storage_path, public_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [tenantId, id, entityId, fieldKey, file.originalname, stored.storedName,
       file.mimetype, file.size, stored.storageType, stored.storagePath, stored.publicUrl]
    );
  }

  dispatchWebhook(tenantId, entityId, 'record.updated', { id, data: validation.data });

  return res.json({ success: true, data: record });
});

// DELETE /api/entities/:entityId/records/:id
recordsRouter.delete('/:id', async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { entityId, id } = req.params;

  const record = await db.queryOne(
    'SELECT id FROM entity_records WHERE id = $1 AND entity_type_id = $2 AND tenant_id = $3 AND deleted_at IS NULL',
    [id, entityId, tenantId]
  );
  if (!record) return res.status(404).json({ error: 'Record not found' });

  // Soft delete
  await db.query(
    'UPDATE entity_records SET deleted_at = NOW() WHERE id = $1',
    [id]
  );

  await db.query(
    'UPDATE entity_types SET record_count = GREATEST(0, record_count - 1) WHERE id = $1',
    [entityId]
  );

  dispatchWebhook(tenantId, entityId, 'record.deleted', { id });

  return res.json({ success: true });
});
