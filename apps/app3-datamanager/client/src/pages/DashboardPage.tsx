import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Plus, Database, Trash2, Settings, ChevronRight, X, BarChart3 } from 'lucide-react';
import { entitiesApi } from '../services/api';
import type { EntityType } from '../types';

const ICONS = ['database','file-text','users','package','tag','calendar','briefcase','chart-bar','star','home'];
const COLORS = ['#6c63ff','#00d4aa','#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#ff922b','#f06595','#74c0fc','#a9e34b'];

function CreateEntityModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [color, setColor] = useState(COLORS[0]);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ name: string; description: string }>();

  const mutation = useMutation({
    mutationFn: (data: { name: string; description: string }) =>
      entitiesApi.create({ ...data, color, icon: 'database' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['entities'] }); onClose(); },
  });

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontWeight: 600, fontSize: '1rem' }}>Nova estrutura de dados</h3>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} style={{ padding: '1.5rem' }}>
          <div style={{ marginBottom: '1rem' }}>
            <label className="label">Nome da estrutura *</label>
            <input {...register('name', { required: 'Nome é obrigatório' })} placeholder="Ex: Boletos, Produtos, Clientes..." />
            {errors.name && <p style={{ color: 'var(--danger)', fontSize: '.75rem', marginTop: '.25rem' }}>{errors.name.message}</p>}
          </div>
          <div style={{ marginBottom: '1.25rem' }}>
            <label className="label">Descrição</label>
            <textarea {...register('description')} rows={2} placeholder="Para que serve esta estrutura..." />
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <label className="label">Cor</label>
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              {COLORS.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)} style={{
                  width: 28, height: 28, borderRadius: '50%', background: c, border: `3px solid ${color === c ? '#fff' : 'transparent'}`,
                  cursor: 'pointer', outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: 1,
                }} />
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Criando...' : 'Criar estrutura'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const [showCreate, setShowCreate] = useState(false);
  const qc = useQueryClient();

  const { data: entities = [], isLoading } = useQuery({
    queryKey: ['entities'],
    queryFn: entitiesApi.list,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => entitiesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entities'] }),
  });

  const totalRecords = entities.reduce((s, e) => s + (e.record_count || 0), 0);

  return (
    <div style={{ padding: '2rem 2.5rem', maxWidth: 1200 }} className="fade-up">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '.25rem' }}>
            Gerenciador de Dados
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '.875rem' }}>
            Crie estruturas dinâmicas e gerencie qualquer tipo de dado
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={15} /> Nova estrutura
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {[
          { label: 'Estruturas criadas', value: entities.length, icon: <Database size={16} /> },
          { label: 'Total de registros', value: totalRecords.toLocaleString('pt-BR'), icon: <BarChart3 size={16} /> },
        ].map(({ label, value, icon }) => (
          <div key={label} className="card" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '.875rem' }}>
            <div style={{ color: 'var(--accent)' }}>{icon}</div>
            <div>
              <p style={{ fontSize: '.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</p>
              <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Entity cards */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted)' }}>Carregando...</div>
      ) : entities.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)', color: 'var(--muted)' }}>
          <Database size={40} style={{ marginBottom: '1rem', opacity: .3, display: 'block', margin: '0 auto 1rem' }} />
          <p style={{ fontWeight: 500, marginBottom: '.5rem' }}>Nenhuma estrutura criada</p>
          <p style={{ fontSize: '.875rem', marginBottom: '1.5rem' }}>Crie sua primeira estrutura de dados para começar</p>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={15} /> Criar estrutura
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {entities.map((entity: EntityType) => (
            <div key={entity.id} className="card" style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: entity.color + '22',
                    border: `1px solid ${entity.color}44`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Database size={18} color={entity.color} />
                  </div>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '.95rem' }}>{entity.name}</p>
                    <p style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
                      {entity.field_count || 0} campo{(entity.field_count || 0) !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <button
                  className="btn-icon"
                  onClick={() => window.confirm('Deletar esta estrutura e todos os registros?') && deleteMutation.mutate(entity.id)}
                  style={{ color: 'var(--danger)', borderColor: 'rgba(255,77,106,.3)' }}
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {entity.description && (
                <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: '.875rem', lineHeight: 1.5 }}>
                  {entity.description}
                </p>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '.875rem', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
                  <strong style={{ color: 'var(--text)' }}>{entity.record_count.toLocaleString('pt-BR')}</strong> registros
                </span>
                <div style={{ display: 'flex', gap: '.5rem' }}>
                  <Link to={`/entities/${entity.id}/schema`} title="Configurar campos">
                    <button className="btn-icon"><Settings size={13} /></button>
                  </Link>
                  <Link to={`/entities/${entity.id}`}>
                    <button className="btn btn-primary btn-sm">
                      Abrir <ChevronRight size={13} />
                    </button>
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateEntityModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
