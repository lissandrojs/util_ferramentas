import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { Download, Link2, Loader2, AlertCircle, CheckCircle2, Film, Music, ChevronDown, X, Clock, User, RefreshCw, Settings, Upload, AlertTriangle, Lock } from 'lucide-react';

interface VideoFormat { id: string; label: string; ext: string; resolution: string; filesize_fmt: string; is_audio_only: boolean; }
interface VideoInfo { title: string; thumbnail: string; duration_fmt: string; uploader: string; extractor: string; formats: VideoFormat[]; }
type State = 'idle'|'loading'|'ready'|'downloading'|'done'|'error';

const C = { bg:'#0a0a0f', sur:'#111118', sur2:'#1a1a24', brd:'#2a2a38', brd2:'#3a3a4e', txt:'#e8e8f0', mut:'#8888a8', acc:'#6c63ff', ok:'#00d4aa', err:'#ff4d6a', wrn:'#ffb347' };
const s = (obj: React.CSSProperties) => obj;

function App() {
  const [url, setUrl] = useState('');
  const [state, setState] = useState<State>('idle');
  const [info, setInfo] = useState<VideoInfo|null>(null);
  const [fmt, setFmt] = useState<VideoFormat|null>(null);
  const [error, setError] = useState('');
  const [showFmt, setShowFmt] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [ytStatus, setYtStatus] = useState<{configured:boolean;message:string}|null>(null);
  const [health, setHealth] = useState<{available:boolean;version?:string;ffmpeg?:boolean;cookies?:boolean}|null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/video/health').then(r=>r.json()).then(d=>{
      setHealth(d);
      setYtStatus({ configured: !!d.cookies, message: d.cookiesStatus || '' });
    }).catch(()=>setHealth({available:false}));
  }, []);

  const fetchInfo = async () => {
    if (!url.trim() || !health?.available) return;
    try { new URL(url); } catch { setError('URL inválida'); setState('error'); return; }
    setState('loading'); setError(''); setInfo(null); setFmt(null);
    try {
      const r = await fetch(`/api/video/info?url=${encodeURIComponent(url)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erro');
      setInfo(d.data);
      setFmt(d.data.formats.find((f: VideoFormat) => !f.is_audio_only) || d.data.formats[0]);
      setState('ready');
    } catch(e) { setError((e as Error).message); setState('error'); }
  };

  const download = () => {
    if (!fmt) return;
    setState('downloading');
    const p = new URLSearchParams({ url, format: fmt.id, audio: fmt.is_audio_only ? 'true' : 'false' });
    const a = document.createElement('a');
    a.href = '/api/video/download?' + p;
    a.download = '';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => setState('done'), 4000);
  };

  const reset = () => { setState('idle'); setUrl(''); setInfo(null); setFmt(null); setError(''); setTimeout(()=>inputRef.current?.focus(),100); };

  const uploadCookies = async (file: File) => {
    const fd = new FormData(); fd.append('cookies', file);
    const r = await fetch('/api/video/cookies', { method: 'POST', body: fd });
    const d = await r.json();
    if (r.ok) {
      setYtStatus({ configured: true, message: d.message });
      setHealth(prev => prev ? {...prev, cookies: true} : prev);
    } else {
      alert('Erro: ' + d.error);
    }
  };

  const box = s({ background: C.sur, border: `1px solid ${C.brd}`, borderRadius: 14, padding: '1.5rem' });
  const btn = (bg: string, fg = '#fff') => s({ display:'inline-flex', alignItems:'center', gap:'.5rem', padding:'.75rem 1.25rem', borderRadius:10, fontWeight:600, fontSize:'.875rem', cursor:'pointer', border:'none', background:bg, color:fg, transition:'opacity .15s' });

  return (
    <div style={s({ minHeight:'100vh', background:C.bg, color:C.txt, fontFamily:'Inter,system-ui,sans-serif' })}>
      {/* Header */}
      <div style={s({ background:C.sur, borderBottom:`1px solid ${C.brd}`, padding:'.875rem 2rem', display:'flex', alignItems:'center', gap:'.75rem' })}>
        <div style={s({ width:34, height:34, borderRadius:9, background:`linear-gradient(135deg,${C.acc},${C.ok})`, display:'flex', alignItems:'center', justifyContent:'center' })}>
          <Download size={16} color="#fff"/>
        </div>
        <span style={s({ fontWeight:700, fontSize:'.9rem' })}>Video Downloader</span>
        <span style={s({ fontFamily:'monospace', fontSize:'.7rem', color:C.mut, marginLeft:4 })}>/app4</span>
        <div style={s({ marginLeft:'auto', display:'flex', alignItems:'center', gap:'1rem' })}>
          {health && (
            <span style={s({ fontSize:'.72rem', color: health.available ? C.ok : C.err, display:'flex', alignItems:'center', gap:4 })}>
              {health.available ? <CheckCircle2 size={12}/> : <AlertCircle size={12}/>}
              {health.available ? `yt-dlp ${health.version}` : 'yt-dlp offline'}
            </span>
          )}
          {ytStatus && (
            <span style={s({ fontSize:'.72rem', color: ytStatus.configured ? C.ok : C.wrn, display:'flex', alignItems:'center', gap:4 })}>
              {ytStatus.configured ? <Lock size={12}/> : <AlertTriangle size={12}/>}
              {ytStatus.configured ? 'YouTube OK' : 'YouTube sem cookies'}
            </span>
          )}
          <button onClick={() => setShowSettings(true)} style={s({ background:'none', border:`1px solid ${C.brd}`, borderRadius:8, padding:'.35rem .625rem', cursor:'pointer', color:C.mut, display:'flex', alignItems:'center', gap:4, fontSize:'.8rem' })}>
            <Settings size={13}/> Configurar
          </button>
        </div>
      </div>

      <div style={s({ maxWidth:700, margin:'0 auto', padding:'2.5rem 1.5rem' })}>
        {/* Hero */}
        <div style={s({ textAlign:'center', marginBottom:'2rem' })}>
          <h1 style={s({ fontSize:'clamp(1.5rem,4vw,2rem)', fontWeight:700, marginBottom:'.5rem' })}>Baixe qualquer vídeo</h1>
          <p style={s({ color:C.mut, fontSize:'.9rem' })}>YouTube, Instagram, TikTok, Vimeo e mais de 1000 sites</p>
        </div>

        {/* Input */}
        <div style={box}>
          <div style={s({ display:'flex', gap:'.75rem', marginBottom:'.75rem' })}>
            <div style={s({ position:'relative', flex:1 })}>
              <input ref={inputRef} value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==='Enter'&&fetchInfo()}
                style={s({ width:'100%', background:C.sur2, border:`1px solid ${C.brd}`, borderRadius:10, color:C.txt, padding:'.75rem 1rem .75rem 2.5rem', fontSize:'.9rem', fontFamily:'inherit', outline:'none', boxSizing:'border-box' as const })}
                placeholder="Cole o link do vídeo aqui..." disabled={state==='loading'||!health?.available} autoFocus/>
              <Link2 size={14} style={s({ position:'absolute', left:'.875rem', top:'50%', transform:'translateY(-50%)', color:C.mut })}/>
            </div>
            {url && <button onClick={()=>{setUrl('');setInfo(null);setState('idle');}} style={{...btn(C.sur2,C.mut), border:`1px solid ${C.brd}`, padding:'.75rem'}}><X size={15}/></button>}
            <button onClick={fetchInfo} disabled={!url.trim()||state==='loading'||!health?.available}
              style={{...btn(C.acc), opacity:(!url.trim()||state==='loading')?0.5:1, whiteSpace:'nowrap' as const}}>
              {state==='loading' ? <><Loader2 size={14} style={{animation:'spin .7s linear infinite'}}/> Buscando...</> : 'Buscar'}
            </button>
          </div>
          <button onClick={async()=>{try{const t=await navigator.clipboard.readText();if(t.startsWith('http'))setUrl(t);}catch{}}}
            style={s({ background:'none', border:'none', color:C.acc, fontSize:'.78rem', cursor:'pointer', padding:0 })}>
            📋 Colar da área de transferência
          </button>
        </div>

        {/* Error */}
        {state==='error' && (
          <div style={s({ display:'flex', gap:'.75rem', padding:'1rem 1.25rem', background:'rgba(255,77,106,.08)', border:`1px solid rgba(255,77,106,.3)`, borderRadius:12, marginTop:'1rem' })}>
            <AlertCircle size={18} color={C.err} style={{flexShrink:0,marginTop:1}}/>
            <div>
              <p style={s({ color:C.err, fontWeight:500, marginBottom:'.25rem' })}>Não foi possível carregar</p>
              <p style={s({ color:'#ff8a9a', fontSize:'.875rem', lineHeight:1.5 })}>{error}</p>
              {error.includes('cookie') && (
                <button onClick={()=>setShowSettings(true)} style={s({ marginTop:'.5rem', background:'none', border:'none', color:C.acc, cursor:'pointer', fontSize:'.8rem', padding:0, textDecoration:'underline' })}>
                  Configurar cookies do YouTube →
                </button>
              )}
              <button onClick={reset} style={s({ marginTop:'.5rem', background:'none', border:'none', color:C.acc, cursor:'pointer', fontSize:'.8rem', padding:0, display:'block' })}>↺ Tentar outro link</button>
            </div>
          </div>
        )}

        {/* Video info */}
        {(state==='ready'||state==='downloading'||state==='done') && info && (
          <div style={{...box, marginTop:'1rem'}}>
            <div style={s({ display:'flex', gap:'1.25rem', marginBottom:'1.25rem', flexWrap:'wrap' as const })}>
              {info.thumbnail && (
                <img src={info.thumbnail} alt={info.title} style={s({ width:160, height:90, objectFit:'cover' as const, borderRadius:8, border:`1px solid ${C.brd}`, flexShrink:0 })}
                  onError={e=>{(e.target as HTMLImageElement).style.display='none';}}/>
              )}
              <div style={s({ flex:1, minWidth:0 })}>
                <p style={s({ fontWeight:600, fontSize:'1rem', marginBottom:'.5rem', lineHeight:1.4 })}>{info.title}</p>
                <div style={s({ display:'flex', gap:'1rem', flexWrap:'wrap' as const })}>
                  <span style={s({ fontSize:'.78rem', color:C.mut, display:'flex', alignItems:'center', gap:4 })}><User size={11}/>{info.uploader}</span>
                  {info.duration_fmt && <span style={s({ fontSize:'.78rem', color:C.mut, display:'flex', alignItems:'center', gap:4 })}><Clock size={11}/>{info.duration_fmt}</span>}
                  <span style={s({ fontSize:'.72rem', color:C.mut, background:C.sur2, padding:'2px 8px', borderRadius:6, border:`1px solid ${C.brd}` })}>{info.extractor}</span>
                </div>
              </div>
            </div>

            {/* Format picker */}
            <div style={s({ marginBottom:'1.25rem' })}>
              <label style={s({ display:'block', fontSize:'.78rem', color:C.mut, marginBottom:'.4rem', fontWeight:500 })}>Formato</label>
              <div style={s({ position:'relative' })}>
                <button onClick={()=>setShowFmt(!showFmt)} style={s({ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'.75rem 1rem', background:C.sur2, border:`1px solid ${C.brd2}`, borderRadius:10, color:C.txt, cursor:'pointer', fontSize:'.875rem' })}>
                  <div style={s({ display:'flex', alignItems:'center', gap:'.625rem' })}>
                    {fmt?.is_audio_only ? <Music size={14} color={C.acc}/> : <Film size={14} color={C.acc}/>}
                    <span>{fmt?.label || 'Selecione...'}</span>
                  </div>
                  <ChevronDown size={14} color={C.mut} style={{transform:showFmt?'rotate(180deg)':'none',transition:'transform .2s'}}/>
                </button>
                {showFmt && (
                  <div style={s({ position:'absolute', top:'100%', left:0, right:0, zIndex:10, background:C.sur2, border:`1px solid ${C.brd2}`, borderRadius:10, marginTop:4, overflow:'hidden', maxHeight:300, overflowY:'auto' as const })}>
                    {['Vídeo','Áudio'].map((group, gi) => {
                      const items = info.formats.filter(f => gi===0 ? !f.is_audio_only : f.is_audio_only);
                      if (!items.length) return null;
                      return (
                        <div key={group}>
                          <div style={s({ padding:'.375rem .875rem', fontSize:'.68rem', color:C.mut, textTransform:'uppercase' as const, letterSpacing:'.06em', borderBottom:`1px solid ${C.brd}`, background:C.sur })}>{group}</div>
                          {items.map(f => (
                            <button key={f.id} onClick={()=>{setFmt(f);setShowFmt(false);}} style={s({ width:'100%', display:'flex', alignItems:'center', gap:'.75rem', padding:'.75rem 1rem', background:fmt?.id===f.id?`rgba(108,99,255,.1)`:'transparent', border:'none', color:fmt?.id===f.id?C.acc:C.txt, cursor:'pointer', fontSize:'.875rem', textAlign:'left' as const })}>
                              {f.is_audio_only?<Music size={13}/>:<Film size={13}/>}
                              <span style={{flex:1}}>{f.label}</span>
                              {fmt?.id===f.id && <CheckCircle2 size={13}/>}
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            {state==='done' ? (
              <div style={s({ display:'flex', gap:'.75rem', flexWrap:'wrap' as const })}>
                <div style={s({ flex:1, display:'flex', alignItems:'center', gap:'.625rem', padding:'.875rem', background:'rgba(0,212,170,.08)', border:'1px solid rgba(0,212,170,.3)', borderRadius:10 })}>
                  <CheckCircle2 size={18} color={C.ok}/>
                  <span style={s({ color:C.ok, fontWeight:500 })}>Download iniciado! Verifique sua pasta de downloads.</span>
                </div>
                <button onClick={reset} style={{...btn(C.sur2,C.mut), border:`1px solid ${C.brd}`}}><RefreshCw size={14}/> Novo</button>
              </div>
            ) : (
              <div style={s({ display:'flex', gap:'.75rem', flexWrap:'wrap' as const })}>
                <button onClick={download} disabled={!fmt||state==='downloading'} style={{...btn(C.acc), flex:1, justifyContent:'center', opacity:(!fmt||state==='downloading')?0.6:1}}>
                  {state==='downloading'
                    ? <><Loader2 size={14} style={{animation:'spin .7s linear infinite'}}/> Processando (pode demorar)...</>
                    : <><Download size={14}/> Baixar {fmt?.is_audio_only?'áudio (MP3)':'vídeo'}</>
                  }
                </button>
                <button onClick={reset} style={{...btn(C.sur2,C.mut), border:`1px solid ${C.brd}`}}>Cancelar</button>
              </div>
            )}
          </div>
        )}

        {/* Sites */}
        {state==='idle' && health?.available && (
          <div style={s({ marginTop:'2rem', textAlign:'center' })}>
            <p style={s({ fontSize:'.75rem', color:C.mut, marginBottom:'.875rem', textTransform:'uppercase' as const, letterSpacing:'.06em' })}>Plataformas suportadas</p>
            <div style={s({ display:'flex', justifyContent:'center', flexWrap:'wrap' as const, gap:'.5rem', marginBottom:'.875rem' })}>
              {[{n:'YouTube',i:'▶'},{n:'Instagram',i:'📷'},{n:'TikTok',i:'♪'},{n:'Twitter',i:'𝕏'},{n:'Vimeo',i:'🎬'},{n:'Facebook',i:'f'},{n:'Reddit',i:'r/'},{n:'Twitch',i:'🟣'}].map(s2=>(
                <div key={s2.n} style={s({ padding:'.3rem .75rem', background:C.sur, border:`1px solid ${C.brd}`, borderRadius:20, fontSize:'.78rem', color:C.mut, display:'flex', alignItems:'center', gap:4 })}>
                  {s2.i} {s2.n}
                </div>
              ))}
              <div style={s({ padding:'.3rem .75rem', background:C.sur, border:`1px solid ${C.brd}`, borderRadius:20, fontSize:'.78rem', color:C.acc })}>+1000 mais</div>
            </div>
            {!ytStatus?.configured && (
              <p style={s({ fontSize:'.75rem', color:C.wrn, maxWidth:460, margin:'0 auto', lineHeight:1.6 })}>
                ⚠ YouTube requer cookies. Clique em "Configurar" para ativar.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Settings modal */}
      {showSettings && (
        <div style={s({ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:'1rem' })} onClick={e=>e.target===e.currentTarget&&setShowSettings(false)}>
          <div style={s({ background:C.sur, border:`1px solid ${C.brd}`, borderRadius:14, width:'100%', maxWidth:520, padding:'1.75rem' })}>
            <div style={s({ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem' })}>
              <h2 style={s({ fontWeight:700, fontSize:'1rem' })}>Configurações — Cookies do YouTube</h2>
              <button onClick={()=>setShowSettings(false)} style={s({ background:'none', border:'none', cursor:'pointer', color:C.mut })}><X size={18}/></button>
            </div>

            <div style={s({ padding:'.875rem', background:ytStatus?.configured?'rgba(0,212,170,.08)':'rgba(255,179,71,.08)', border:`1px solid ${ytStatus?.configured?'rgba(0,212,170,.3)':'rgba(255,179,71,.3)'}`, borderRadius:10, marginBottom:'1.25rem', fontSize:'.85rem', color:ytStatus?.configured?C.ok:C.wrn, display:'flex', alignItems:'center', gap:'.625rem' })}>
              {ytStatus?.configured ? <CheckCircle2 size={16}/> : <AlertTriangle size={16}/>}
              {ytStatus?.message || (ytStatus?.configured ? 'Cookies configurados' : 'Sem cookies')}
            </div>

            <div style={s({ fontSize:'.85rem', color:C.mut, lineHeight:1.7, marginBottom:'1.25rem' })}>
              <p style={s({ marginBottom:'.75rem', color:C.txt, fontWeight:500 })}>Como configurar (3 passos):</p>
              {['Instale a extensão "Get cookies.txt LOCALLY" no Chrome/Firefox','Acesse youtube.com e faça login na sua conta','Clique na extensão → "Export" → salve como cookies.txt'].map((s3,i)=>(
                <div key={i} style={s({ display:'flex', gap:'.625rem', marginBottom:'.5rem' })}>
                  <span style={s({ color:C.acc, fontWeight:600, flexShrink:0 })}>{i+1}.</span>
                  <span>{s3}</span>
                </div>
              ))}
            </div>

            <input ref={fileRef} type="file" accept=".txt" style={{display:'none'}} onChange={async e=>{
              const f = e.target.files?.[0];
              if (f) { await uploadCookies(f); setShowSettings(false); }
            }}/>
            <button onClick={()=>fileRef.current?.click()} style={{...btn(C.acc), width:'100%', justifyContent:'center'}}>
              <Upload size={15}/> Selecionar arquivo cookies.txt
            </button>

            {ytStatus?.configured && (
              <button onClick={async()=>{
                await fetch('/api/video/cookies',{method:'POST',body:new FormData()});
                setYtStatus({configured:false,message:'Cookies removidos'});
                setShowSettings(false);
              }} style={s({ marginTop:'.75rem', width:'100%', padding:'.625rem', background:'none', border:`1px solid rgba(255,77,106,.4)`, borderRadius:10, color:C.err, cursor:'pointer', fontSize:'.85rem' })}>
                Remover cookies
              </button>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box;margin:0;padding:0}input:focus{border-color:${C.acc}!important;box-shadow:0 0 0 3px rgba(108,99,255,.2)}button:hover:not(:disabled){opacity:.88}`}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
