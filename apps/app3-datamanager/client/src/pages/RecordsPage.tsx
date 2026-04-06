import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Search, Download, Trash2, Edit2, Eye, Settings, FileSpreadsheet, FileText, X } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { entitiesApi, recordsApi, exportApi } from '../services/api';
import { DynamicForm } from '../components/DynamicForm';
import type { EntityField, EntityRecord } from '../types';

function RecordModal({
  entityId, fields, record, onClose
}: {
  entityId: string;
  fields: EntityField[];
  record?: EntityRecord;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: async ({ data, files }: { data: Record<string, unknown>; files: Record<string, File> }) => {
      const hasFiles = Object.keys(files).length > 0;
      let payload: FormData | Record<string, unknown> = data;

      if (hasFiles) {
        const fd = new FormData();
        for (const [k, v] of Object.entries(data)) {
          if (v !== null && v !== undefined) fd.append(k, String(v));
        }
        for (const [k, f] of Object.entries(files)) {
          fd.append(k, f, f.name);
        }
        payload = fd;
      }

      if (record) {
        return recordsApi.update(entityId, record.id, payload);
      }
      return recordsApi.create(entityId, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['records', entityId] });
      qc.invalidateQueries({ queryKey: ['entities'] });
      onClose();
    },
  });

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 700 }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontWeight: 600, fontSize: '1rem' }}>
            {record ? 'Editar registro' : 'Novo registro'}
          </h3>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: '1.5rem' }}>
          {saveMutation.isError && (
            <div style={{ padding: '.75rem', borderRadius: 'var(--radius)', background: 'rgba(255,77,106,.1)', border: '1px solid rgba(255,77,106,.3)', color: 'var(--danger)', fontSize: '.875rem', marginBottom: '1rem' }}>
              {(saveMutation.error as { response?: { data?: { error?: string; details?: Record<string, string> } } })?.response?.data?.error || 'Erro ao salvar'}
              {(saveMutation.error as { response?: { data?: { details?: Record<string, string> } } })?.response?.data?.details && (
                <ul style={{ marginTop: '.5rem', paddingLeft: '1rem' }}>
                  {Object.entries((saveMutation.error as { response?: { data?: { details?: Record<string, string> } } })?.response?.data?.details || {}).map(([k, v]) => (
                    <li key={k}><strong>{k}:</strong> {v}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <DynamicForm
            fields={fields}
            defaultValues={record?.data}
            onSubmit={(data, files) => saveMutation.mutate({ data, files })}
            isLoading={saveMutation.isPending}
            submitLabel={record ? 'Atualizar' : 'Criar registro'}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}

export function RecordsPage() {
  const { entityId } = useParams<{ entityId: string }>();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editRecord, setEditRecord] = useState<EntityRecord | null>(null);
  const [search, setSearch]   = useState('');
  const [page, setPage]       = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['records', entityId, search, page],
    queryFn: () => recordsApi.list(entityId!, { page, limit: 20, search: search || undefined }),
    placeholderData: prev => prev,
  });

  const { data: entity } = useQuery({
    queryKey: ['entity', entityId],
    queryFn: () => entitiesApi.get(entityId!),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => recordsApi.delete(entityId!, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['records', entityId] });
      qc.invalidateQueries({ queryKey: ['entities'] });
    },
  });

  const records = data?.data || [];
  const fields = data?.fields || entity?.fields || [];
  const pagination = data?.pagination;
  const listFields = fields.filter(f => f.show_in_list);

  const formatValue = (val: unknown, field: EntityField): string => {
    if (val === null || val === undefined || val === '') return '—';
    if (field.field_type === 'boolean') return val ? '✓ Sim' : '✗ Não';
    if (field.field_type === 'date') {
      try { return format(new Date(val as string), 'dd/MM/yyyy', { locale: ptBR }); } catch { return String(val); }
    }
    if (field.field_type === 'file' || field.field_type === 'image') {
      const f = val as { name: string; url: string };
      return f?.name || '[arquivo]';
    }
    const str = String(val);
    return str.length > 60 ? str.slice(0, 60) + '…' : str;
  };

  return (
    <div style={{ padding: '2rem 2.5rem', maxWidth: 1400 }} className="fade-up">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '.875rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <Link to="/"><button className="btn-icon"><ArrowLeft size={16} /></button></Link>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '.15rem' }}>{entity?.name || '...'}</h1>
          <p style={{ color: 'var(--muted)', fontSize: '.8rem' }}>
            {pagination?.total?.toLocaleString('pt-BR') || 0} registros
          </p>
        </div>
        <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
          <Link to={`/entities/${entityId}/schema`}>
            <button className="btn btn-ghost btn-sm"><Settings size={13} /> Campos</button>
          </Link>
          <button className="btn btn-ghost btn-sm" onClick={() => exportApi.download(entityId!, 'csv', undefined, search)}>
            <FileText size={13} /> CSV
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => exportApi.download(entityId!, 'xlsx', undefined, search)}>
            <FileSpreadsheet size={13} /> Excel
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Novo registro
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '1.25rem', maxWidth: 420 }}>
        <Search size={14} style={{ position: 'absolute', left: '.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Buscar registros..."
          style={{ paddingLeft: '2.25rem' }}
        />
      </div>

      {/* Table */}
      {fields.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)', color: 'var(--muted)' }}>
          <p style={{ marginBottom: '.75rem' }}>Nenhum campo configurado</p>
          <Link to={`/entities/${entityId}/schema`}>
            <button className="btn btn-primary btn-sm"><Settings size={13} /> Configurar campos</button>
          </Link>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                {listFields.map(f => <th key={f.id}>{f.name}</th>)}
                <th>Criado em</th>
                <th style={{ width: 100 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={listFields.length + 2} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>Carregando...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={listFields.length + 2} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
                  {search ? 'Nenhum resultado para essa busca' : 'Nenhum registro criado ainda'}
                </td></tr>
              ) : (
                records.map(record => (
                  <tr key={record.id}>
                    {listFields.map(field => (
                      <td key={field.id} style={{ maxWidth: 200 }}>
                        {field.field_type === 'file' || field.field_type === 'image' ? (
                          record.data[field.field_key] ? (
                            <a
                              href={(record.data[field.field_key] as { url: string }).url}
                              target="_blank" rel="noopener noreferrer"
                              style={{ color: 'var(--accent)', fontSize: '.8rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '.25rem' }}
                            >
                              📎 {(record.data[field.field_key] as { name: string }).name || 'Ver arquivo'}
                            </a>
                          ) : <span style={{ color: 'var(--muted)' }}>—</span>
                        ) : (
                          <span style={{ fontSize: '.875rem' }}>{formatValue(record.data[field.field_key], field)}</span>
                        )}
                      </td>
                    ))}
                    <td style={{ fontSize: '.8rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {format(new Date(record.created_at), 'dd/MM/yy HH:mm', { locale: ptBR })}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '.375rem' }}>
                        <button className="btn-icon" onClick={() => setEditRecord(record)} title="Editar">
                          <Edit2 size={13} />
                        </button>
                        <button
                          className="btn-icon"
                          style={{ color: 'var(--danger)', borderColor: 'rgba(255,77,106,.3)' }}
                          onClick={() => window.confirm('Deletar registro?') && deleteMutation.mutate(record.id)}
                          title="Deletar"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '.875rem' }}>
              <span style={{ color: 'var(--muted)' }}>
                {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total.toLocaleString('pt-BR')}
              </span>
              <div style={{ display: 'flex', gap: '.5rem' }}>
                <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Anterior</button>
                <button className="btn btn-ghost btn-sm" disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>Próxima →</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <RecordModal entityId={entityId!} fields={fields} onClose={() => setShowCreate(false)} />
      )}
      {editRecord && (
        <RecordModal entityId={entityId!} fields={fields} record={editRecord} onClose={() => setEditRecord(null)} />
      )}
    </div>
  );
}
