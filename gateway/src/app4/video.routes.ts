import { Router, Request, Response } from 'express';
import { getVideoInfo, downloadVideoStream, formatDuration, formatBytes } from './video.service';
import { logger } from '../utils/logger';

export const videoRouter = Router();

// Rate limiting per user — max 3 simultaneous downloads
const activeDownloads = new Map<string, number>();

function getUserKey(req: Request): string {
  return req.user?.sub || req.ip || 'anonymous';
}

// ── GET /api/video/info?url=... ────────────────────────────
videoRouter.get('/info', async (req: Request, res: Response) => {
  const { url } = req.query as { url: string };

  if (!url) {
    return res.status(400).json({ error: 'Parâmetro url é obrigatório' });
  }

  // Basic URL validation
  try { new URL(url); } catch {
    return res.status(400).json({ error: 'URL inválida' });
  }

  try {
    const info = await getVideoInfo(url);

    return res.json({
      success: true,
      data: {
        title:       info.title,
        thumbnail:   info.thumbnail,
        duration:    info.duration,
        duration_fmt: formatDuration(info.duration),
        uploader:    info.uploader,
        extractor:   info.extractor,
        description: info.description,
        formats: info.formats.map(f => ({
          id:          f.format_id,
          label:       buildFormatLabel(f),
          ext:         f.ext,
          resolution:  f.resolution,
          filesize_fmt: formatBytes(f.filesize),
          is_audio_only: f.vcodec === 'none',
        })),
      },
    });
  } catch (err) {
    const msg = (err as Error).message;
    logger.warn(`Video info failed for ${url}: ${msg}`);
    return res.status(422).json({ error: msg });
  }
});

// ── GET /api/video/download?url=...&format=...&ext=... ─────
videoRouter.get('/download', async (req: Request, res: Response) => {
  const { url, format = 'best', ext = 'mp4' } = req.query as {
    url: string; format: string; ext: string;
  };

  if (!url) {
    return res.status(400).json({ error: 'Parâmetro url é obrigatório' });
  }

  try { new URL(url); } catch {
    return res.status(400).json({ error: 'URL inválida' });
  }

  const userKey = getUserKey(req);
  const current = activeDownloads.get(userKey) || 0;

  if (current >= 2) {
    return res.status(429).json({ error: 'Máximo de 2 downloads simultâneos por usuário.' });
  }

  activeDownloads.set(userKey, current + 1);

  let cancelled = false;
  let cancelFn: (() => void) | null = null;

  // Clean up on client disconnect
  req.on('close', () => {
    cancelled = true;
    if (cancelFn) cancelFn();
    const count = activeDownloads.get(userKey) || 1;
    activeDownloads.set(userKey, Math.max(0, count - 1));
  });

  // Get title for filename first (quick)
  let filename = `video.${ext}`;
  try {
    const info = await getVideoInfo(url);
    const safeTitle = info.title
      .replace(/[^\w\s\-\u00C0-\u024F]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 80);
    filename = `${safeTitle}.${ext}`;
  } catch { /* use default filename */ }

  if (cancelled) return;

  // Set streaming headers
  res.setHeader('Content-Type', ext === 'mp3' ? 'audio/mpeg' : 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering

  cancelFn = downloadVideoStream({
    url,
    formatId: format,
    outputExt: ext,
    onFilename: (name) => {
      // Update filename if yt-dlp provides a better one
      if (name && name !== 'video.mp4') {
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}"`);
      }
    },
    onData: (chunk) => {
      if (!cancelled) res.write(chunk);
    },
    onEnd: () => {
      if (!cancelled) res.end();
      const count = activeDownloads.get(userKey) || 1;
      activeDownloads.set(userKey, Math.max(0, count - 1));
    },
    onError: (err) => {
      logger.error(`Download error for ${url}: ${err.message}`);
      const count = activeDownloads.get(userKey) || 1;
      activeDownloads.set(userKey, Math.max(0, count - 1));
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      } else {
        res.end();
      }
    },
  });
});

// ── GET /api/video/supported ───────────────────────────────
videoRouter.get('/supported', (_req: Request, res: Response) => {
  return res.json({
    success: true,
    data: [
      { name: 'YouTube',   domain: 'youtube.com',   icon: '▶' },
      { name: 'Instagram', domain: 'instagram.com', icon: '📷' },
      { name: 'Twitter/X', domain: 'twitter.com',   icon: '𝕏' },
      { name: 'TikTok',    domain: 'tiktok.com',    icon: '♪' },
      { name: 'Vimeo',     domain: 'vimeo.com',     icon: '🎬' },
      { name: 'Facebook',  domain: 'facebook.com',  icon: 'f' },
      { name: 'Reddit',    domain: 'reddit.com',    icon: 'r/' },
      { name: 'Twitch',    domain: 'twitch.tv',     icon: '🟣' },
      { name: 'Dailymotion', domain: 'dailymotion.com', icon: '▷' },
    ],
    note: 'Mais de 1000 sites suportados pelo yt-dlp',
  });
});

// ── Helper: build human-readable format label ──────────────
function buildFormatLabel(f: {
  resolution: string; ext: string; vcodec: string;
  acodec: string; format_note: string; filesize?: number;
}): string {
  if (f.vcodec === 'none') {
    return `Apenas áudio • ${f.ext.toUpperCase()}`;
  }
  const res  = f.resolution !== 'unknown' ? f.resolution : '';
  const note = f.format_note ? ` (${f.format_note})` : '';
  const size = f.filesize ? ` • ~${formatBytes(f.filesize)}` : '';
  return `${res}${note} • ${f.ext.toUpperCase()}${size}`.trim();
}
