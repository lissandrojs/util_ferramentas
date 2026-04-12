import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Clock, AlertCircle, User, Copy, Plus } from 'lucide-react';
import { api } from '../services/api';

type Status = 'pending_payment'|'payment_sent'|'approved'|'rejected';

interface PurchaseRequest {
  id: string;
  name: string;
  email: string;
  plan: string;
  amount_cents: number;
  status: Status;
  pix_txid: string;
  admin_notes: string;
  approved_by: string;
  approved_at: string;
  created_at: string;
}

const STATUS_COLORS: Record<Status, { bg: string; color: string; label: string; icon: JSX.Element }> = {
  pending_payment: { bg: 'rgba(136,136,168,.1)', color: '#8888a8', label: 'Aguardando pagamento', icon: <Clock size={13}/> },
  payment_sent:    { bg: 'rgba(108,99,255,.1)',  color: '#a89ff0', label: 'Pagamento enviado ⚡', icon: <AlertCircle size={13}/> },
  approved:        { bg: 'rgba(0,212,170,.1)',   color: '#00d4aa', label: 'Aprovado',             icon: <CheckCircle2 size={13}/> },
  rejected:        { bg: 'rgba(255,77,106,.1)',  color: '#ff4d6a', label: 'Rejeitado',            icon: <XCircle size={13}/> },
};

