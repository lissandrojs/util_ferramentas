import React, { useState, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { Download, Link2, Loader2, AlertCircle, CheckCircle2, Film, Music, ChevronDown, X, Clock, User, RefreshCw } from 'lucide-react';

interface VideoFormat {
  id: string;
  label: string;
  ext: string;
  resolution: string;
  filesize_fmt: string;
  is_audio_only: boolean;
}

interface VideoInfo {
  title: string;
  thumbnail: string;
  duration_fmt: string;
  uploader: string;
  extractor: string;
  description?: string;
  formats: VideoFormat[];
}

type AppState = 'idle' | 'loading-info' | 'ready' | 'downloading' | 'done' | 'error';

const SUPPORTED_SITES = [
  { name: 'YouTube', icon: '▶', color: '#ff0000' },
  { name: 'Instagram', icon: '📷', color: '#e1306c' },
  { name: 'TikTok', icon: '♪', color: '#010101' },
  { name: 'Twitter/X', icon: '𝕏', color: '#1da1f2' },
  { name: 'Vimeo', icon: '🎬', color: '#1ab7ea' },
  { name: 'Facebook', icon: 'f', color: '#1877f2' },
  { name: 'Reddit', icon: 'r/', color: '#ff4500' },
  { name: 'Twitch', icon: '🟣', color: '#9146ff' },
];

function App() {
  const [url, setUrl]                 = useState('');
  const [state, setState]             = useState<AppState>('idle');
  const [info, setInfo]               = useState<VideoInfo | null>(null);
  const [selectedFormat, setSelected] = useState<VideoFormat | null>(null);
  const [error, setError]             = useState('');
  const [showFormats, setShowFormats] = useState(false);
  const [progress, setProgress]       = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const s: Record<string, React.CSSProperties> = {
    bg:      { minHeight: '100vh', background: '#0a0a0f', color: '#e8e8f0', fontFamily: 'Inter, system-ui, sans-serif', padding: '0' },
    header:  { background: '#111118', borderBottom: '1px solid #2a2a38', padding: '1rem 2rem', display: 'flex', alignItems: 'center', gap: '.75rem' },
    logo:    { width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #6c63ff, #00d4aa)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    main:    { maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem' },
    card:    { background: '#111118', border: '1px solid #2a2a38', borderRadius: 16, padding: '2rem' },
    input:   { flex: 1, background: '#1a1a24', border: '1px solid #2a2a38', borderRadius: 10, color: '#e8e8f0', padding: '.75rem 1rem', fontSize: '0.9rem', fontFamily: 'inherit', outline: 'none' },
    btn:     { display: 'inline-flex', alignItems: 'center', gap: '.5rem', padding: '.75rem 1.5rem', borderRadius: 10, fontWeight: 600, fontSize: '.875rem', cursor: 'pointer', border: 'none', transition: 'all .15s' },
  };

  const fetchInfo = async () => {
    if (!url.trim()) return;
    try { new URL(url); } catch { setError('URL inválida. Verifique o link.'); setState('error'); return; }

    setState('loading-info');
    setError('');
    setInfo(null);
    setSelected(null);

    try {
      const res = await fetch(`/api/video/info?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar informações');

      setInfo(data.data);
      // Auto-select best non-audio format
      const best = data.data.formats.find((f: VideoFormat) => !f.is_audio_only) || data.data.formats[0];
      setSelected(best);
      setState('ready');
    } catch (e) {
      setError((e as Error).message);
      setState('error');
    }
  };

  const startDownload = () => {
    if (!info || !selectedFormat) return;
    setState('downloading');
    setProgress('Iniciando download...');

    const params = new URLSearchParams({
      url,
      format: selectedFormat.id,
      ext:    selectedFormat.ext,
    });

    // Trigger browser download via anchor
    const a = document.createElement('a');
    a.href = `/api/video/download?${params}`;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Show done after a moment
    setTimeout(() => {
      setState('done');
      setProgress('');
    }, 2000);
  };

  const reset = () => {
    setState('idle');
    setUrl('');
    setInfo(null);
    setSelected(null);
    setError('');
    setProgress('');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.startsWith('http')) { setUrl(text); }
    } catch { /* clipboard not available */ }
  };

  return (
    <div style={s.bg}>
      {/* Header */}
      <header style={s.header}>
        <div style={s.logo}>
          <Download size={18} color="#fff" />
        </div>
        <div>
          <span style={{ fontWeight: 700, fontSize: '.9rem' }}>Video Downloader</span>
          <span style={{ marginLeft: '.75rem', fontSize: '.72rem', color: '#8888a8', fontFamily: 'monospace' }}>/app4</span>
        </div>
      </header>

      <main style={s.main}>
        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h1 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.25rem)', fontWeight: 700, marginBottom: '.75rem', lineHeight: 1.2 }}>
            Baixe qualquer vídeo
          </h1>
          <p style={{ color: '#8888a8', fontSize: '1rem' }}>
            YouTube, Instagram, TikTok, Twitter e mais de 1000 sites
          </p>
        </div>

        {/* Input card */}
        <div style={s.card}>
          <div style={{ display: 'flex', gap: '.75rem', marginBottom: '1rem' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                ref={inputRef}
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && fetchInfo()}
                style={{ ...s.input, paddingLeft: '2.5rem', width: '100%', boxSizing: 'border-box' }}
                placeholder="Cole o link do vídeo aqui..."
                disabled={state === 'loading-info' || state === 'downloading'}
                autoFocus
              />
              <Link2 size={14} style={{ position: 'absolute', left: '.875rem', top: '50%', transform: 'translateY(-50%)', color: '#8888a8' }} />
            </div>
            {url && (
              <button onClick={() => { setUrl(''); setInfo(null); setState('idle'); }} style={{ ...s.btn, background: 'transparent', border: '1px solid #2a2a38', color: '#8888a8', padding: '.75rem' }}>
                <X size={16} />
              </button>
            )}
            <button
              onClick={fetchInfo}
              disabled={!url.trim() || state === 'loading-info' || state === 'downloading'}
              style={{ ...s.btn, background: '#6c63ff', color: '#fff', opacity: (!url.trim() || state === 'loading-info') ? .6 : 1, whiteSpace: 'nowrap' }}
            >
              {state === 'loading-info' ? <><Loader2 size={15} style={{ animation: 'spin .7s linear infinite' }} /> Buscando...</> : 'Buscar vídeo'}
            </button>
          </div>

          <button
            onClick={handlePaste}
            style={{ background: 'none', border: 'none', color: '#6c63ff', fontSize: '.8rem', cursor: 'pointer', padding: 0 }}
          >
            📋 Colar link da área de transferência
          </button>
        </div>

        {/* Error */}
        {state === 'error' && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.75rem', padding: '1rem 1.25rem', background: 'rgba(255,77,106,.08)', border: '1px solid rgba(255,77,106,.3)', borderRadius: 12, marginTop: '1.25rem' }}>
            <AlertCircle size={18} color="#ff4d6a" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ color: '#ff4d6a', fontWeight: 500, marginBottom: '.25rem' }}>Não foi possível carregar o vídeo</p>
              <p style={{ color: '#ff8a9a', fontSize: '.875rem' }}>{error}</p>
              <button onClick={reset} style={{ marginTop: '.625rem', background: 'none', border: 'none', color: '#6c63ff', cursor: 'pointer', fontSize: '.8rem', padding: 0 }}>
                ↺ Tentar outro link
              </button>
            </div>
          </div>
        )}

        {/* Video info card */}
        {(state === 'ready' || state === 'downloading' || state === 'done') && info && (
          <div style={{ ...s.card, marginTop: '1.25rem' }}>
            <div style={{ display: 'flex', gap: '1.25rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              {/* Thumbnail */}
              {info.thumbnail && (
                <div style={{ flexShrink: 0 }}>
                  <img
                    src={info.thumbnail}
                    alt={info.title}
                    style={{ width: 160, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid #2a2a38', display: 'block' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              )}

              {/* Meta */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '.5rem', lineHeight: 1.4 }}>
                  {info.title}
                </p>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '.375rem', fontSize: '.8rem', color: '#8888a8' }}>
                    <User size={12} /> {info.uploader}
                  </span>
                  {info.duration_fmt && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '.375rem', fontSize: '.8rem', color: '#8888a8' }}>
                      <Clock size={12} /> {info.duration_fmt}
                    </span>
                  )}
                  <span style={{ fontSize: '.8rem', color: '#8888a8', background: '#1a1a24', padding: '.15rem .5rem', borderRadius: 6, border: '1px solid #2a2a38' }}>
                    {info.extractor}
                  </span>
                </div>
              </div>
            </div>

            {/* Format selector */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '.8rem', color: '#8888a8', marginBottom: '.5rem', fontWeight: 500 }}>
                Formato e qualidade
              </label>
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowFormats(!showFormats)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.75rem 1rem', background: '#1a1a24', border: '1px solid #3a3a4e', borderRadius: 10, color: '#e8e8f0', cursor: 'pointer', fontSize: '.875rem' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.625rem' }}>
                    {selectedFormat?.is_audio_only ? <Music size={14} color="#6c63ff" /> : <Film size={14} color="#6c63ff" />}
                    <span>{selectedFormat?.label || 'Selecione um formato'}</span>
                  </div>
                  <ChevronDown size={14} color="#8888a8" style={{ transform: showFormats ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                </button>

                {showFormats && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: '#1a1a24', border: '1px solid #3a3a4e', borderRadius: 10, marginTop: 4, overflow: 'hidden', maxHeight: 280, overflowY: 'auto' }}>
                    {/* Video formats */}
                    {info.formats.filter(f => !f.is_audio_only).length > 0 && (
                      <div style={{ padding: '.5rem .75rem', fontSize: '.7rem', color: '#8888a8', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid #2a2a38' }}>
                        Vídeo
                      </div>
                    )}
                    {info.formats.filter(f => !f.is_audio_only).map(f => (
                      <button key={f.id} onClick={() => { setSelected(f); setShowFormats(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.75rem 1rem', background: selectedFormat?.id === f.id ? 'rgba(108,99,255,.1)' : 'transparent', border: 'none', color: selectedFormat?.id === f.id ? '#6c63ff' : '#e8e8f0', cursor: 'pointer', fontSize: '.875rem', textAlign: 'left' }}>
                        <Film size={13} />
                        <span style={{ flex: 1 }}>{f.label}</span>
                        {selectedFormat?.id === f.id && <CheckCircle2 size={13} />}
                      </button>
                    ))}

                    {/* Audio formats */}
                    {info.formats.filter(f => f.is_audio_only).length > 0 && (
                      <div style={{ padding: '.5rem .75rem', fontSize: '.7rem', color: '#8888a8', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid #2a2a38', borderTop: '1px solid #2a2a38' }}>
                        Apenas áudio
                      </div>
                    )}
                    {info.formats.filter(f => f.is_audio_only).map(f => (
                      <button key={f.id} onClick={() => { setSelected(f); setShowFormats(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.75rem 1rem', background: selectedFormat?.id === f.id ? 'rgba(108,99,255,.1)' : 'transparent', border: 'none', color: selectedFormat?.id === f.id ? '#6c63ff' : '#8888a8', cursor: 'pointer', fontSize: '.875rem', textAlign: 'left' }}>
                        <Music size={13} />
                        <span style={{ flex: 1 }}>{f.label}</span>
                        {selectedFormat?.id === f.id && <CheckCircle2 size={13} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
              {state === 'done' ? (
                <>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '.625rem', padding: '.875rem 1rem', background: 'rgba(0,212,170,.08)', border: '1px solid rgba(0,212,170,.3)', borderRadius: 10 }}>
                    <CheckCircle2 size={18} color="#00d4aa" />
                    <span style={{ color: '#00d4aa', fontWeight: 500, fontSize: '.9rem' }}>Download iniciado!</span>
                  </div>
                  <button onClick={reset} style={{ ...s.btn, background: 'transparent', border: '1px solid #2a2a38', color: '#8888a8' }}>
                    <RefreshCw size={14} /> Novo download
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={startDownload}
                    disabled={!selectedFormat || state === 'downloading'}
                    style={{ ...s.btn, flex: 1, background: '#6c63ff', color: '#fff', justifyContent: 'center', opacity: (!selectedFormat || state === 'downloading') ? .6 : 1 }}
                  >
                    {state === 'downloading'
                      ? <><Loader2 size={15} style={{ animation: 'spin .7s linear infinite' }} /> Baixando...</>
                      : <><Download size={15} /> Baixar {selectedFormat?.is_audio_only ? 'áudio' : 'vídeo'}</>
                    }
                  </button>
                  <button onClick={reset} style={{ ...s.btn, background: 'transparent', border: '1px solid #2a2a38', color: '#8888a8' }}>
                    Cancelar
                  </button>
                </>
              )}
            </div>

            {progress && (
              <p style={{ fontSize: '.8rem', color: '#8888a8', marginTop: '.75rem', textAlign: 'center' }}>{progress}</p>
            )}
          </div>
        )}

        {/* Supported sites */}
        {state === 'idle' && (
          <div style={{ marginTop: '2.5rem', textAlign: 'center' }}>
            <p style={{ fontSize: '.8rem', color: '#8888a8', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Sites suportados
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '.625rem' }}>
              {SUPPORTED_SITES.map(site => (
                <div key={site.name} style={{ padding: '.375rem .875rem', background: '#111118', border: '1px solid #2a2a38', borderRadius: 20, fontSize: '.8rem', color: '#8888a8', display: 'flex', alignItems: 'center', gap: '.375rem' }}>
                  <span style={{ fontSize: '1rem' }}>{site.icon}</span>
                  {site.name}
                </div>
              ))}
              <div style={{ padding: '.375rem .875rem', background: '#111118', border: '1px solid #2a2a38', borderRadius: 20, fontSize: '.8rem', color: '#6c63ff' }}>
                +1000 mais
              </div>
            </div>
          </div>
        )}
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input { transition: border-color .15s, box-shadow .15s; }
        input:focus { border-color: #6c63ff !important; box-shadow: 0 0 0 3px rgba(108,99,255,.2); }
        button:hover:not(:disabled) { opacity: .88; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
);
