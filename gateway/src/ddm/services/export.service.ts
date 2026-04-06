import * as XLSX from 'xlsx';
import { db } from '../../config/database';
import { logger } from '../../utils/logger';

export interface ExportOptions {
  entityTypeId: string;
  tenantId: string;
  format: 'xlsx' | 'csv';
  fields?: string[];       // field keys to include (null = all)
  filters?: Record<string, unknown>;
  search?: string;
  limit?: number;
}

export async function exportRecords(options: ExportOptions): Promise<Buffer> {
  const { entityTypeId, tenantId, format, fields, search, limit = 5000 } = options;

  // ── Get entity definition ──────────────────────────────────
  const entityType = await db.queryOne<{ name: string }>(
    'SELECT name FROM entity_types WHERE id = $1 AND tenant_id = $2',
    [entityTypeId, tenantId]
  );

  if (!entityType) throw new Error('Entity type not found');

  // ── Get field definitions ──────────────────────────────────
  const allFields = await db.query<{
    field_key: string;
    name: string;
    field_type: string;
  }>(
    'SELECT field_key, name, field_type FROM entity_fields WHERE entity_type_id = $1 ORDER BY order_index',
    [entityTypeId]
  );

  const selectedFields = fields && fields.length > 0
    ? allFields.filter((f) => fields.includes(f.field_key))
    : allFields;

  // ── Query records ──────────────────────────────────────────
  let query = `
    SELECT data, created_at, updated_at
    FROM entity_records
    WHERE entity_type_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
  `;
  const params: unknown[] = [entityTypeId, tenantId];

  if (search) {
    params.push(search);
    query += ` AND search_vector @@ plainto_tsquery('portuguese', $${params.length})`;
  }

  query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const records = await db.query<{
    data: Record<string, unknown>;
    created_at: string;
    updated_at: string;
  }>(query, params);

  // ── Build rows ──────────────────────────────────────────────
  const headers = [
    ...selectedFields.map((f) => f.name),
    'Criado em',
    'Atualizado em',
  ];

  const rows = records.map((r) => {
    const row: unknown[] = selectedFields.map((f) => {
      const val = r.data[f.field_key];
      if (val === null || val === undefined) return '';
      if (f.field_type === 'boolean') return val ? 'Sim' : 'Não';
      if (f.field_type === 'date' && val) {
        try { return new Date(val as string).toLocaleDateString('pt-BR'); } catch { return val; }
      }
      if (f.field_type === 'file' || f.field_type === 'image') return '[arquivo]';
      return String(val);
    });
    row.push(new Date(r.created_at).toLocaleString('pt-BR'));
    row.push(new Date(r.updated_at).toLocaleString('pt-BR'));
    return row;
  });

  // ── Generate workbook ──────────────────────────────────────
  const wsData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Style header row
  const headerRange = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
    const cellAddr = XLSX.utils.encode_cell({ r: 0, c: col });
    if (!ws[cellAddr]) continue;
    ws[cellAddr].s = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '6C63FF' } },
    };
  }

  // Auto column widths
  ws['!cols'] = headers.map((h, i) => {
    const maxLen = Math.max(
      h.length,
      ...rows.map((r) => String(r[i] || '').length)
    );
    return { width: Math.min(maxLen + 2, 50) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, entityType.name.slice(0, 31));

  if (format === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(ws);
    return Buffer.from('\uFEFF' + csv, 'utf-8'); // BOM for Excel compatibility
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
