import { Router, Request, Response } from 'express';

export const seoRouter = Router();

const SITE_URL = process.env.SITE_URL
  || process.env.ALLOWED_ORIGINS?.split(',')[0]
  || 'https://util-ferramentas.onrender.com';

const SITE_NAME = process.env.SITE_NAME || 'Util Ferramentas';
const SITE_DESC = process.env.SITE_DESC || 'Plataforma SaaS com ferramentas úteis: gerenciamento de dados, encurtador de links, download de vídeos e mais.';

// ── robots.txt ─────────────────────────────────────────────
seoRouter.get('/robots.txt', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send(`User-agent: *
Allow: /
Allow: /checkout.html
Allow: /app4
Disallow: /app1
Disallow: /app2
Disallow: /app3
Disallow: /api/

Sitemap: ${SITE_URL}/sitemap.xml
`);
});

// ── sitemap.xml ────────────────────────────────────────────
seoRouter.get('/sitemap.xml', (_req: Request, res: Response) => {
  const today = new Date().toISOString().split('T')[0];
  res.setHeader('Content-Type', 'application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">

  <url>
    <loc>${SITE_URL}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>

  <url>
    <loc>${SITE_URL}/checkout.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>

  <url>
    <loc>${SITE_URL}/app4</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>

</urlset>`);
});

// ── Landing page / ─────────────────────────────────────────
seoRouter.get('/', (_req: Request, res: Response) => {
  const adsenseScript = 
     `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2434617497884125"
     crossorigin="anonymous"></script>`
   

  // Verification file for Google Search Console
  const verificationMeta = `<meta name="google-site-verification" content="40pNnpyDlLu2vR0twZQ7AwO6tOOzH7uTE5BnIAW8AhM" />`


  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${SITE_NAME} — Ferramentas Online Gratuitas</title>
  <meta name="description" content="${SITE_DESC}" />
  <meta name="robots" content="index, follow" />
  <meta name="author" content="${SITE_NAME}" />
  <link rel="canonical" href="${SITE_URL}/" />
  ${verificationMeta}

  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${SITE_URL}/" />
  <meta property="og:title" content="${SITE_NAME} — Ferramentas Online Gratuitas" />
  <meta property="og:description" content="${SITE_DESC}" />
  <meta property="og:locale" content="pt_BR" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${SITE_NAME}" />
  <meta name="twitter:description" content="${SITE_DESC}" />

  <!-- Schema.org -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "${SITE_NAME}",
    "url": "${SITE_URL}",
    "description": "${SITE_DESC}",
    "potentialAction": {
      "@type": "SearchAction",
      "target": "${SITE_URL}/app4?url={search_term_string}",
      "query-input": "required name=search_term_string"
    }
  }
  </script>

  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2434617497884125"
     crossorigin="anonymous"></script>
  ${adsenseScript}

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0a0a0f; --surface: #111118; --border: #2a2a38;
      --text: #e8e8f0; --muted: #8888a8; --accent: #6c63ff; --green: #00d4aa;
    }
    body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
    a { color: inherit; text-decoration: none; }
    .container { max-width: 1100px; margin: 0 auto; padding: 0 1.5rem; }

    /* Header */
    header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 1rem 0; position: sticky; top: 0; z-index: 10; }
    .header-inner { display: flex; align-items: center; justify-content: space-between; }
    .logo { font-weight: 700; font-size: 1.1rem; color: var(--text); }
    .logo span { color: var(--accent); }
    nav { display: flex; gap: 1.5rem; font-size: .875rem; color: var(--muted); }
    nav a:hover { color: var(--text); }
    .btn-header { background: var(--accent); color: #fff; padding: .5rem 1.25rem; border-radius: 8px; font-size: .875rem; font-weight: 600; }
    .btn-header:hover { opacity: .88; }

    /* Hero */
    .hero { padding: 5rem 0 3rem; text-align: center; }
    h1 { font-size: clamp(2rem, 5vw, 3.25rem); font-weight: 700; line-height: 1.15; margin-bottom: 1.25rem; }
    h1 em { font-style: normal; color: var(--accent); }
    .hero p { font-size: 1.125rem; color: var(--muted); max-width: 580px; margin: 0 auto 2.5rem; }
    .hero-cta { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }
    .btn-primary { background: var(--accent); color: #fff; padding: .875rem 2rem; border-radius: 10px; font-weight: 600; font-size: 1rem; display: inline-flex; align-items: center; gap: .5rem; }
    .btn-primary:hover { opacity: .88; }
    .btn-secondary { border: 1px solid var(--border); color: var(--muted); padding: .875rem 2rem; border-radius: 10px; font-size: 1rem; }
    .btn-secondary:hover { border-color: #555; color: var(--text); }

    /* Ad banner top */
    .ad-top { padding: 1.5rem 0; text-align: center; }
    .ad-label { font-size: .68rem; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: .5rem; }
    .ad-placeholder { background: var(--surface); border: 1px dashed var(--border); border-radius: 8px; height: 90px; display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: .8rem; max-width: 728px; margin: 0 auto; }

    /* Features */
    .features { padding: 4rem 0; }
    .features h2 { text-align: center; font-size: 1.75rem; margin-bottom: 3rem; }
    .features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.5rem; }
    .feature-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 1.75rem; transition: border-color .2s; }
    .feature-card:hover { border-color: #3a3a4e; }
    .feature-icon { font-size: 2rem; margin-bottom: 1rem; }
    .feature-card h3 { font-size: 1rem; font-weight: 600; margin-bottom: .625rem; }
    .feature-card p { font-size: .875rem; color: var(--muted); line-height: 1.6; }
    .feature-card a { display: inline-flex; align-items: center; gap: .375rem; color: var(--accent); font-size: .8rem; font-weight: 500; margin-top: 1rem; }
    .tag { display: inline-block; background: rgba(108,99,255,.15); color: var(--accent); font-size: .68rem; font-weight: 600; padding: 2px 8px; border-radius: 6px; margin-bottom: .75rem; }
    .tag.green { background: rgba(0,212,170,.12); color: var(--green); }

    /* Ad mid */
    .ad-mid { padding: 2rem 0; }
    .ad-mid .ad-placeholder { max-width: 970px; height: 90px; }

    /* Video downloader highlight */
    .highlight { padding: 4rem 0; }
    .highlight-inner { background: linear-gradient(135deg, rgba(108,99,255,.08), rgba(0,212,170,.05)); border: 1px solid rgba(108,99,255,.2); border-radius: 18px; padding: 3rem; text-align: center; }
    .highlight h2 { font-size: 1.75rem; margin-bottom: 1rem; }
    .highlight p { color: var(--muted); margin-bottom: 2rem; max-width: 500px; margin-left: auto; margin-right: auto; }
    .platforms { display: flex; gap: .75rem; justify-content: center; flex-wrap: wrap; margin-bottom: 2rem; }
    .platform { background: var(--surface); border: 1px solid var(--border); border-radius: 20px; padding: .375rem .875rem; font-size: .8rem; color: var(--muted); }

    /* FAQ */
    .faq { padding: 4rem 0; }
    .faq h2 { text-align: center; font-size: 1.75rem; margin-bottom: 2.5rem; }
    .faq-item { border-bottom: 1px solid var(--border); padding: 1.25rem 0; }
    .faq-item h3 { font-size: .95rem; font-weight: 600; margin-bottom: .5rem; }
    .faq-item p { font-size: .875rem; color: var(--muted); line-height: 1.6; max-width: 800px; }

    /* Footer */
    footer { background: var(--surface); border-top: 1px solid var(--border); padding: 2.5rem 0; text-align: center; }
    footer p { font-size: .8rem; color: var(--muted); }
    footer a { color: var(--muted); margin: 0 .75rem; }
    footer a:hover { color: var(--text); }
  </style>
</head>
<body>

<header>
  <div class="container">
    <div class="header-inner">
      <div class="logo">${SITE_NAME.split(' ').map((w, i) => i === 0 ? w : `<span>${w}</span>`).join(' ')}</div>
      <nav>
        <a href="/app4">Downloader</a>
        <a href="/checkout.html">Planos</a>
        <a href="/app1">Entrar</a>
      </nav>
      <a href="/checkout.html" class="btn-header">Começar grátis</a>
    </div>
  </div>
</header>

<!-- Ad top (728x90 leaderboard) -->
<div class="ad-top">
  <div class="container">
    <p class="ad-label">Publicidade</p>
    ${ADSENSE_ID
      ? `<ins class="adsbygoogle" style="display:block;max-width:728px;margin:0 auto" data-ad-client="${ADSENSE_ID}" data-ad-slot="AUTO" data-ad-format="horizontal" data-full-width-responsive="true"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});</script>`
      : `<div class="ad-placeholder">Espaço publicitário — Configure seu AdSense ID</div>`
    }
  </div>
</div>

<main>
  <!-- Hero -->
  <section class="hero">
    <div class="container">
      <h1>Ferramentas online<br /><em>que realmente funcionam</em></h1>
      <p>Baixe vídeos de 1000+ sites, gerencie seus dados, encurte links e muito mais. Rápido, simples e direto.</p>
      <div class="hero-cta">
        <a href="/app4" class="btn-primary">▶ Baixar vídeo grátis</a>
        <a href="/checkout.html" class="btn-secondary">Ver todos os planos</a>
      </div>
    </div>
  </section>

  <!-- Features -->
  <section class="features">
    <div class="container">
      <h2>O que você pode fazer</h2>
      <div class="features-grid">

        <article class="feature-card">
          <div class="tag">Gratuito</div>
          <div class="feature-icon">⬇️</div>
          <h3>Download de Vídeos</h3>
          <p>Baixe vídeos do YouTube, Instagram, TikTok, Vimeo, Twitter e mais de 1000 outros sites. MP4 ou MP3.</p>
          <a href="/app4">Usar agora →</a>
        </article>

        <article class="feature-card">
          <div class="tag green">Pro</div>
          <div class="feature-icon">🗃️</div>
          <h3>Gerenciamento de Dados</h3>
          <p>Crie estruturas dinâmicas para qualquer tipo de dado. Boletos, produtos, clientes — sem código.</p>
          <a href="/app1">Saiba mais →</a>
        </article>

        <article class="feature-card">
          <div class="tag">Gratuito</div>
          <div class="feature-icon">🔗</div>
          <h3>Encurtador de Links</h3>
          <p>Crie links curtos com análise de cliques, QR code e data de expiração.</p>
          <a href="/app1">Usar agora →</a>
        </article>

        <article class="feature-card">
          <div class="tag green">Pro</div>
          <div class="feature-icon">💰</div>
          <h3>Venda Licenças via PIX</h3>
          <p>Sistema completo para vender licenças de software. QR Code PIX automático, ativação instantânea.</p>
          <a href="/checkout.html">Ver planos →</a>
        </article>

      </div>
    </div>
  </section>

  <!-- Ad mid (970x90 wide banner) -->
  <div class="ad-mid">
    <div class="container">
      <p class="ad-label" style="text-align:center">Publicidade</p>
      ${ADSENSE_ID
        ? `<ins class="adsbygoogle" style="display:block" data-ad-client="${ADSENSE_ID}" data-ad-slot="AUTO" data-ad-format="horizontal" data-full-width-responsive="true"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});</script>`
        : `<div class="ad-placeholder" style="max-width:970px;margin:0 auto">Espaço publicitário — Configure seu AdSense ID</div>`
      }
    </div>
  </div>

  <!-- Video Downloader highlight -->
  <section class="highlight">
    <div class="container">
      <div class="highlight-inner">
        <h2>Baixe qualquer vídeo agora</h2>
        <p>Cole o link, escolha a qualidade e faça o download. Sem cadastro, sem limite.</p>
        <div class="platforms">
          ${['▶ YouTube','📷 Instagram','♪ TikTok','𝕏 Twitter','🎬 Vimeo','f Facebook','r/ Reddit','🟣 Twitch'].map(p => `<span class="platform">${p}</span>`).join('')}
        </div>
        <a href="/app4" class="btn-primary" style="display:inline-flex">Abrir Video Downloader →</a>
      </div>
    </div>
  </section>

  <!-- FAQ (SEO content) -->
  <section class="faq">
    <div class="container">
      <h2>Perguntas frequentes</h2>

      <div class="faq-item">
        <h3>Como baixar vídeo do YouTube?</h3>
        <p>Acesse nossa ferramenta de <a href="/app4" style="color:var(--accent)">download de vídeos</a>, cole o link do YouTube, escolha a qualidade desejada e clique em Baixar. O processo é simples e rápido.</p>
      </div>

      <div class="faq-item">
        <h3>Como converter vídeo para MP3?</h3>
        <p>Na ferramenta de download, após colar o link, selecione "Somente áudio (MP3)" no seletor de formato. O arquivo será baixado diretamente em MP3.</p>
      </div>

      <div class="faq-item">
        <h3>O serviço é gratuito?</h3>
        <p>Sim! O download de vídeos e o encurtador de links são gratuitos. Recursos avançados como gerenciamento de dados e venda de licenças estão disponíveis nos planos pagos.</p>
      </div>

      <div class="faq-item">
        <h3>Quais sites de vídeo são suportados?</h3>
        <p>Suportamos mais de 1000 sites incluindo YouTube, Instagram, TikTok, Twitter, Vimeo, Facebook, Reddit, Twitch e Dailymotion.</p>
      </div>

    </div>
  </section>

</main>

<!-- Ad footer (320x50 mobile / 728x90 desktop) -->
<div class="ad-top">
  <div class="container">
    <p class="ad-label">Publicidade</p>
    ${ADSENSE_ID
      ? `<ins class="adsbygoogle" style="display:block;max-width:728px;margin:0 auto" data-ad-client="${ADSENSE_ID}" data-ad-slot="AUTO" data-ad-format="horizontal" data-full-width-responsive="true"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});</script>`
      : `<div class="ad-placeholder">Espaço publicitário</div>`
    }
  </div>
</div>

<footer>
  <div class="container">
    <p>
      <a href="/checkout.html">Planos</a>
      <a href="/app4">Downloader</a>
      <a href="/app1">Entrar</a>
    </p>
    <p style="margin-top:.75rem">&copy; ${new Date().getFullYear()} ${SITE_NAME}. Todos os direitos reservados.</p>
  </div>
</footer>

</body>
</html>`);
});
