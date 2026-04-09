import { spawn } from 'child_process';
import { execSync } from 'child_process';
import path from 'path';
import { logger } from '../utils/logger';

// ── Detect yt-dlp binary ────────────────────────────────────
export function getYtDlpBin(): string {
  const candidates = ['yt-dlp', '/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp'];
  for (const bin of candidates) {
    try { execSync(`${bin} --version`, { stdio: 'pipe' }); return bin; } catch { /* try next */ }
  }
  throw new Error('yt-dlp not found. Install with: pip install yt-dlp');
}

export interface VideoFormat {
  format_id: string;
  ext: string;
  resolution: string;
  filesize?: number;
  vcodec: string;
  acodec: string;
  format_note: string;
  quality: number;
}

export interface VideoInfo {
  title: string;
  thumbnail: string;
  duration: number;
  duration_fmt: string;
  uploader: string;
  webpage_url: string;
  extractor: string;
  description?: string;
  formats: VideoFormat[];
  best_format_id: string;
}

// ── Run yt-dlp and return stdout ───────────────────────────
function runYtDlp(bin: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = '';
    let errorOutput = '';
    const proc = spawn(bin, args, { timeout: timeoutMs });
    proc.stdout.on('data', (chunk) => { output += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { errorOutput += chunk.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(errorOutput || `exit code ${code}`));
      resolve(output);
    });
    proc.on('error', (err) => reject(new Error('Failed to run yt-dlp: ' + err.message)));
  });
}

// ── Translate yt-dlp errors to Portuguese ─────────────────
function translateError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('sign in') || m.includes('bot') || m.includes('cookie') || m.includes('authenticate'))
    return 'O YouTube bloqueou este servidor. Configure YOUTUBE_COOKIES_FILE nas variáveis de ambiente, ou use Instagram, TikTok, Vimeo.';
  if (m.includes('private'))      return 'Vídeo privado — não disponível.';
  if (m.includes('not available')) return 'Vídeo não disponível nesta região.';
  if (m.includes('unsupported'))   return 'URL não suportada. Verifique o link.';
  if (m.includes('403'))           return 'Acesso negado pelo servidor. Tente outro link.';
  if (m.includes('age'))           return 'Vídeo com restrição de idade — requer login.';
  return msg.slice(0, 200);
}

// ── Get video metadata ─────────────────────────────────────
export async function getVideoInfo(url: string): Promise<VideoInfo> {
  const bin = getYtDlpBin();
  const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');

  // For YouTube: try multiple player clients in sequence
  const strategies = isYoutube
    ? ['tv_embedded', 'ios', 'mweb', 'web']
    : [null];

  let lastError = '';

  for (const client of strategies) {
    const args = [
      '--dump-json',
      '--no-warnings',
      '--no-playlist',
      '--no-check-certificates',
      ...(client ? ['--extractor-args', `youtube:player_client=${client}`] : []),
      ...(process.env.YOUTUBE_COOKIES_FILE ? ['--cookies', process.env.YOUTUBE_COOKIES_FILE] : []),
      url,
    ];

    try {
      const output = await runYtDlp(bin, args, 30000);
      const data = JSON.parse(output);

      const rawFormats: VideoFormat[] = (data.formats || [])
        .filter((f: VideoFormat) => f.vcodec !== 'none' || f.acodec !== 'none')
        .map((f: VideoFormat) => ({
          format_id:   f.format_id,
          ext:         f.ext,
          resolution:  f.resolution || (f.vcodec === 'none' ? 'audio only' : 'unknown'),
          filesize:    f.filesize,
          vcodec:      f.vcodec,
          acodec:      f.acodec,
          format_note: f.format_note || '',
          quality:     f.quality || 0,
        }));

      const seen = new Map<string, VideoFormat>();
      for (const f of rawFormats) {
        if (!seen.has(f.resolution) || f.quality > (seen.get(f.resolution)?.quality || 0)) {
          seen.set(f.resolution, f);
        }
      }

      const formats = Array.from(seen.values())
        .sort((a, b) => b.quality - a.quality)
        .slice(0, 10);

      return {
        title:          data.title || 'Vídeo sem título',
        thumbnail:      data.thumbnail || '',
        duration:       data.duration || 0,
        duration_fmt:   formatDuration(data.duration || 0),
        uploader:       data.uploader || data.channel || 'Desconhecido',
        webpage_url:    data.webpage_url || url,
        extractor:      data.extractor_key || data.extractor || 'unknown',
        description:    data.description?.slice(0, 300),
        formats,
        best_format_id: data.format_id || 'bestvideo+bestaudio/best',
      };
    } catch (err) {
      lastError = (err as Error).message;
      logger.warn(`yt-dlp client=${client || 'default'} failed for ${url}: ${lastError.slice(0, 80)}`);
    }
  }

  throw new Error(translateError(lastError));
}

// ── Download video and stream to response ──────────────────
export function downloadVideoStream(params: {
  url: string;
  formatId: string;
  outputExt: string;
  onData: (chunk: Buffer) => void;
  onEnd: () => void;
  onError: (err: Error) => void;
  onFilename: (name: string) => void;
}): () => void {
  const { url, formatId, outputExt, onData, onEnd, onError, onFilename } = params;
  const bin = getYtDlpBin();
  const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');

  const formatSelector = formatId === 'best'
    ? 'bestvideo+bestaudio/best'
    : `${formatId}+bestaudio/${formatId}/best`;

  const args = [
    '--format', formatSelector,
    '--merge-output-format', outputExt || 'mp4',
    '--no-warnings',
    '--no-playlist',
    '--no-check-certificates',
    ...(isYoutube ? ['--extractor-args', 'youtube:player_client=tv_embedded'] : []),
    ...(process.env.YOUTUBE_COOKIES_FILE ? ['--cookies', process.env.YOUTUBE_COOKIES_FILE] : []),
    '--output', '-',
    url,
  ];

  logger.info('yt-dlp download: ' + url + ' [format=' + formatId + ']');
  onFilename('video.' + (outputExt || 'mp4'));

  const proc = spawn(bin, args, { timeout: 300000 });

  proc.stdout.on('data', onData);
  proc.stdout.on('end', onEnd);
  proc.stderr.on('data', (chunk) => {
    const msg = chunk.toString();
    const match = msg.match(/\[download\] Destination: (.+)/);
    if (match) onFilename(path.basename(match[1]));
  });

  proc.on('error', (err) => onError(new Error('yt-dlp error: ' + err.message)));
  proc.on('close', (code) => {
    if (code !== 0 && code !== null) {
      onError(new Error('yt-dlp exited with code ' + code));
    }
  });

  return () => { proc.kill('SIGTERM'); };
}

// ── Format duration ────────────────────────────────────────
export function formatDuration(seconds: number): string {
  if (!seconds) return 'desconhecido';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Format bytes ───────────────────────────────────────────
export function formatBytes(bytes?: number): string {
  if (!bytes) return 'tamanho desconhecido';
  const units = ['B', 'KB', 'MB', 'GB'];
  let val = bytes;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(1)} ${units[i]}`;
}
