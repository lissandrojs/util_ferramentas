import { Router, Request, Response } from 'express';
import path from 'path';
import { createReadStream, existsSync } from 'fs';
import { db } from '../../config/database';
import { storage, localStorage } from '../services/storage.service';
import { exportRecords } from '../services/export.service';

// ── Files Router ──────────────────────────────────────────────
export const filesRouter = Router();

// GET /api/ddm-files/download/* — serve files
filesRouter.get('/download/*', async (req: Request, res: Response) => {
  const filePath = req.params[0];
  if (!filePath) return res.status(400).json({ error: 'Invalid path' });

  // Verify access — file must belong to tenant
  const { tenantId } = req.tenant!;
  const file = await db.queryOne<{
    original_name: string; mime_type: string; storage_path: string;
  }>(
    'SELECT * FROM record_files WHERE storage_path = $1 AND tenant_id = $2',
    [filePath, tenantId]
  );

  if (!file) return res.status(404).json({ error: 'File not found' });

  const ls = localStorage as { getFullPath?: (p: string) => string };
  if (!ls.getFullPath) return res.status(501).json({ error: 'Storage type not supported for direct download' });

  const fullPath = ls.getFullPath(file.storage_path);
  if (!existsSync(fullPath)) return res.status(404).json({ error: 'File not found on disk' });

  res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.original_name)}"`);

  createReadStream(fullPath).pipe(res);
});

// DELETE /api/files/:fileId
filesRouter.delete('/:fileId', async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;

  const file = await db.queryOne<{ id: string; storage_path: string }>(
    'SELECT id, storage_path FROM record_files WHERE id = $1 AND tenant_id = $2',
    [req.params.fileId, tenantId]
  );

  if (!file) return res.status(404).json({ error: 'File not found' });

  await storage.delete(file.storage_path);
  await db.query('DELETE FROM record_files WHERE id = $1', [file.id]);

  return res.json({ success: true });
});

// ── Export Router ─────────────────────────────────────────────
export const exportRouter = Router({ mergeParams: true });

// GET /api/entities/:entityId/export?format=xlsx&fields=name,email
exportRouter.get('/', async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { entityId } = req.params;
  const { format = 'xlsx', fields, search } = req.query as Record<string, string>;

  const buffer = await exportRecords({
    entityTypeId: entityId,
    tenantId,
    format: format as 'xlsx' | 'csv',
    fields: fields ? fields.split(',') : undefined,
    search,
  });

  const ext = format === 'csv' ? 'csv' : 'xlsx';
  const mime = format === 'csv'
    ? 'text/csv'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `attachment; filename="export-${Date.now()}.${ext}"`);
  res.setHeader('Content-Length', buffer.length);

  return res.send(buffer);
});

// ── Webhooks Router ───────────────────────────────────────────
export const webhooksRouter = Router({ mergeParams: true });

const WEBHOOK_EVENTS = ['record.created', 'record.updated', 'record.deleted'];

// GET /api/entities/:entityId/webhooks
webhooksRouter.get('/', async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { entityId } = req.params;

  const hooks = await db.query(
    'SELECT id, name, url, events, is_active, last_triggered, created_at FROM ddm_webhooks WHERE tenant_id = $1 AND entity_type_id = $2',
    [tenantId, entityId]
  );

  return res.json({ success: true, data: hooks });
});

// POST /api/entities/:entityId/webhooks
webhooksRouter.post('/', async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const { entityId } = req.params;
  const { name, url, events, secret } = req.body;

  if (!url || !Array.isArray(events)) {
    return res.status(400).json({ error: 'url and events[] are required' });
  }

  const validEvents = events.filter((e: string) => WEBHOOK_EVENTS.includes(e));

  const [hook] = await db.query(
    `INSERT INTO ddm_webhooks (tenant_id, entity_type_id, name, url, events, secret)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, url, events, is_active`,
    [tenantId, entityId, name || 'Webhook', url, validEvents, secret || null]
  );

  return res.status(201).json({ success: true, data: hook });
});

// DELETE /api/entities/:entityId/webhooks/:hookId
webhooksRouter.delete('/:hookId', async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;

  await db.query(
    'DELETE FROM ddm_webhooks WHERE id = $1 AND tenant_id = $2',
    [req.params.hookId, tenantId]
  );

  return res.json({ success: true });
});
