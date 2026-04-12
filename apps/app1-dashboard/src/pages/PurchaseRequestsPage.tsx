import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Clock, AlertCircle, User, Copy, Plus } from 'lucide-react';
import { api } from '../services/api';

type Status = 'pending_payment'|'payment_sent'|'approved'|'rejected';

interface PurchaseRequest {
  id: string; name: string; email: string; plan: string;
  amount_cents: number; status: Status; pix_txid: string;
  admin_notes: string; approved_by: string; approved_at: string;
  created_at: string;
}

const STATUS_META: Record<Status, { color: string; bg: string; label: string }> = {
  pending_payment: { color: '#8888a8', bg: 'rgba(136,136,168,.1)', label: 'Aguardando pagamento' },
  payment_sent:    { color: '#a89ff0', bg: 'rgba(108,99,255,.12)', label: 'Pagamento enviado ⚡' },
  approved:        { color: '#00d4aa', bg: 'rgba(0,212,170,.1)',   label: 'Aprovado' },
  rejected:        { color: '#ff4d6a', bg: 'rgba(255,77,106,.1)', label: 'Rejeitado' },
};

const btnStyle = (bg: string, fg = '#fff'): React.CSSProperties => ({
  padding: '.6rem 1.1rem', borderRadius: 9, border: 'none',
  background: bg, color: fg, cursor: 'pointer',
  fontWeight: 600, fontSize: '.85rem',
  display: 'inline-flex', alignItems: 'center', gap: '.4rem',
});

const cardStyle: React.CSSProperties = {
  background: '#111118', border: '1px solid #2a2a38', borderRadius: 12, padding: '1.25rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#1a1a24', border: '1px solid #2a2a38',
  borderRadius: 8, color: '#e8e8f0', padding: '.575rem .75rem',
  fontSize: '.875rem', fontFamily: 'inherit', outline: 'none', marginBottom: '.75rem',
};

