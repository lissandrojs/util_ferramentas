import { useForm, Controller } from 'react-hook-form';
import type { EntityField } from '../types';

interface DynamicFormProps {
  fields: EntityField[];
  defaultValues?: Record<string, unknown>;
  onSubmit: (data: Record<string, unknown>, files: Record<string, File>) => void;
  isLoading?: boolean;
  submitLabel?: string;
  onCancel?: () => void;
}

const FIELD_TYPE_LABELS: Record<string, string> = {
  string: 'Texto', textarea: 'Texto longo', number: 'Número',
  boolean: 'Sim/Não', date: 'Data', select: 'Seleção',
  file: 'Arquivo', image: 'Imagem',
};

export function DynamicForm({
  fields, defaultValues = {}, onSubmit, isLoading, submitLabel = 'Salvar', onCancel
}: DynamicFormProps) {
  const { register, handleSubmit, control, formState: { errors } } = useForm({
    defaultValues: defaultValues as Record<string, unknown>,
  });

  const fileRefs: Record<string, File> = {};

  const handleFormSubmit = (data: Record<string, unknown>) => {
    onSubmit(data, fileRefs);
  };

  const inputStyle = {
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', color: 'var(--text)',
    padding: '.575rem .875rem', fontSize: '.875rem', width: '100%',
    fontFamily: 'inherit', outline: 'none',
  };

  const renderField = (field: EntityField) => {
    const err = errors[field.field_key];

    return (
      <div key={field.id} style={{ marginBottom: '1rem' }}>
        <label className="label">
          {field.name}
          {field.required && <span>*</span>}
          <span style={{ marginLeft: 4, fontSize: '0.68rem', opacity: 0.5 }}>
            ({FIELD_TYPE_LABELS[field.field_type] || field.field_type})
          </span>
        </label>

        {/* ── String / Textarea ─────────────────────────── */}
        {field.field_type === 'string' && (
          <input
            {...register(field.field_key, {
              required: field.required ? `${field.name} é obrigatório` : false,
              minLength: field.validation?.minLength ? { value: field.validation.minLength, message: `Mínimo ${field.validation.minLength} caracteres` } : undefined,
              maxLength: field.validation?.maxLength ? { value: field.validation.maxLength, message: `Máximo ${field.validation.maxLength} caracteres` } : undefined,
            })}
            style={inputStyle}
            placeholder={`Digite ${field.name.toLowerCase()}...`}
          />
        )}

        {field.field_type === 'textarea' && (
          <textarea
            {...register(field.field_key, { required: field.required ? `${field.name} é obrigatório` : false })}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
            placeholder={`Digite ${field.name.toLowerCase()}...`}
          />
        )}

        {/* ── Number ───────────────────────────────────── */}
        {field.field_type === 'number' && (
          <input
            type="number"
            step="any"
            {...register(field.field_key, {
              required: field.required ? `${field.name} é obrigatório` : false,
              min: field.validation?.min !== undefined ? { value: field.validation.min, message: `Mínimo ${field.validation.min}` } : undefined,
              max: field.validation?.max !== undefined ? { value: field.validation.max, message: `Máximo ${field.validation.max}` } : undefined,
              valueAsNumber: true,
            })}
            style={inputStyle}
            placeholder="0"
          />
        )}

        {/* ── Date ─────────────────────────────────────── */}
        {field.field_type === 'date' && (
          <input
            type="date"
            {...register(field.field_key, { required: field.required ? `${field.name} é obrigatório` : false })}
            style={inputStyle}
          />
        )}

        {/* ── Boolean ──────────────────────────────────── */}
        {field.field_type === 'boolean' && (
          <Controller
            control={control}
            name={field.field_key}
            render={({ field: f }) => (
              <label style={{ display: 'flex', alignItems: 'center', gap: '.625rem', cursor: 'pointer', fontSize: '.875rem' }}>
                <input
                  type="checkbox"
                  checked={!!f.value}
                  onChange={e => f.onChange(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
                <span style={{ color: 'var(--muted)' }}>{f.value ? 'Sim' : 'Não'}</span>
              </label>
            )}
          />
        )}

        {/* ── Select ───────────────────────────────────── */}
        {field.field_type === 'select' && (
          <select
            {...register(field.field_key, { required: field.required ? `${field.name} é obrigatório` : false })}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="">Selecione...</option>
            {(field.options || []).map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}

        {/* ── File / Image ──────────────────────────────── */}
        {(field.field_type === 'file' || field.field_type === 'image') && (
          <div>
            {/* Show existing file */}
            {defaultValues[field.field_key] && typeof defaultValues[field.field_key] === 'object' && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '.625rem',
                padding: '.5rem .875rem', background: 'var(--surface2)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                marginBottom: '.5rem', fontSize: '.8rem',
              }}>
                <span style={{ color: 'var(--accent)' }}>📎</span>
                <a
                  href={(defaultValues[field.field_key] as { url: string }).url}
                  target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--accent)', textDecoration: 'none' }}
                >
                  {(defaultValues[field.field_key] as { name: string }).name}
                </a>
                <span style={{ color: 'var(--muted)', marginLeft: 'auto' }}>arquivo atual</span>
              </div>
            )}
            <input
              type="file"
              accept={field.field_type === 'image' ? 'image/*' : undefined}
              onChange={e => {
                if (e.target.files?.[0]) {
                  fileRefs[field.field_key] = e.target.files[0];
                }
              }}
              style={{ ...inputStyle, padding: '.4rem .875rem', cursor: 'pointer' }}
            />
          </div>
        )}

        {err && (
          <p style={{ color: 'var(--danger)', fontSize: '.75rem', marginTop: '.25rem' }}>
            {err.message as string}
          </p>
        )}
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)}>
      {fields.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)', fontSize: '.875rem' }}>
          Nenhum campo configurado. Adicione campos à estrutura primeiro.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0 1.5rem' }}>
          {fields.map(renderField)}
        </div>
      )}

      <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'flex-end', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={isLoading || fields.length === 0}>
          {isLoading ? (
            <span className="spinner" style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block' }} />
          ) : submitLabel}
        </button>
      </div>
    </form>
  );
}
