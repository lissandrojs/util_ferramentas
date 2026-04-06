import { z } from 'zod';

export interface FieldDef {
  field_key: string;
  name: string;
  field_type: string;
  required: boolean;
  is_searchable?: boolean;
  validation?: {
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
  };
  options?: Array<{ label: string; value: string }>;
  default_value?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  data: Record<string, unknown>;
}

// ── Build a Zod schema from dynamic field definitions ──────────
export function buildDynamicSchema(fields: FieldDef[]) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    let schema: z.ZodTypeAny;

    switch (field.field_type) {
      case 'string':
      case 'textarea': {
        let s = z.string();
        if (field.validation?.minLength) s = s.min(field.validation.minLength);
        if (field.validation?.maxLength) s = s.max(field.validation.maxLength);
        if (field.validation?.pattern) s = s.regex(new RegExp(field.validation.pattern));
        schema = s;
        break;
      }
      case 'number': {
        let n = z.number();
        if (field.validation?.min !== undefined) n = n.min(field.validation.min);
        if (field.validation?.max !== undefined) n = n.max(field.validation.max);
        schema = n;
        break;
      }
      case 'boolean':
        schema = z.boolean();
        break;
      case 'date':
        schema = z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));
        break;
      case 'select': {
        if (field.options && field.options.length > 0) {
          const values = field.options.map((o) => o.value);
          schema = z.enum(values as [string, ...string[]]);
        } else {
          schema = z.string();
        }
        break;
      }
      case 'file':
      case 'image':
        // File fields are handled separately (multipart upload)
        schema = z.string().optional();
        break;
      default:
        schema = z.string();
    }

    if (!field.required) {
      schema = schema.optional().nullable();
    }

    shape[field.field_key] = schema;
  }

  return z.object(shape).passthrough();
}

// ── Validate and coerce types ─────────────────────────────────
export function validateRecord(
  data: Record<string, unknown>,
  fields: FieldDef[]
): ValidationResult {
  // Coerce types before validation
  const coerced: Record<string, unknown> = { ...data };

  for (const field of fields) {
    const val = coerced[field.field_key];
    if (val === undefined || val === null || val === '') {
      if (field.default_value !== undefined && field.default_value !== null) {
        coerced[field.field_key] = field.default_value;
      }
      continue;
    }

    if (field.field_type === 'number' && typeof val === 'string') {
      const num = parseFloat(val);
      coerced[field.field_key] = isNaN(num) ? val : num;
    }
    if (field.field_type === 'boolean' && typeof val === 'string') {
      coerced[field.field_key] = val === 'true' || val === '1';
    }
  }

  const schema = buildDynamicSchema(fields);
  const result = schema.safeParse(coerced);

  if (!result.success) {
    const errors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0]?.toString() || 'unknown';
      errors[key] = issue.message;
    }
    return { valid: false, errors, data: coerced };
  }

  return { valid: true, errors: {}, data: result.data as Record<string, unknown> };
}

// ── Build PostgreSQL full-text search vector ──────────────────
export function buildSearchText(
  data: Record<string, unknown>,
  fields: FieldDef[]
): string {
  const parts: string[] = [];
  for (const field of fields) {
    if (!field.is_searchable) continue;
    const val = data[field.field_key as string];
    if (val && typeof val === 'string') parts.push(val);
    if (val && typeof val === 'number') parts.push(String(val));
  }
  return parts.join(' ');
}