export function PurchaseRequestsPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<PurchaseRequest|null>(null);
  const [notes, setNotes]       = useState('');
  const [copiedCreds, setCopiedCreds] = useState('');
  const [showCreate, setShowCreate]   = useState(false);
  const [createForm, setCreateForm]   = useState({ name:'', email:'', plan:'free', password:'' });

  const { data: requests = [], isLoading } = useQuery<PurchaseRequest[]>({
    queryKey: ['purchase-requests'],
    queryFn: () => api.get('/admin/checkout/requests').then(r => r.data.data),
    refetchInterval: 30000,
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      api.post(`/admin/checkout/approve/${id}`, { notes }).then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['purchase-requests'] });
      setCopiedCreds(`Email: ${data.data.email}\nSenha: ${data.data.password}\nPlano: ${data.data.plan}`);
      setSelected(null);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      api.post(`/admin/checkout/reject/${id}`, { notes }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-requests'] }); setSelected(null); },
  });

  const createUserMutation = useMutation({
    mutationFn: (form: typeof createForm) =>
      api.post('/admin/checkout/create-user', form).then(r => r.data),
    onSuccess: (data) => {
      setCopiedCreds(`Email: ${data.data.email}\nSenha: ${data.data.password}\nPlano: ${data.data.plan}`);
      setShowCreate(false);
      setCreateForm({ name:'', email:'', plan:'free', password:'' });
    },
  });

  const pending = requests.filter(r => r.status === 'payment_sent').length;

  return (
    <div style={{ padding: '2.5rem', maxWidth: 1000 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Solicitações de Compra</h1>
          <p style={{ color: '#8888a8', fontSize: '.875rem', marginTop: '.25rem' }}>
            Pagamentos PIX pendentes de aprovação
          </p>
        </div>
        <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
          {pending > 0 && (
            <span style={{ background: 'rgba(108,99,255,.15)', color: '#a89ff0', padding: '.375rem .875rem', borderRadius: 20, fontSize: '.8rem', fontWeight: 600 }}>
              ⚡ {pending} aguardando
            </span>
          )}
          <button style={btnStyle('#6c63ff')} onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Criar usuário
          </button>
        </div>
      </div>

      {/* Credentials banner */}
      {copiedCreds && (
        <div style={{ ...cardStyle, marginBottom: '1.25rem', background: 'rgba(0,212,170,.05)', border: '1px solid rgba(0,212,170,.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
            <div>
              <p style={{ fontWeight: 600, color: '#00d4aa', marginBottom: '.5rem' }}>✅ Conta criada! Envie as credenciais ao usuário:</p>
              <pre style={{ fontFamily: 'monospace', fontSize: '.9rem', color: '#e8e8f0', background: '#1a1a24', padding: '1rem', borderRadius: 8 }}>{copiedCreds}</pre>
            </div>
            <button style={btnStyle('#1a1a24', '#8888a8')} onClick={() => navigator.clipboard.writeText(copiedCreds)}>
              <Copy size={14}/> Copiar
            </button>
          </div>
          <button onClick={() => setCopiedCreds('')} style={{ marginTop: '.5rem', background: 'none', border: 'none', color: '#8888a8', cursor: 'pointer', fontSize: '.8rem' }}>Fechar</button>
        </div>
      )}

      {/* Create user modal */}
      {showCreate && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}
          onClick={e => e.target === e.currentTarget && setShowCreate(false)}
        >
          <div style={{ ...cardStyle, width: '100%', maxWidth: 420, padding: '1.75rem' }}>
            <h2 style={{ fontWeight: 700, marginBottom: '1.25rem' }}>Criar usuário manualmente</h2>
            <label style={{ display: 'block', fontSize: '.78rem', color: '#8888a8', marginBottom: '.3rem' }}>Nome</label>
            <input style={inputStyle} value={createForm.name} onChange={e => setCreateForm(f => ({...f, name: e.target.value}))} />
            <label style={{ display: 'block', fontSize: '.78rem', color: '#8888a8', marginBottom: '.3rem' }}>Email</label>
            <input style={inputStyle} type="email" value={createForm.email} onChange={e => setCreateForm(f => ({...f, email: e.target.value}))} />
            <label style={{ display: 'block', fontSize: '.78rem', color: '#8888a8', marginBottom: '.3rem' }}>Senha (opcional — gera automático)</label>
            <input style={inputStyle} type="password" value={createForm.password} onChange={e => setCreateForm(f => ({...f, password: e.target.value}))} />
            <label style={{ display: 'block', fontSize: '.78rem', color: '#8888a8', marginBottom: '.3rem' }}>Plano</label>
            <select value={createForm.plan} onChange={e => setCreateForm(f => ({...f, plan: e.target.value}))}
              style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="free">Gratuito</option>
              <option value="pro">Pro</option>
            </select>
            <div style={{ display: 'flex', gap: '.75rem', marginTop: '.25rem' }}>
              <button style={btnStyle('#6c63ff')} onClick={() => createUserMutation.mutate(createForm)}>
                {createUserMutation.isPending ? 'Criando...' : 'Criar conta'}
              </button>
              <button style={btnStyle('#1a1a24', '#8888a8')} onClick={() => setShowCreate(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Requests */}
      {isLoading ? (
        <p style={{ color: '#8888a8' }}>Carregando...</p>
      ) : requests.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '3rem', color: '#8888a8' }}>
          Nenhuma solicitação ainda. Quando alguém preencher o formulário de compra, aparecerá aqui.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
          {requests.map(r => {
            const meta = STATUS_META[r.status] || STATUS_META.pending_payment;
            const isActionable = r.status === 'payment_sent' || r.status === 'pending_payment';
            return (
              <div key={r.id} style={{ ...cardStyle, borderColor: r.status === 'payment_sent' ? 'rgba(108,99,255,.4)' : '#2a2a38' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: '.75rem', alignItems: 'flex-start' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: '#1a1a24', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <User size={18} color="#8888a8"/>
                    </div>
                    <div>
                      <p style={{ fontWeight: 600 }}>{r.name}</p>
                      <p style={{ fontSize: '.85rem', color: '#8888a8' }}>{r.email}</p>
                      <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: '.72rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, background: meta.bg, color: meta.color }}>
                          {r.status === 'approved' ? <CheckCircle2 size={11}/> : r.status === 'rejected' ? <XCircle size={11}/> : r.status === 'payment_sent' ? <AlertCircle size={11}/> : <Clock size={11}/>}
                          {meta.label}
                        </span>
                        <span style={{ background: '#1a1a24', color: '#8888a8', padding: '2px 10px', borderRadius: 20, fontSize: '.72rem', border: '1px solid #2a2a38' }}>
                          {r.plan === 'pro' ? 'Pro' : 'Free'} — R${(r.amount_cents/100).toFixed(2)}
                        </span>
                        <span style={{ background: '#1a1a24', color: '#6c63ff', padding: '2px 10px', borderRadius: 20, fontSize: '.72rem', fontFamily: 'monospace', border: '1px solid #2a2a38' }}>
                          {r.pix_txid}
                        </span>
                      </div>
                    </div>
                  </div>

                  {isActionable && (
                    <div style={{ display: 'flex', gap: '.5rem' }}>
                      <button style={btnStyle('#00d4aa', '#0a0a0f')} onClick={() => { setSelected(r); setNotes(''); }}>
                        <CheckCircle2 size={14}/> Aprovar
                      </button>
                      <button style={btnStyle('#1a1a24', '#ff4d6a')} onClick={() => rejectMutation.mutate({ id: r.id, notes: '' })}>
                        <XCircle size={14}/> Rejeitar
                      </button>
                    </div>
                  )}
                  {r.status === 'approved' && (
                    <span style={{ fontSize: '.8rem', color: '#00d4aa' }}>✓ {r.approved_by}</span>
                  )}
                </div>
                <p style={{ fontSize: '.75rem', color: '#555568', marginTop: '.75rem' }}>
                  {new Date(r.created_at).toLocaleString('pt-BR')}
                  {r.admin_notes && <span style={{ marginLeft: '1rem', fontStyle: 'italic' }}>📝 {r.admin_notes}</span>}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Approve modal */}
      {selected && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}
          onClick={e => e.target === e.currentTarget && setSelected(null)}
        >
          <div style={{ ...cardStyle, width: '100%', maxWidth: 440, padding: '1.75rem' }}>
            <h2 style={{ fontWeight: 700, marginBottom: '.75rem' }}>Aprovar conta</h2>
            <p style={{ fontSize: '.9rem', color: '#8888a8', marginBottom: '1.25rem' }}>
              Criar conta para <strong style={{ color: '#e8e8f0' }}>{selected.email}</strong> no plano <strong style={{ color: '#a89ff0' }}>Pro</strong>. Uma senha temporária será gerada automaticamente.
            </p>
            <label style={{ display: 'block', fontSize: '.78rem', color: '#8888a8', marginBottom: '.3rem' }}>Observação interna (opcional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' } as React.CSSProperties}
              placeholder="ex: PIX confirmado no extrato"
            />
            <div style={{ display: 'flex', gap: '.75rem' }}>
              <button style={btnStyle('#00d4aa', '#0a0a0f')} onClick={() => approveMutation.mutate({ id: selected.id, notes })}>
                {approveMutation.isPending ? 'Aprovando...' : '✓ Confirmar'}
              </button>
              <button style={btnStyle('#1a1a24', '#8888a8')} onClick={() => setSelected(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
