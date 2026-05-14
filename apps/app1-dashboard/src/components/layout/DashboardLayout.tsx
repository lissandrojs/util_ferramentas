import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, Boxes, Users,
  Settings, LogOut, Zap, ShoppingBag, ToggleLeft,
  Key, Package, ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { authApi, api } from '../../services/api';

const NAV_ITEMS = [
  { to: '/',                  icon: LayoutDashboard, label: 'Overview',       end: true  },
  { to: '/apps',              icon: Boxes,           label: 'Apps'                       },
  { to: '/purchase-requests', icon: ShoppingBag,     label: 'Compras PIX',   badge: true },
  { to: '/plans',             icon: ToggleLeft,      label: 'Planos & Acesso'            },
  { to: '/users',             icon: Users,           label: 'Usuários'                   },
  { to: '/products',          icon: Package,         label: 'Produtos'                   },
  { to: '/licenses',          icon: Key,             label: 'Licenças'                   },
  { to: '/settings',          icon: Settings,        label: 'Configurações'              },
];

export function DashboardLayout() {
  const { user, tenant, logout } = useAuthStore();
  const navigate = useNavigate();

  // Poll pending purchases count every 30s
  const { data: pendingCount = 0 } = useQuery<number>({
    queryKey: ['pending-purchases-count'],
    queryFn: () =>
      api.get('/admin/checkout/requests')
        .then(r => (r.data.data as { status: string }[])
          .filter(p => p.status === 'payment_sent' || p.status === 'pending_payment').length
        )
        .catch(() => 0),
    refetchInterval: 30_000,
  });

  const handleLogout = async () => {
    try { await authApi.logout(); } catch { /* best effort */ }
    logout();
    navigate('/login');
  };

  const isPro = tenant?.plan === 'pro';

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>

      {/* ── Sidebar ─────────────────────────────────── */}
      <aside style={{
        width: 240,
        background: 'var(--color-surface)',
        borderRight: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0, left: 0, bottom: 0,
        zIndex: 50,
        overflowY: 'auto',
      }}>
        {/* Logo */}
        <div style={{ padding: '1.5rem 1.25rem 1rem', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9,
              background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-2))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Zap size={16} color="#fff" />
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {tenant?.name?.replace("'s Workspace", '') || 'SaaS Platform'}
              </div>
              <div style={{
                fontSize: '0.68rem', marginTop: 2,
                color: isPro ? 'var(--color-accent)' : 'var(--color-text-muted)',
                fontWeight: isPro ? 600 : 400,
              }}>
                {isPro ? '⭐ Plano Pro' : '🆓 Plano Gratuito'}
              </div>
            </div>
          </div>

          {/* Upgrade banner for free users */}
          {!isPro && (
            <a href="/checkout.html" style={{ textDecoration: 'none' }}>
              <div style={{
                marginTop: '0.875rem',
                padding: '0.5rem 0.75rem',
                borderRadius: 8,
                background: 'rgba(108,99,255,.1)',
                border: '1px solid rgba(108,99,255,.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                cursor: 'pointer',
              }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-accent)', fontWeight: 500 }}>
                  Fazer upgrade para Pro
                </span>
                <ChevronRight size={12} color="var(--color-accent)" />
              </div>
            </a>
          )}
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '0.875rem 0.75rem' }}>
          {NAV_ITEMS.map(({ to, icon: Icon, label, end, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                padding: '0.575rem 0.875rem',
                borderRadius: 'var(--radius-md)',
                marginBottom: '0.2rem',
                textDecoration: 'none',
                fontSize: '0.875rem',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)',
                background: isActive ? 'var(--color-accent-dim)' : 'transparent',
                borderLeft: isActive ? '2px solid var(--color-accent)' : '2px solid transparent',
                transition: 'all 0.15s',
              })}
            >
              <Icon size={15} />
              <span style={{ flex: 1 }}>{label}</span>
              {/* Pending badge on Compras PIX */}
              {badge && pendingCount > 0 && (
                <span style={{
                  background: 'var(--color-accent)',
                  color: '#fff',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: 20,
                  minWidth: 18,
                  textAlign: 'center',
                  lineHeight: '16px',
                  animation: 'pulse 2s infinite',
                }}>
                  {pendingCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div style={{
          padding: '1rem 1.25rem',
          borderTop: '1px solid var(--color-border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.75rem' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-2))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.8rem', fontWeight: 700, color: '#fff', flexShrink: 0,
            }}>
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.name}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.email}
              </div>
            </div>
          </div>
          <button onClick={handleLogout} className="btn-ghost" style={{ width: '100%', justifyContent: 'center', fontSize: '0.82rem' }}>
            <LogOut size={13} />
            Sair
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────── */}
      <main style={{ flex: 1, marginLeft: 240, minHeight: '100vh' }}>
        <Outlet />
      </main>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .7; }
        }
      `}</style>
    </div>
  );
}
