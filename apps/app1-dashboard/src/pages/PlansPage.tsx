import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Lock, Unlock } from 'lucide-react';
import { api } from '../services/api';

const APP_META: Record<string, { name: string; icon: string; path: string }> = {
  app2: { name: 'Encurtador de Links', icon: '🔗', path: '/app2' },
  app3: { name: 'Gerenciador de Dados', icon: '🗃️', path: '/app3' },
  app4: { name: 'Video Downloader', icon: '⬇️', path: '/app4' },
  app5: { name: 'Conversor JSON↔Excel', icon: '🔄', path: '/app5' },
  app6: { name: 'Bio Link', icon: '🔗', path: '/app6' },
};

const PLANS = ['free', 'pro'];

export function PlansPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['plan-apps'],
    queryFn: () => api.get('/admin/checkout/plans').then(r => r.data),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ plan, appKey, can_access }: { plan: string; appKey: string; can_access: boolean }) =>
      api.patch(`/admin/checkout/plans/${plan}/${appKey}`, { can_access }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan-apps'] }),
  });

  const planApps: { plan: string; app_key: string; can_access: boolean }[] = data?.data || [];

  const getAccess = (plan: string, appKey: string) => {
    const entry = planApps.find(p => p.plan === plan && p.app_key === appKey);
    return entry?.can_access ?? false;
  };

  const s: Record<string, React.CSSProperties> = {
    card: { background: '#111118', border: '1px solid #2a2a38', borderRadius: 12, padding: '1.5rem' },
  };

  return (
    <div style={{ padding: '2.5rem', maxWidth: 900 }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Configuração de Planos</h1>
        <p style={{ color: '#8888a8', fontSize: '.875rem', marginTop: '.25rem' }}>
          Defina quais apps cada plano pode acessar. Alterações têm efeito imediato para todos os usuários.
        </p>
      </div>

      {isLoading ? <p style={{ color: '#8888a8' }}>Carregando...</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
          {PLANS.map(plan => (
            <div key={plan} style={s.card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '1.25rem', paddingBottom: '1rem', borderBottom: '1px solid #2a2a38' }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: plan === 'pro' ? 'rgba(108,99,255,.15)' : 'rgba(0,212,170,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                  {plan === 'pro' ? '⭐' : '🆓'}
                </div>
                <div>
                  <p style={{ fontWeight: 700, textTransform: 'capitalize' }}>{plan === 'pro' ? 'Pro' : 'Gratuito'}</p>
                  <p style={{ fontSize: '.75rem', color: '#8888a8' }}>
                    {plan === 'pro' ? 'R$29,90/mês' : 'Sem custo'}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '.625rem' }}>
                {Object.entries(APP_META).map(([appKey, meta]) => {
                  const hasAccess = getAccess(plan, appKey);
                  return (
                    <div key={appKey} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.625rem .875rem', background: hasAccess ? 'rgba(0,212,170,.05)' : '#1a1a24', borderRadius: 9, border: `1px solid ${hasAccess ? 'rgba(0,212,170,.2)' : '#2a2a38'}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                        <span>{meta.icon}</span>
                        <span style={{ fontSize: '.85rem', color: hasAccess ? '#e8e8f0' : '#8888a8' }}>{meta.name}</span>
                      </div>
                      <button
                        onClick={() => toggleMutation.mutate({ plan, appKey, can_access: !hasAccess })}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', padding: '.3rem .75rem', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '.75rem', fontWeight: 600, background: hasAccess ? 'rgba(0,212,170,.1)' : '#2a2a38', color: hasAccess ? '#00d4aa' : '#8888a8', transition: 'all .15s' }}
                      >
                        {hasAccess ? <><Unlock size={11}/> Liberado</> : <><Lock size={11}/> Bloqueado</>}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #2a2a38', fontSize: '.75rem', color: '#8888a8' }}>
                {Object.entries(APP_META).filter(([k]) => getAccess(plan, k)).length} de {Object.keys(APP_META).length} apps liberados
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ ...s.card, marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '.75rem' }}>Como funciona o controle de acesso</h2>
        <div style={{ display: 'grid', gap: '.5rem', fontSize: '.85rem', color: '#8888a8', lineHeight: 1.6 }}>
          <p>• Cada usuário tem um <strong style={{ color: '#e8e8f0' }}>plano</strong> (free ou pro) definido no seu tenant.</p>
          <p>• Esta tabela define quais apps cada plano pode acessar. Você pode alterar a qualquer momento.</p>
          <p>• Para dar acesso especial a um usuário específico, acesse a página de Usuários e ajuste as permissões individualmente.</p>
          <p>• O App1 (dashboard) sempre está disponível para todos os usuários com conta.</p>
        </div>
      </div>
    </div>
  );
}
