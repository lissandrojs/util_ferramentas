import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';

// ── Types ──────────────────────────────────────────────────
interface BioLink { id: string; title: string; url: string; icon: string; type: string; is_active: boolean; click_count: number; order_index: number; }
interface BioPage { id: string; username: string; title: string; description: string; avatar_url: string; theme: string; bg_color: string; accent_color: string; is_active: boolean; total_views: number; link_count: number; links?: BioLink[]; }
interface Analytics { total_views: number; views_by_day: { day: string; views: string }[]; top_links: { id: string; title: string; icon: string; clicks: string }[]; }

// ── Colors ─────────────────────────────────────────────────
const C = { bg:'#0a0a0f', sur:'#111118', sur2:'#1a1a24', brd:'#2a2a38', brd2:'#3a3a4e', txt:'#e8e8f0', mut:'#8888a8', acc:'#6c63ff', ok:'#00d4aa', err:'#ff4d6a', wrn:'#ffb347' };
const card: React.CSSProperties = { background: C.sur, border: `1px solid ${C.brd}`, borderRadius: 12 };
const inp: React.CSSProperties = { width: '100%', background: C.sur2, border: `1px solid ${C.brd}`, borderRadius: 8, color: C.txt, padding: '.575rem .75rem', fontSize: '.875rem', fontFamily: 'inherit', outline: 'none' };
const btn = (bg: string, fg = '#fff'): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: '.4rem', padding: '.575rem 1rem', borderRadius: 8, border: 'none', background: bg, color: fg, cursor: 'pointer', fontWeight: 600, fontSize: '.85rem', transition: 'opacity .15s' });

