import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { X, Plus, Trash2 } from 'lucide-react';
import type { EntityField, FieldType } from '../types';

interface FieldBuilderProps {
  entityId: string;
  onSave: (field: Partial<EntityField>) => void;
  onClose: () => void;
  isSaving?: boolean;
  initial?: EntityField;
}

const FIELD_TYPES: Array<{ value: FieldType; label: string; icon: string }> = [
  { value: 'string',   label: 'Texto',        icon: 'T'   },
  { value: 'textarea', label: 'Texto longo',  icon: '¶'   },
  { value: 'number',   label: 'Número',       icon: '#'   },
  { value: 'boolean',  label: 'Sim/Não',      icon: '⊡'  },
  { value: 'date',     label: 'Data',         icon: '📅'  },
  { value: 'select',   label: 'Seleção',      icon: '▼'   },
  { value: 'file',     label: 'Arquivo/PDF',  icon: '📎'  },
  { value: 'image',    label: 'Imagem',       icon: '🖼'  },
];

export function FieldBuilder({ onSave, onClose, isSaving, initial }: FieldBuilderProps) {
  const [selectedType, setSelectedType] = useState<FieldType>(initial?.field_type || 'string');
  const [selectOptions, setSelectOptions] = useState<Array<{ label: string; value: string }>>(
    initial?.options || []
  );
  const [newOptLabel, setNewOptLabel] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      name:         initial?.name || '',
      required:     initial?.required || false,
      is_searchable: initial?.is_searchable ?? true,
      show_in_list:  initial?.show_in_list ?? true,
      min: (initial?.validation?.min ?? ''),
      max: (initial?.validation?.max ?? ''),
      minLength: (initial?.validation?.minLength ?? ''),
      maxLength: (initial?.validation?.maxLength ?? ''),
    },
  });

  const addOption = () => {
    if (!newOptLabel.trim()) return;
    const value = newOptLabel.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    setSelectOptions(prev => [...prev, { label: newOptLabel.trim(), value }]);
    setNewOptLabel('');
  };

  const onFormSubmit = (data: Record<string, unknown>) => {
    const validation: Record<string, number> = {};
    if (selectedType === 'number') {
      if (data.min !== '') validation.min = Number(data.min);
      if (data.max !== '') validation.max = Number(data.max);
    }
    if (selectedType === 'string' || selectedType === 'textarea') {
      if (data.minLength !== '') validation.minLength = Number(data.minLength);
      if (data.maxLength !== '') validation.maxLength = Number(data.maxLength);
    }

    onSave({
      name: data.name as string,
      field_type: selectedType,
      required: data.required as boolean,
      is_searchable: data.is_searchable as boolean,
      show_in_list: data.show_in_list as boolean,
      options: selectedType === 'select' ? selectOptions : undefined,
      validation: Object.keys(validation).length ? validation : undefined,
    });
  };

  const s = {
    label: { display: 'block' as const, fontSize: '.8rem', fontWeight: 500, color: 'var(--muted)', marginBottom: '.375rem' },
    input: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', padding: '.575rem .875rem', fontSize: '.875rem', width: '100%', fontFamily: 'inherit', outline: 'none' },
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 540 }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{initial ? 'Editar campo' : 'Novo campo'}</h3>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit(onFormSubmit)} style={{ padding: '1.5rem' }}>
          {/* Field name */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={s.label}>Nome do campo *</label>
            <input {...register('name', { required: 'Nome é obrigatório' })} style={s.input} placeholder="Ex: Nome, Valor, Data de vencimento..." />
            {errors.name && <p style={{ color: 'var(--danger)', fontSize: '.75rem', marginTop: '.25rem' }}>{errors.name.message}</p>}
          </div>

          {/* Type selector */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={s.label}>Tipo do campo</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '.5rem' }}>
              {FIELD_TYPES.map(ft => (
                <button
                  key={ft.value}
                  type="button"
                  onClick={() => setSelectedType(ft.value)}
                  style={{
                    padding: '.625rem .5rem', borderRadius: 'var(--radius)',
                    border: `1px solid ${selectedType === ft.value ? 'var(--accent)' : 'var(--border)'}`,
                    background: selectedType === ft.value ? 'var(--accent-d)' : 'var(--surface2)',
                    color: selectedType === ft.value ? 'var(--accent)' : 'var(--muted)',
                    cursor: 'pointer', fontSize: '.75rem', fontWeight: 500,
                    display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 2,
                    transition: 'all .15s',
                  }}
                >
                  <span style={{ fontSize: '1rem' }}>{ft.icon}</span>
                  {ft.label}
                </button>
              ))}
            </div>
          </div>

          {/* Validation for number */}
          {selectedType === 'number' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '1rem' }}>
              <div><label style={s.label}>Valor mínimo</label><input type="number" {...register('min')} style={s.input} placeholder="sem limite" /></div>
              <div><label style={s.label}>Valor máximo</label><input type="number" {...register('max')} style={s.input} placeholder="sem limite" /></div>
            </div>
          )}

          {/* Validation for string */}
          {(selectedType === 'string' || selectedType === 'textarea') && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '1rem' }}>
              <div><label style={s.label}>Mín. caracteres</label><input type="number" {...register('minLength')} style={s.input} placeholder="sem limite" /></div>
              <div><label style={s.label}>Máx. caracteres</label><input type="number" {...register('maxLength')} style={s.input} placeholder="sem limite" /></div>
            </div>
          )}

          {/* Options for select */}
          {selectedType === 'select' && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={s.label}>Opções</label>
              <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.5rem' }}>
                <input value={newOptLabel} onChange={e => setNewOptLabel(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addOption())} style={s.input} placeholder="Nova opção..." />
                <button type="button" className="btn btn-ghost btn-sm" onClick={addOption} style={{ flexShrink: 0 }}>
                  <Plus size={14} /> Adicionar
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '.375rem' }}>
                {selectOptions.map((opt, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.375rem .75rem', background: 'var(--surface2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                    <span style={{ flex: 1, fontSize: '.85rem' }}>{opt.label}</span>
                    <code style={{ fontSize: '.7rem', color: 'var(--muted)', fontFamily: 'monospace' }}>{opt.value}</code>
                    <button type="button" className="btn-icon" onClick={() => setSelectOptions(prev => prev.filter((_, j) => j !== i))} style={{ border: 'none', color: 'var(--danger)' }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                {selectOptions.length === 0 && <p style={{ fontSize: '.8rem', color: 'var(--muted)' }}>Nenhuma opção adicionada</p>}
              </div>
            </div>
          )}

          {/* Flags */}
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '1rem', marginBottom: '1.5rem' }}>
            {[
              { key: 'required',     label: 'Campo obrigatório'     },
              { key: 'is_searchable', label: 'Pesquisável'           },
              { key: 'show_in_list', label: 'Mostrar na listagem'    },
            ].map(({ key, label }) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer', fontSize: '.875rem', color: 'var(--muted)' }}>
                <input type="checkbox" {...register(key as keyof typeof errors)} style={{ accentColor: 'var(--accent)', width: 14, height: 14 }} />
                {label}
              </label>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              {isSaving ? 'Salvando...' : initial ? 'Atualizar campo' : 'Criar campo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