export function PurchaseRequestsPage() {
  const qc = useQueryClient();

  const [selected, setSelected] = useState<PurchaseRequest|null>(null);
  const [notes, setNotes] = useState('');
  const [copiedCreds, setCopiedCreds] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name:'', email:'', plan:'free', password:'' });

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-requests'] });
      setSelected(null);
    },
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

  // ✅ TIPAGEM CORRIGIDA AQUI
  const s = {
    card: {
      background: '#111118',
      border: '1px solid #2a2a38',
      borderRadius: 12,
      padding: '1.25rem'
    } as React.CSSProperties,

    inp: {
      width: '100%',
      background: '#1a1a24',
      border: '1px solid #2a2a38',
      borderRadius: 8,
      color: '#e8e8f0',
      padding: '.575rem .75rem',
      fontSize: '.875rem',
      fontFamily: 'inherit',
      outline: 'none',
      marginBottom: '.75rem'
    } as React.CSSProperties,

    btn: (bg: string, fg = '#fff'): React.CSSProperties => ({
      padding: '.625rem 1.25rem',
      borderRadius: 9,
      border: 'none',
      background: bg,
      color: fg,
      cursor: 'pointer',
      fontWeight: 600,
      fontSize: '.85rem',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '.4rem'
    }),
  };

  return (
<div style={{ padding: '2.5rem', maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Solicitações de Compra</h1>
          <p style={{ color: '#8888a8', fontSize: '.875rem', marginTop: '.25rem' }}>
            Gerencie pagamentos PIX e aprovação de novos usuários
          </p>
        </div>
        <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
          {pending > 0 && (
            <div style={{ background: 'rgba(108,99,255,.15)', color: '#a89ff0', padding: '.375rem .875rem', borderRadius: 20, fontSize: '.8rem', fontWeight: 600 }}>
              ⚡ {pending} pagamento{pending > 1 ? 's' : ''} aguardando
            </div>
          )}
          <button style={s.btn('#6c63ff')} onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Criar usuário
          </button>
        </div>
      </div>

      {/* Credentials copy box */}
      {copiedCreds && (
        <div style={{ ...s.card, marginBottom: '1.25rem', background: 'rgba(0,212,170,.06)', border: '1px solid rgba(0,212,170,.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontWeight: 600, color: '#00d4aa', marginBottom: '.5rem' }}>✅ Conta criada! Credenciais para enviar ao usuário:</p>
              <pre style={{ fontFamily: 'monospace', fontSize: '.9rem', color: '#e8e8f0', background: '#1a1a24', padding: '1rem', borderRadius: 8 }}>{copiedCreds}</pre>
            </div>
            <button style={s.btn('#1a1a24', '#8888a8')} onClick={() => { navigator.clipboard.writeText(copiedCreds); }}>
              <Copy size={14}/> Copiar
            </button>
          </div>
          <button onClick={() => setCopiedCreds('')} style={{ marginTop: '.5rem', background: 'none', border: 'none', color: '#8888a8', cursor: 'pointer', fontSize: '.8rem' }}>Fechar</button>
        </div>
      )}

      {/* Create user modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }} onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
          <div style={{ ...s.card, width: '100%', maxWidth: 420, padding: '1.75rem' }}>
            <h2 style={{ fontWeight: 700, marginBottom: '1.25rem' }}>Criar usuário manualmente</h2>
            {(['name','email','password'] as const).map(field => (
              <div key={field}>
                <label style={{ display: 'block', fontSize: '.78rem', color: '#8888a8', marginBottom: '.3rem' }}>{field === 'name' ? 'Nome' : field === 'email' ? 'Email' : 'Senha (opcional)'}</label>
                <input style={s.inp} type={field === 'password' ? 'password' : field === 'email' ? 'email' : 'text'}
                  value={createForm[field]} placeholder={field === 'password' ? 'Deixe em branco para gerar' : ''}
                  onChange={e => setCreateForm(f => ({...f, [field]: e.target.value}))} />
              </div>
            ))}
            <label style={{ display: 'block', fontSize: '.78rem', color: '#8888a8', marginBottom: '.3rem' }}>Plano</label>
            <select value={createForm.plan} onChange={e => setCreateForm(f => ({...f, plan: e.target.value}))}
              style={{ ...s.inp, cursor: 'pointer' }}>
              <option value="free">Gratuito</option>
              <option value="pro">Pro</option>
            </select>
            <div style={{ display: 'flex', gap: '.75rem', marginTop: '.5rem' }}>
              <button style={s.btn('#6c63ff')} onClick={() => createUserMutation.mutate(createForm)}>
                {createUserMutation.isPending ? 'Criando...' : 'Criar conta'}
              </button>
              <button style={s.btn('#1a1a24', '#8888a8')} onClick={() => setShowCreate(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Requests list */}
      {isLoading ? (
        <p style={{ color: '#8888a8' }}>Carregando...</p>
      ) : requests.length === 0 ? (
        <div style={{ ...s.card, textAlign: 'center', padding: '3rem', color: '#8888a8' }}>
          Nenhuma solicitação ainda. Quando alguém preencher o formulário de compra aparecerá aqui.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
          {requests.map(r => {
            const st = STATUS_COLORS[r.status] || STATUS_COLORS.pending_payment;
            return (
              <div key={r.id} style={{ ...s.card, borderColor: r.status === 'payment_sent' ? 'rgba(108,99,255,.4)' : '#2a2a38' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: '.75rem', alignItems: 'flex-start' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: '#1a1a24', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <User size={18} color="#8888a8"/>
                    </div>
                    <div>
                      <p style={{ fontWeight: 600 }}>{r.name}</p>
                      <p style={{ fontSize: '.85rem', color: '#8888a8' }}>{r.email}</p>
                      <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem', flexWrap: 'wrap' }}>
                        <span style={{ ...st, padding: '2px 10px', borderRadius: 20, fontSize: '.72rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {st.icon} {st.label}
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
                  {(r.status === 'payment_sent' || r.status === 'pending_payment') && (
                    <div style={{ display: 'flex', gap: '.5rem' }}>
                      <button style={s.btn('#00d4aa', '#0a0a0f')} onClick={() => { setSelected(r); setNotes(''); }}>
                        <CheckCircle2 size={14}/> Aprovar
                      </button>
                      <button style={s.btn('#1a1a24', '#ff4d6a')} onClick={() => rejectMutation.mutate({ id: r.id, notes: '' })}>
                        <XCircle size={14}/> Rejeitar
                      </button>
                    </div>
                  )}
                  {r.status === 'approved' && (
                    <span style={{ fontSize: '.8rem', color: '#00d4aa' }}>✓ Aprovado por {r.approved_by}</span>
                  )}
                </div>
                <p style={{ fontSize: '.75rem', color: '#555568', marginTop: '.75rem' }}>
                  {new Date(r.created_at).toLocaleString('pt-BR')}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Approve modal */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }} onClick={e => e.target === e.currentTarget && setSelected(null)}>
          <div style={{ ...s.card, width: '100%', maxWidth: 440, padding: '1.75rem' }}>
            <h2 style={{ fontWeight: 700, marginBottom: '.75rem' }}>Aprovar conta</h2>
            <p style={{ fontSize: '.9rem', color: '#8888a8', marginBottom: '1.25rem' }}>
              Criar conta para <strong style={{ color: '#e8e8f0' }}>{selected.email}</strong> no plano <strong style={{ color: '#a89ff0' }}>Pro</strong>.<br/>
              Uma senha será gerada automaticamente.
            </p>
            <label style={{ display: 'block', fontSize: '.78rem', color: '#8888a8', marginBottom: '.3rem' }}>Observação interna (opcional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              style={{ ...s.inp, resize: 'vertical', marginBottom: '1rem' } as React.CSSProperties}
              placeholder="ex: pix confirmado via extrato" />
            <div style={{ display: 'flex', gap: '.75rem' }}>
              <button style={s.btn('#00d4aa', '#0a0a0f')} onClick={() => approveMutation.mutate({ id: selected.id, notes })}>
                {approveMutation.isPending ? 'Aprovando...' : '✓ Confirmar aprovação'}
              </button>
              <button style={s.btn('#1a1a24', '#8888a8')} onClick={() => setSelected(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}