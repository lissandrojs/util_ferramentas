import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2, GripVertical, Edit2, Database } from 'lucide-react';
import { entitiesApi, fieldsApi } from '../services/api';
import { FieldBuilder } from '../components/FieldBuilder';
import type { EntityField } from '../types';

const FIELD_TYPE_COLORS: Record<string, string> = {
  string: '#6c63ff', textarea: '#6c63ff', number: '#ffb347',
  boolean: '#00d4aa', date: '#4d96ff', select: '#f06595',
  file: '#ff922b', image: '#74c0fc',
};

const FIELD_TYPE_LABELS: Record<string, string> = {
  string: 'Texto', textarea: 'Texto longo', number: 'Número',
  boolean: 'Sim/Não', date: 'Data', select: 'Seleção',
  file: 'Arquivo', image: 'Imagem',
};

export function SchemaPage() {
  const { entityId } = useParams<{ entityId: string }>();
  const qc = useQueryClient();
  const [showBuilder, setShowBuilder] = useState(false);
  const [editField, setEditField] = useState<EntityField | null>(null);

  const { data: entity } = useQuery({
    queryKey: ['entity', entityId],
    queryFn: () => entitiesApi.get(entityId!),
  });

  const fields = entity?.fields || [];

  const createMutation = useMutation({
    mutationFn: (data: Partial<EntityField>) => fieldsApi.create(entityId!, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['entity', entityId] }); setShowBuilder(false); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<EntityField> }) =>
      fieldsApi.update(entityId!, id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['entity', entityId] }); setEditField(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (fieldId: string) => fieldsApi.delete(entityId!, fieldId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entity', entityId] }),
  });

  return (
    <div style={{ padding: '2rem 2.5rem', maxWidth: 900 }} className="fade-up">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '.875rem', marginBottom: '2rem' }}>
        <Link to="/">
          <button className="btn-icon"><ArrowLeft size={16} /></button>
        </Link>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.15rem' }}>
            <Database size={16} color={entity?.color || 'var(--accent)'} />
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{entity?.name || '...'}</h1>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '.8rem' }}>Configure os campos desta estrutura</p>
        </div>
        <div style={{ display: 'flex', gap: '.75rem' }}>
          <Link to={`/entities/${entityId}`}>
            <button className="btn btn-ghost btn-sm">Ver registros</button>
          </Link>
          <button className="btn btn-primary btn-sm" onClick={() => setShowBuilder(true)}>
            <Plus size={14} /> Novo campo
          </button>
        </div>
      </div>

      {/* Fields list */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '.875rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '30px 1fr 120px 80px 80px 80px 60px', gap: '1rem', alignItems: 'center' }}>
          <span />
          {['Campo', 'Tipo', 'Obrig.', 'Listagem', 'Busca', ''].map(h => (
            <span key={h} style={{ fontSize: '.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>{h}</span>
          ))}
        </div>

        {fields.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
            <p>Nenhum campo criado. Clique em "Novo campo" para começar.</p>
          </div>
        ) : (
          fields.map((field) => {
            const tc = FIELD_TYPE_COLORS[field.field_type] || 'var(--muted)';
            return (
              <div
                key={field.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '30px 1fr 120px 80px 80px 80px 60px',
                  gap: '1rem', padding: '.75rem 1.25rem',
                  borderBottom: '1px solid var(--border)',
                  alignItems: 'center',
                  transition: 'background .1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                <GripVertical size={14} color="var(--border2)" style={{ cursor: 'grab' }} />

                {/* Name + key */}
                <div>
                  <p style={{ fontWeight: 500, fontSize: '.875rem' }}>{field.name}</p>
                  <code style={{ fontSize: '.7rem', color: 'var(--muted)', fontFamily: 'monospace' }}>{field.field_key}</code>
                </div>

                {/* Type badge */}
                <span className="badge" style={{ color: tc, borderColor: tc + '44', background: tc + '18', width: 'fit-content' }}>
                  {FIELD_TYPE_LABELS[field.field_type] || field.field_type}
                </span>

                {/* Flags */}
                {[field.required, field.show_in_list, field.is_searchable].map((val, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'center' }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: val ? 'var(--success)' : 'var(--border2)',
                    }} />
                  </div>
                ))}

                {/* Actions */}
                <div style={{ display: 'flex', gap: '.375rem' }}>
                  <button className="btn-icon" onClick={() => setEditField(field)} title="Editar">
                    <Edit2 size={13} />
                  </button>
                  <button
                    className="btn-icon"
                    style={{ color: 'var(--danger)', borderColor: 'rgba(255,77,106,.3)' }}
                    onClick={() => window.confirm(`Deletar campo "${field.name}"?`) && deleteMutation.mutate(field.id)}
                    title="Deletar"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: 'var(--radius)', background: 'var(--surface2)', border: '1px solid var(--border)' }}>
        <p style={{ fontSize: '.8rem', color: 'var(--muted)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text)' }}>Dica:</strong> Os campos são renderizados automaticamente no formulário de criação e edição de registros. Campos do tipo <strong style={{ color: 'var(--text)' }}>arquivo/imagem</strong> fazem upload seguro e armazenam os metadados no banco.
        </p>
      </div>

      {showBuilder && (
        <FieldBuilder
          entityId={entityId!}
          onSave={createMutation.mutate}
          onClose={() => setShowBuilder(false)}
          isSaving={createMutation.isPending}
        />
      )}

      {editField && (
        <FieldBuilder
          entityId={entityId!}
          initial={editField}
          onSave={(data) => updateMutation.mutate({ id: editField.id, data })}
          onClose={() => setEditField(null)}
          isSaving={updateMutation.isPending}
        />
      )}
    </div>
  );
}