const LINK_TYPES = [
  { key: 'link', label: 'Link comum', icon: '🔗' },
  { key: 'instagram', label: 'Instagram', icon: '📷' },
  { key: 'tiktok', label: 'TikTok', icon: '🎵' },
  { key: 'youtube', label: 'YouTube', icon: '▶️' },
  { key: 'twitter', label: 'Twitter/X', icon: '𝕏' },
  { key: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { key: 'spotify', label: 'Spotify', icon: '🎧' },
  { key: 'email', label: 'E-mail', icon: '✉️' },
  { key: 'github', label: 'GitHub', icon: '💻' },
];

const THEMES = [
  { key: 'dark', label: 'Escuro', bg: '#0a0a0f', text: '#e8e8f0' },
  { key: 'light', label: 'Claro', bg: '#f5f5f7', text: '#1a1a2e' },
  { key: 'gradient', label: 'Gradiente', bg: 'linear-gradient(135deg,#1a1a2e,#0f3460)', text: '#e8e8f0' },
  { key: 'minimal', label: 'Minimal', bg: '#fafafa', text: '#000' },
  { key: 'neon', label: 'Neon', bg: '#080810', text: '#e0e0ff' },
];

const SITE_URL = window.location.origin;

// ── Auth helper ───────────────────────────────────────────
function getToken(): string {
  try {
    const raw = localStorage.getItem('saas-auth');
    if (raw) {
      const s = JSON.parse(raw);
      return s?.state?.accessToken || s?.accessToken || '';
    }
  } catch { /**/ }
  return '';
}

async function apiFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  const token = getToken();
  return fetch('/api/bio' + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
}

// ─────────────────────────────────────────────────────────
// LIVE PREVIEW
// ─────────────────────────────────────────────────────────
function LivePreview({ page, links }: { page: Partial<BioPage>; links: BioLink[] }) {
  const themes: Record<string, { bg: string; card: string; text: string; sub: string; brd: string }> = {
    dark:     { bg: '#0a0a0f', card: '#111118', text: '#e8e8f0', sub: '#8888a8', brd: '#2a2a38' },
    light:    { bg: '#f5f5f7', card: '#fff', text: '#1a1a2e', sub: '#666', brd: '#e5e5ea' },
    gradient: { bg: 'linear-gradient(135deg,#1a1a2e,#0f3460)', card: 'rgba(255,255,255,.08)', text: '#e8e8f0', sub: '#aac', brd: 'rgba(255,255,255,.15)' },
    minimal:  { bg: '#fafafa', card: '#fff', text: '#000', sub: '#666', brd: '#eee' },
    neon:     { bg: '#080810', card: '#10101a', text: '#e0e0ff', sub: '#88c', brd: '#303050' },
  };
  const t = themes[page.theme || 'dark'] || themes.dark;
  const acc = page.accent_color || '#6c63ff';

  return (
    <div style={{ width: 280, flexShrink: 0 }}>
      <p style={{ fontSize: '.75rem', color: C.mut, marginBottom: '.625rem', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>Prévia ao vivo</p>
      <div style={{ background: t.bg, borderRadius: 20, border: `1px solid ${C.brd}`, padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: 420, maxHeight: 600, overflowY: 'auto' }}>
        {page.avatar_url
          ? <img src={page.avatar_url} alt="" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${acc}`, marginBottom: '.875rem' }} onError={e => { (e.target as HTMLImageElement).style.display='none'; }}/>
          : <div style={{ width: 72, height: 72, borderRadius: '50%', background: acc, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 700, color: '#fff', marginBottom: '.875rem' }}>{(page.title || 'B').charAt(0)}</div>
        }
        <p style={{ fontWeight: 700, fontSize: '1rem', color: t.text, textAlign: 'center', marginBottom: '.25rem' }}>{page.title || 'Seu Nome'}</p>
        {page.description && <p style={{ fontSize: '.78rem', color: t.sub, textAlign: 'center', marginBottom: '.875rem', lineHeight: 1.5 }}>{page.description}</p>}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '.5rem', marginTop: !page.description ? '.875rem' : 0 }}>
          {links.filter(l => l.is_active).map(l => (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.625rem .75rem', background: t.card, border: `1px solid ${t.brd}`, borderRadius: 10, cursor: 'pointer' }}>
              <span style={{ fontSize: '1rem', minWidth: 22 }}>{l.icon}</span>
              <span style={{ flex: 1, fontSize: '.82rem', fontWeight: 500, color: t.text }}>{l.title}</span>
              <span style={{ fontSize: '.75rem', color: t.sub }}>↗</span>
            </div>
          ))}
          {links.filter(l => l.is_active).length === 0 && (
            <p style={{ textAlign: 'center', color: t.sub, fontSize: '.8rem', padding: '1rem 0' }}>Adicione links →</p>
          )}
        </div>
        <p style={{ fontSize: '.65rem', color: t.sub, marginTop: '1.25rem', opacity: .5 }}>util-ferramentas.onrender.com</p>
      </div>
      {page.username && (
        <a href={`${SITE_URL}/bio/${page.username}`} target="_blank" rel="noopener noreferrer"
          style={{ display: 'block', marginTop: '.75rem', textAlign: 'center', fontSize: '.8rem', color: C.acc }}>
          🔗 /bio/{page.username} ↗
        </a>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────
function App() {
  const [view, setView] = useState<'list'|'editor'|'analytics'>('list');
  const [pages, setPages] = useState<BioPage[]>([]);
  const [currentPage, setCurrentPage] = useState<BioPage | null>(null);
  const [links, setLinks] = useState<BioLink[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  // Form state
  const [form, setForm] = useState({ username:'', title:'', description:'', avatar_url:'', theme:'dark', accent_color:'#6c63ff' });
  const [showAddLink, setShowAddLink] = useState(false);
  const [linkForm, setLinkForm] = useState({ title:'', url:'', type:'link', icon:'' });
  const [usernameStatus, setUsernameStatus] = useState<'idle'|'checking'|'ok'|'taken'>('idle');
  const usernameTimer = useRef<ReturnType<typeof setTimeout>>();

  const loadPages = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch('/pages');
      if (r.ok) setPages(await r.json().then(j => j.data));
      else if (r.status === 401) setError('Faça login no App1 para usar o Bio Link');
    } catch { setError('Erro de conexão'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadPages(); }, [loadPages]);

  const openEditor = async (page: BioPage) => {
    const r = await apiFetch(`/pages/${page.id}`);
    if (!r.ok) return;
    const data = await r.json().then((j: { data: BioPage }) => j.data);
    setCurrentPage(data);
    setLinks(data.links || []);
    setForm({ username: data.username, title: data.title, description: data.description || '', avatar_url: data.avatar_url || '', theme: data.theme, accent_color: data.accent_color || '#6c63ff' });
    setView('editor');
  };

  const openAnalytics = async (page: BioPage) => {
    setCurrentPage(page);
    const r = await apiFetch(`/pages/${page.id}/analytics`);
    if (r.ok) setAnalytics(await r.json().then((j: { data: Analytics }) => j.data));
    setView('analytics');
  };

  const createPage = async () => {
    if (!form.username || !form.title) return;
    const r = await apiFetch('/pages', { method: 'POST', body: JSON.stringify(form) });
    const j = await r.json();
    if (r.ok) { setPages(p => [j.data, ...p]); openEditor(j.data); }
    else setError(j.error || 'Erro');
  };

  const savePage = async () => {
    if (!currentPage) return;
    const r = await apiFetch(`/pages/${currentPage.id}`, { method: 'PATCH', body: JSON.stringify(form) });
    if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); setCurrentPage(p => ({ ...p!, ...form })); }
  };

  const addLink = async () => {
    if (!currentPage || !linkForm.title || !linkForm.url) return;
    const icon = linkForm.icon || LINK_TYPES.find(t => t.key === linkForm.type)?.icon || '🔗';
    const r = await apiFetch(`/pages/${currentPage.id}/links`, { method: 'POST', body: JSON.stringify({ ...linkForm, icon }) });
    if (r.ok) {
      const link = await r.json().then((j: { data: BioLink }) => j.data);
      setLinks(l => [...l, link]);
      setLinkForm({ title: '', url: '', type: 'link', icon: '' });
      setShowAddLink(false);
    }
  };

  const toggleLink = async (link: BioLink) => {
    const r = await apiFetch(`/pages/${currentPage!.id}/links/${link.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !link.is_active }) });
    if (r.ok) setLinks(ls => ls.map(l => l.id === link.id ? { ...l, is_active: !l.is_active } : l));
  };

  const deleteLink = async (linkId: string) => {
    await apiFetch(`/pages/${currentPage!.id}/links/${linkId}`, { method: 'DELETE' });
    setLinks(ls => ls.filter(l => l.id !== linkId));
  };

  const checkUsername = (val: string) => {
    clearTimeout(usernameTimer.current);
    setForm(f => ({ ...f, username: val }));
    if (!val || val.length < 3 || val === currentPage?.username) { setUsernameStatus('idle'); return; }
    setUsernameStatus('checking');
    usernameTimer.current = setTimeout(async () => {
      const r = await apiFetch(`/check-username/${val}`);
      if (r.ok) {
        const { available } = await r.json();
        setUsernameStatus(available ? 'ok' : 'taken');
      }
    }, 600);
  };

  // ── VIEWS ─────────────────────────────────────────────
  if (view === 'analytics' && currentPage && analytics) {
    const maxViews = Math.max(...analytics.views_by_day.map(d => parseInt(d.views)), 1);
    return (
      <div style={{ minHeight: '100vh', background: C.bg, color: C.txt, fontFamily: 'Inter, system-ui, sans-serif', padding: '2rem 1.5rem' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <button style={{ ...btn('transparent', C.mut), marginBottom: '1.5rem', padding: 0 }} onClick={() => setView('list')}>← Voltar</button>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '.25rem' }}>Analytics — /bio/{currentPage.username}</h1>
          <p style={{ color: C.mut, fontSize: '.875rem', marginBottom: '2rem' }}>Últimos 30 dias</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '1rem', marginBottom: '2rem' }}>
            {[
              { label: 'Total de Visitas', val: analytics.total_views },
              { label: 'Visitas (30 dias)', val: analytics.views_by_day.reduce((a, d) => a + parseInt(d.views), 0) },
              { label: 'Links Clicados', val: analytics.top_links.reduce((a, l) => a + parseInt(l.clicks), 0) },
            ].map(s => (
              <div key={s.label} style={{ ...card, padding: '1.25rem', textAlign: 'center' }}>
                <p style={{ fontSize: '1.75rem', fontWeight: 700, color: C.acc }}>{s.val.toLocaleString('pt-BR')}</p>
                <p style={{ fontSize: '.78rem', color: C.mut, marginTop: '.25rem' }}>{s.label}</p>
              </div>
            ))}
          </div>

          <div style={{ ...card, padding: '1.25rem', marginBottom: '1.5rem' }}>
            <p style={{ fontWeight: 600, marginBottom: '1rem' }}>Visitas por dia</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
              {analytics.views_by_day.slice(0, 30).reverse().map((d, i) => (
                <div key={i} title={`${new Date(d.day).toLocaleDateString('pt-BR')}: ${d.views} visitas`}
                  style={{ flex: 1, background: C.acc, borderRadius: '3px 3px 0 0', minWidth: 4, height: `${Math.max(4, (parseInt(d.views) / maxViews) * 72)}px`, opacity: .8, cursor: 'pointer' }} />
              ))}
              {analytics.views_by_day.length === 0 && <p style={{ color: C.mut, fontSize: '.85rem' }}>Sem dados ainda</p>}
            </div>
          </div>

          <div style={{ ...card, padding: '1.25rem' }}>
            <p style={{ fontWeight: 600, marginBottom: '1rem' }}>Links mais clicados</p>
            {analytics.top_links.length === 0
              ? <p style={{ color: C.mut, fontSize: '.875rem' }}>Nenhum clique ainda</p>
              : analytics.top_links.map(l => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.625rem 0', borderBottom: `1px solid ${C.brd}` }}>
                  <span style={{ fontSize: '1.1rem' }}>{l.icon}</span>
                  <span style={{ flex: 1, fontSize: '.875rem' }}>{l.title}</span>
                  <span style={{ fontWeight: 600, color: C.acc }}>{l.clicks}</span>
                  <span style={{ color: C.mut, fontSize: '.78rem' }}>cliques</span>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    );
  }

  if (view === 'editor' && currentPage) {
    const pageForPreview = { ...currentPage, ...form };
    return (
      <div style={{ minHeight: '100vh', background: C.bg, color: C.txt, fontFamily: 'Inter, system-ui, sans-serif' }}>
        {/* Header */}
        <div style={{ background: C.sur, borderBottom: `1px solid ${C.brd}`, padding: '.875rem 1.5rem', display: 'flex', alignItems: 'center', gap: '.75rem' }}>
          <button style={{ ...btn('transparent', C.mut), padding: 0 }} onClick={() => setView('list')}>←</button>
          <span style={{ fontWeight: 700 }}>Editando /bio/{currentPage.username}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            {saved && <span style={{ color: C.ok, fontSize: '.85rem' }}>✓ Salvo</span>}
            <a href={`${SITE_URL}/bio/${currentPage.username}`} target="_blank" rel="noopener noreferrer" style={{ ...btn(C.sur2, C.mut), textDecoration: 'none' }}>Ver página ↗</a>
            <button style={btn(C.acc)} onClick={savePage}>Salvar</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1.5rem', padding: '1.5rem', maxWidth: 1100, margin: '0 auto', flexWrap: 'wrap' }}>
          {/* Left panel */}
          <div style={{ flex: 1, minWidth: 300, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* Profile */}
            <div style={{ ...card, padding: '1.25rem' }}>
              <p style={{ fontWeight: 600, marginBottom: '1rem', fontSize: '.9rem' }}>Perfil</p>
              <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.75rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '.75rem', color: C.mut, marginBottom: '.3rem' }}>Username *</label>
                  <div style={{ position: 'relative' }}>
                    <input value={form.username} onChange={e => checkUsername(e.target.value)} style={{ ...inp, borderColor: usernameStatus === 'taken' ? C.err : usernameStatus === 'ok' ? C.ok : C.brd, paddingRight: '2rem' }} placeholder="meu-nome" />
                    <span style={{ position: 'absolute', right: '.5rem', top: '50%', transform: 'translateY(-50%)', fontSize: '.8rem' }}>
                      {usernameStatus === 'checking' ? '⏳' : usernameStatus === 'ok' ? '✅' : usernameStatus === 'taken' ? '❌' : ''}
                    </span>
                  </div>
                  {usernameStatus === 'taken' && <p style={{ fontSize: '.72rem', color: C.err, marginTop: '.25rem' }}>Username já está em uso</p>}
                </div>
              </div>
              {[
                { label: 'Nome de exibição *', key: 'title', placeholder: 'Seu nome ou marca' },
                { label: 'Descrição', key: 'description', placeholder: 'Uma frase sobre você' },
                { label: 'URL do avatar', key: 'avatar_url', placeholder: 'https://...' },
              ].map(f => (
                <div key={f.key} style={{ marginBottom: '.75rem' }}>
                  <label style={{ display: 'block', fontSize: '.75rem', color: C.mut, marginBottom: '.3rem' }}>{f.label}</label>
                  <input value={form[f.key as keyof typeof form]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={inp} placeholder={f.placeholder} />
                </div>
              ))}
            </div>

            {/* Theme */}
            <div style={{ ...card, padding: '1.25rem' }}>
              <p style={{ fontWeight: 600, marginBottom: '1rem', fontSize: '.9rem' }}>Aparência</p>
              <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.875rem' }}>
                {THEMES.map(th => (
                  <button key={th.key} onClick={() => setForm(f => ({ ...f, theme: th.key }))}
                    style={{ padding: '.375rem .75rem', borderRadius: 8, border: `2px solid ${form.theme === th.key ? C.acc : C.brd}`, background: th.bg, color: th.text, cursor: 'pointer', fontSize: '.78rem', fontWeight: 500, minWidth: 70, textAlign: 'center' }}>
                    {th.label}
                  </button>
                ))}
              </div>
              <label style={{ display: 'block', fontSize: '.75rem', color: C.mut, marginBottom: '.3rem' }}>Cor de destaque</label>
              <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                <input type="color" value={form.accent_color} onChange={e => setForm(f => ({ ...f, accent_color: e.target.value }))} style={{ width: 36, height: 28, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
                <span style={{ fontFamily: 'monospace', fontSize: '.8rem', color: C.mut }}>{form.accent_color}</span>
                {['#6c63ff','#00d4aa','#ff4d6a','#ffb347','#4ecdc4','#ff6b9d'].map(c => (
                  <button key={c} onClick={() => setForm(f => ({ ...f, accent_color: c }))} style={{ width: 20, height: 20, borderRadius: '50%', background: c, border: form.accent_color === c ? `2px solid #fff` : 'none', cursor: 'pointer' }} />
                ))}
              </div>
            </div>

            {/* Links */}
            <div style={{ ...card, padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <p style={{ fontWeight: 600, fontSize: '.9rem' }}>Links ({links.filter(l => l.is_active).length} ativos)</p>
                <button style={btn(C.acc)} onClick={() => setShowAddLink(true)}>+ Adicionar</button>
              </div>

              {showAddLink && (
                <div style={{ background: C.sur2, border: `1px solid ${C.brd2}`, borderRadius: 10, padding: '1rem', marginBottom: '1rem' }}>
                  <p style={{ fontWeight: 600, fontSize: '.85rem', marginBottom: '.875rem' }}>Novo link</p>
                  <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.75rem' }}>
                    {LINK_TYPES.map(t => (
                      <button key={t.key} onClick={() => setLinkForm(f => ({ ...f, type: t.key, icon: t.icon }))}
                        style={{ padding: '.25rem .625rem', borderRadius: 7, border: `1px solid ${linkForm.type === t.key ? C.acc : C.brd}`, background: linkForm.type === t.key ? `rgba(108,99,255,.15)` : 'transparent', color: linkForm.type === t.key ? C.acc : C.mut, cursor: 'pointer', fontSize: '.75rem', display: 'flex', alignItems: 'center', gap: '.3rem' }}>
                        {t.icon} {t.label}
                      </button>
                    ))}
                  </div>
                  {[
                    { label: 'Título *', key: 'title', ph: 'Instagram', type: 'text' },
                    { label: 'URL *', key: 'url', ph: 'https://instagram.com/...', type: 'url' },
                  ].map(f => (
                    <div key={f.key} style={{ marginBottom: '.625rem' }}>
                      <label style={{ display: 'block', fontSize: '.73rem', color: C.mut, marginBottom: '.25rem' }}>{f.label}</label>
                      <input value={linkForm[f.key as 'title'|'url']} type={f.type} onChange={e => setLinkForm(p => ({ ...p, [f.key]: e.target.value }))} style={inp} placeholder={f.ph} />
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: '.5rem' }}>
                    <button style={btn(C.acc)} onClick={addLink}>Adicionar link</button>
                    <button style={{ ...btn(C.sur2, C.mut), border: `1px solid ${C.brd}` }} onClick={() => setShowAddLink(false)}>Cancelar</button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                {links.length === 0 && <p style={{ color: C.mut, fontSize: '.875rem', padding: '.5rem 0' }}>Nenhum link ainda. Clique em "+ Adicionar".</p>}
                {links.map(l => (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '.625rem', padding: '.625rem .875rem', background: l.is_active ? C.sur2 : '#15151f', borderRadius: 9, border: `1px solid ${C.brd}`, opacity: l.is_active ? 1 : .5 }}>
                    <span style={{ fontSize: '1.1rem' }}>{l.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '.875rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</p>
                      <p style={{ fontSize: '.72rem', color: C.mut, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.url}</p>
                    </div>
                    <span style={{ fontSize: '.72rem', color: C.mut }}>{l.click_count} cliques</span>
                    <button onClick={() => toggleLink(l)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '.8rem', color: l.is_active ? C.ok : C.mut }}>
                      {l.is_active ? '●' : '○'}
                    </button>
                    <button onClick={() => deleteLink(l.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.err, fontSize: '.85rem', padding: '.25rem' }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Live preview */}
          <LivePreview page={pageForPreview} links={links} />
        </div>
      </div>
    );
  }

  // ── LIST VIEW ─────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.txt, fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: C.sur, borderBottom: `1px solid ${C.brd}`, padding: '.875rem 2rem', display: 'flex', alignItems: 'center', gap: '.75rem' }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: `linear-gradient(135deg,${C.acc},${C.ok})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>🔗</div>
        <span style={{ fontWeight: 700, fontSize: '.9rem' }}>Bio Link</span>
        <span style={{ fontFamily: 'monospace', fontSize: '.7rem', color: C.mut }}>/ app6</span>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Minhas páginas Bio Link</h1>
            <p style={{ color: C.mut, fontSize: '.875rem', marginTop: '.25rem' }}>Crie sua página "link na bio" em segundos. Compartilhe com todos.</p>
          </div>
          <button style={btn(C.acc)} onClick={() => setShowCreate(true)}>+ Nova página</button>
        </div>

        {error && <div style={{ padding: '.875rem', background: 'rgba(255,77,106,.08)', border: `1px solid rgba(255,77,106,.3)`, borderRadius: 10, color: C.err, marginBottom: '1.25rem', fontSize: '.875rem' }}>{error}</div>}

        {showCreate && (
          <div style={{ ...card, padding: '1.5rem', marginBottom: '1.5rem' }}>
            <h2 style={{ fontWeight: 700, marginBottom: '1.25rem', fontSize: '1rem' }}>Criar nova página</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '.875rem', marginBottom: '1rem' }}>
              {[
                { label: 'Nome de exibição *', key: 'title', ph: 'Seu Nome' },
                { label: 'Username * (aparece na URL)', key: 'username', ph: 'meu-nome' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ display: 'block', fontSize: '.75rem', color: C.mut, marginBottom: '.3rem' }}>{f.label}</label>
                  <input value={form[f.key as 'title'|'username']} onChange={e => {
                    if (f.key === 'username') checkUsername(e.target.value);
                    else setForm(p => ({ ...p, [f.key]: e.target.value }));
                  }} style={{ ...inp, borderColor: f.key === 'username' && usernameStatus === 'taken' ? C.err : C.brd }} placeholder={f.ph} />
                  {f.key === 'username' && usernameStatus === 'taken' && <p style={{ fontSize: '.72rem', color: C.err, marginTop: '.2rem' }}>Username em uso</p>}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '.75rem' }}>
              <button style={btn(C.acc)} onClick={createPage} disabled={!form.username || !form.title || usernameStatus === 'taken'}>Criar página</button>
              <button style={{ ...btn(C.sur2, C.mut), border: `1px solid ${C.brd}` }} onClick={() => setShowCreate(false)}>Cancelar</button>
            </div>
          </div>
        )}

        {loading ? (
          <p style={{ color: C.mut }}>Carregando...</p>
        ) : pages.length === 0 && !showCreate ? (
          <div style={{ ...card, padding: '3rem', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔗</div>
            <h2 style={{ fontWeight: 600, marginBottom: '.5rem' }}>Crie sua primeira página Bio Link</h2>
            <p style={{ color: C.mut, marginBottom: '1.5rem', maxWidth: 400, margin: '0 auto .875rem' }}>Uma página com todos os seus links importantes para colocar na bio do Instagram e TikTok.</p>
            <button style={btn(C.acc)} onClick={() => setShowCreate(true)}>+ Criar página grátis</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '1.25rem' }}>
            {pages.map(p => (
              <div key={p.id} style={{ ...card, padding: '1.25rem', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '1rem' }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: C.acc, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.1rem', color: '#fff', flexShrink: 0 }}>
                    {p.title.charAt(0)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</p>
                    <a href={`${SITE_URL}/bio/${p.username}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '.78rem', color: C.acc }}>
                      /bio/{p.username} ↗
                    </a>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem' }}>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontWeight: 700, color: C.acc, fontSize: '1.1rem' }}>{p.total_views}</p>
                    <p style={{ fontSize: '.7rem', color: C.mut }}>visitas</p>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontWeight: 700, color: C.ok, fontSize: '1.1rem' }}>{(p as BioPage & { link_count: number }).link_count ?? 0}</p>
                    <p style={{ fontSize: '.7rem', color: C.mut }}>links</p>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontWeight: 700, fontSize: '1.1rem', color: p.is_active ? C.ok : C.err }}>{p.is_active ? '●' : '○'}</p>
                    <p style={{ fontSize: '.7rem', color: C.mut }}>{p.is_active ? 'ativa' : 'inativa'}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '.5rem', marginTop: 'auto' }}>
                  <button style={{ ...btn(C.acc), flex: 1, justifyContent: 'center' }} onClick={() => openEditor(p)}>✏️ Editar</button>
                  <button style={{ ...btn(C.sur2, C.mut), border: `1px solid ${C.brd}` }} onClick={() => openAnalytics(p)}>📊</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}input:focus{border-color:${C.acc}!important;box-shadow:0 0 0 3px rgba(108,99,255,.2);outline:none}button:hover:not(:disabled){opacity:.85}body{-webkit-font-smoothing:antialiased}`}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
