import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Lock, CheckCircle2, Zap } from 'lucide-react';
import { usersApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Link } from 'react-router-dom';

const APP_ICONS: Record<string, string> = {
  app1: '🎛️',
  app2: '🔗',
  app3: '🗃️',
  app4: '⬇️',
  app5: '🔄',
  app6: '🔗',
};

const APP_DESCRIPTIONS: Record<string, { tagline: string; features: string[] }> = {
  app1: {
    tagline: 'Admin Dashboard — Manage your workspace, users and billing',
    features: ['User management', 'App permissions', 'Billing & plans', 'Usage analytics'],
  },
  app2: {
    tagline: 'URL Shortener — Create short links with analytics',
    features: ['Branded short links', 'Click analytics', 'QR code generation', 'Link expiration'],
  },
  app3: {
    tagline: 'Gerenciador de Dados — Crie estruturas e gerencie qualquer dado',
    features: ['Estruturas dinâmicas', 'Campos personalizados', 'Upload de arquivos', 'Exportar Excel/CSV'],
  },
  app4: {
    tagline: 'Video Downloader — Baixe vídeos de mais de 1000 sites',
    features: ['YouTube, Instagram, TikTok', 'Escolha a qualidade', 'Download de áudio', 'Sem limite de uso'],
  },
  app5: {
    tagline: 'Conversor — Transforme JSON em Excel e vice-versa',
    features: ['JSON → Excel com múltiplas abas', 'Excel/CSV → JSON', 'Mapeamento de campos', 'Preview antes de exportar'],
  },
  app6: {
    tagline: 'Bio Link — Crie sua página "link na bio" em segundos',
    features: ['Página pública em /bio/seuusuario', 'Múltiplos links com ícones', 'Analytics de visitas e cliques', '5 temas + cor personalizada'],
  },
};

export function AppsPage() {
  const { tenant } = useAuthStore();

  const { data: apps, isLoading } = useQuery({
    queryKey: ['apps'],
    queryFn: () => usersApi.getApps().then((r) => r.data.data),
  });

  return (
    <div style={{ padding: '2.5rem', maxWidth: 1100 }} className="animate-fade-in-up">
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>Apps</h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
          All available applications in your workspace
        </p>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', gap: '1rem' }}>
          {[1, 2].map(i => (
            <div key={i} className="card" style={{ padding: '1.5rem', flex: 1, height: 200, opacity: 0.5, animation: 'pulse-glow 1.5s infinite' }} />
          ))}
        </div>
      ) : (
        <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
          {Array.isArray(apps) && apps.map((app: { key: string; description: string; path: string; hasAccess: boolean }) => {
            const meta = APP_DESCRIPTIONS[app.key] || { tagline: app.description, features: [] };
            const isLocked = !app.hasAccess;

            return (
              <div key={app.key} className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                {/* App header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 12,
                      background: 'var(--color-surface-2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.25rem', border: '1px solid var(--color-border)',
                    }}>
                      {APP_ICONS[app.key] || '📦'}
                    </div>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>{app.description}</p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{app.path}</p>
                    </div>
                  </div>
                  {isLocked ? (
                    <Lock size={16} color="var(--color-text-muted)" />
                  ) : (
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-success)', marginTop: 4 }} />
                  )}
                </div>

                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '1rem', lineHeight: 1.6 }}>
                  {meta.tagline}
                </p>

                {/* Features */}
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.25rem', flex: 1 }}>
                  {meta.features.map((f) => (
                    <li key={f} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.375rem' }}>
                      <CheckCircle2 size={12} color="var(--color-accent-2)" />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {isLocked ? (
                  <Link to="/billing" style={{ textDecoration: 'none' }}>
                    <button className="btn-ghost" style={{ width: '100%', justifyContent: 'center' }}>
                      <Zap size={14} /> Upgrade to unlock
                    </button>
                  </Link>
                ) : (
                  <a href={app.path} style={{ textDecoration: 'none' }}>
                    <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                      Open app <ExternalLink size={13} />
                    </button>
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{
        marginTop: '2rem', padding: '1.25rem 1.5rem',
        borderRadius: 'var(--radius-lg)',
        border: '1px dashed var(--color-border)',
        textAlign: 'center', color: 'var(--color-text-muted)',
      }}>
        <p style={{ fontSize: '0.875rem' }}>
          More apps coming soon — each new app is instantly available across all workspaces
        </p>
      </div>
    </div>
  );
}
