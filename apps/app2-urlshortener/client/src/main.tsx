import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Link2, Copy, Trash2, BarChart2, QrCode, ExternalLink, Plus, X, CheckCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const api = axios.create({ baseURL: '/api/app2' });

// Attach JWT from App1's auth store (same pattern as App3)
api.interceptors.request.use((config) => {
  try {
    const raw = localStorage.getItem('saas-auth');
    if (raw) {
      const store = JSON.parse(raw);
      const token = store?.state?.accessToken || store?.accessToken;
      if (token) config.headers.Authorization = `Bearer ${token}`;
    }
  } catch { /* no token */ }
  return config;
});

interface ShortLink {
  id: string;
  slug: string;
  original_url: string;
  title?: string;
  shortUrl: string;
  click_count: number;
  expires_at?: string;
  is_active: boolean;
  created_at: string;
}

// ── Create Link Form ───────────────────────────────────
function CreateLinkForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [customSlug, setCustomSlug] = useState('');
  const [error, setError] = useState('');

  const createMutation = useMutation({
    mutationFn: (data: { url: string; title?: string; customSlug?: string }) =>
      api.post('/links', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['links'] });
      onClose();
    },
    onError: (err: unknown) => {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to create link');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    createMutation.mutate({ url, title: title || undefined, customSlug: customSlug || undefined });
  };

  const s: Record<string, React.CSSProperties> = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' },
    modal: { background: '#111118', border: '1px solid #2a2a38', borderRadius: 16, padding: '2rem', width: '100%', maxWidth: 480 },
  };

  return (
    <div style={s.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={s.modal}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e8e8f0' }}>Shorten a URL</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8888a8', padding: '0.25rem' }}><X size={18} /></button>
        </div>
        {error && (
          <div style={{ padding: '0.75rem', borderRadius: 8, background: 'rgba(255,77,106,0.1)', border: '1px solid rgba(255,77,106,0.3)', color: '#ff4d6a', fontSize: '0.85rem', marginBottom: '1rem' }}>
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#8888a8', marginBottom: '0.375rem', fontWeight: 500 }}>Long URL *</label>
            <input value={url} onChange={e => setUrl(e.target.value)} type="url" required placeholder="https://very-long-url.com/with/many/params" style={{ width: '100%', background: '#1a1a24', border: '1px solid #2a2a38', borderRadius: 8, color: '#e8e8f0', padding: '0.625rem 0.875rem', fontSize: '0.875rem', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#8888a8', marginBottom: '0.375rem', fontWeight: 500 }}>Title (optional)</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="My awesome link" style={{ width: '100%', background: '#1a1a24', border: '1px solid #2a2a38', borderRadius: 8, color: '#e8e8f0', padding: '0.625rem 0.875rem', fontSize: '0.875rem', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#8888a8', marginBottom: '0.375rem', fontWeight: 500 }}>Custom slug (optional)</label>
            <input value={customSlug} onChange={e => setCustomSlug(e.target.value)} placeholder="my-link" pattern="[a-zA-Z0-9_-]{3,20}" style={{ width: '100%', background: '#1a1a24', border: '1px solid #2a2a38', borderRadius: 8, color: '#e8e8f0', padding: '0.625rem 0.875rem', fontSize: '0.875rem', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button type="button" onClick={onClose} style={{ flex: 1, background: 'transparent', border: '1px solid #2a2a38', borderRadius: 8, color: '#8888a8', padding: '0.625rem', cursor: 'pointer', fontSize: '0.875rem' }}>
              Cancel
            </button>
            <button type="submit" disabled={createMutation.isPending} style={{ flex: 2, background: '#6c63ff', border: 'none', borderRadius: 8, color: '#fff', padding: '0.625rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', opacity: createMutation.isPending ? 0.7 : 1 }}>
              {createMutation.isPending ? 'Creating...' : 'Shorten URL'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Link Card ──────────────────────────────────────────
function LinkCard({ link }: { link: ShortLink }) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qrData, setQrData] = useState('');

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/links/${link.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['links'] }),
  });

  const copyUrl = async () => {
    await navigator.clipboard.writeText(link.shortUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const loadQr = async () => {
    if (!qrData) {
      const res = await api.get(`/links/${link.id}/qr`);
      setQrData(res.data.data.qr);
    }
    setShowQr(!showQr);
  };

  const truncate = (s: string, n: number) => s.length > n ? s.slice(0, n) + '…' : s;

  return (
    <div style={{ background: '#111118', border: '1px solid #2a2a38', borderRadius: 12, padding: '1.25rem', transition: 'border-color 0.15s' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {link.title && (
            <p style={{ fontWeight: 600, fontSize: '0.9rem', color: '#e8e8f0', marginBottom: '0.25rem' }}>
              {link.title}
            </p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
            <code style={{ fontSize: '0.875rem', color: '#6c63ff', fontWeight: 600 }}>
              {link.shortUrl}
            </code>
            <button onClick={copyUrl} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? '#00d4aa' : '#8888a8', padding: '0.125rem', transition: 'color 0.15s' }}>
              {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <p style={{ fontSize: '0.75rem', color: '#8888a8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {truncate(link.original_url, 70)}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', flexShrink: 0 }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '1.125rem', fontWeight: 700, color: '#e8e8f0', lineHeight: 1 }}>
              {link.click_count.toLocaleString()}
            </p>
            <p style={{ fontSize: '0.65rem', color: '#8888a8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>clicks</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.875rem', paddingTop: '0.875rem', borderTop: '1px solid #1a1a24' }}>
        <span style={{ fontSize: '0.75rem', color: '#8888a8' }}>
          {formatDistanceToNow(new Date(link.created_at), { addSuffix: true })}
        </span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={loadQr} title="QR Code" style={{ background: 'none', border: '1px solid #2a2a38', borderRadius: 6, cursor: 'pointer', color: '#8888a8', padding: '0.3rem 0.5rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <QrCode size={12} /> QR
          </button>
          <a href={link.original_url} target="_blank" rel="noopener noreferrer" style={{ background: 'none', border: '1px solid #2a2a38', borderRadius: 6, cursor: 'pointer', color: '#8888a8', padding: '0.3rem 0.5rem', display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            <ExternalLink size={12} />
          </a>
          <button onClick={() => deleteMutation.mutate()} title="Delete" style={{ background: 'none', border: '1px solid rgba(255,77,106,0.3)', borderRadius: 6, cursor: 'pointer', color: '#ff4d6a', padding: '0.3rem 0.5rem', display: 'flex', alignItems: 'center' }}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {showQr && qrData && (
        <div style={{ marginTop: '1rem', textAlign: 'center' }}>
          <img src={qrData} alt="QR Code" style={{ borderRadius: 8, maxWidth: 160 }} />
        </div>
      )}
    </div>
  );
}

// ── Main App ───────────────────────────────────────────
function URLShortener() {
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['links'],
    queryFn: () => api.get('/links').then(r => r.data),
  });

  const links: ShortLink[] = data?.data || [];
  const total: number = data?.pagination?.total || 0;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e8e8f0', fontFamily: 'Inter, system-ui, sans-serif', padding: '0' }}>
      {/* Header */}
      <header style={{ background: '#111118', borderBottom: '1px solid #2a2a38', padding: '1rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #6c63ff, #00d4aa)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Link2 size={16} color="#fff" />
          </div>
          <div>
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>URL Shortener</span>
            <span style={{ marginLeft: '0.75rem', fontSize: '0.75rem', color: '#8888a8', fontFamily: 'monospace' }}>/app2</span>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} style={{ background: '#6c63ff', border: 'none', borderRadius: 8, color: '#fff', padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={14} /> New link
        </button>
      </header>

      <main style={{ padding: '2rem', maxWidth: 900, margin: '0 auto' }}>
        {/* Stats bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
          {[
            { label: 'Total Links', value: total },
            { label: 'Total Clicks', value: links.reduce((s, l) => s + l.click_count, 0).toLocaleString() },
            { label: 'Active Links', value: links.filter(l => l.is_active).length },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: '#111118', border: '1px solid #2a2a38', borderRadius: 12, padding: '1.25rem' }}>
              <p style={{ fontSize: '0.75rem', color: '#8888a8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.375rem' }}>{label}</p>
              <p style={{ fontSize: '1.75rem', fontWeight: 700 }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Links list */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#8888a8' }}>Loading links...</div>
        ) : links.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#8888a8', background: '#111118', border: '1px dashed #2a2a38', borderRadius: 16 }}>
            <Link2 size={32} style={{ marginBottom: '1rem', opacity: 0.4, display: 'block', margin: '0 auto 1rem' }} />
            <p style={{ fontWeight: 500, marginBottom: '0.5rem' }}>No links yet</p>
            <p style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>Create your first short link to get started</p>
            <button onClick={() => setShowCreate(true)} style={{ background: '#6c63ff', border: 'none', borderRadius: 8, color: '#fff', padding: '0.625rem 1.25rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }}>
              Create first link
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {links.map((link) => <LinkCard key={link.id} link={link} />)}
          </div>
        )}
      </main>

      {showCreate && <CreateLinkForm onClose={() => setShowCreate(false)} />}
    </div>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <URLShortener />
    </QueryClientProvider>
  </React.StrictMode>
);
