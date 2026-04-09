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
  source: 'ytdl' | 'ytdlp';
}

function isYouTube(url: string): boolean {
  return url.includes('youtube.com') || url.includes('youtu.be');
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

// ── YouTube via @distube/ytdl-core ─────────────────────────
async function getYouTubeInfo(url: string): Promise<VideoInfo> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ytdl = require('@distube/ytdl-core');
  const info = await ytdl.getInfo(url, {
    requestOptions: {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      },
    },
  });

  const details = info.videoDetails;

  // Build format list from ytdl formats
  const formats: VideoFormat[] = [];
  const seen = new Set<string>();

  for (const f of info.formats) {
    if (!f.qualityLabel && !f.audioQuality) continue;
    const res = f.qualityLabel || 'audio only';
    if (seen.has(res)) continue;
    seen.add(res);

    formats.push({
      format_id:   f.itag.toString(),
      ext:         f.container || 'mp4',
      resolution:  res,
      filesize:    f.contentLength ? parseInt(f.contentLength) : undefined,
      vcodec:      f.codecs?.includes('avc') ? 'avc1' : (f.videoCodec || 'none'),
      acodec:      f.audioCodec || 'none',
      format_note: f.qualityLabel || f.audioQuality || '',
      quality:     f.height || (f.audioQuality === 'AUDIO_QUALITY_HIGH' ? 10 : 5),
    });
  }

  formats.sort((a, b) => b.quality - a.quality);

  return {
    title:          details.title || 'YouTube Video',
    thumbnail:      details.thumbnails?.slice(-1)[0]?.url || '',
    duration:       parseInt(details.lengthSeconds) || 0,
    duration_fmt:   formatDuration(parseInt(details.lengthSeconds) || 0),
    uploader:       details.author?.name || 'YouTube',
    webpage_url:    url,
    extractor:      'YouTube',
    description:    details.description?.slice(0, 300),
    formats:        formats.slice(0, 10),
    best_format_id: 'best',
    source:         'ytdl',
  };
}

// ── YouTube stream via ytdl-core ───────────────────────────
export function downloadYouTubeStream(params: {
  url: string;
  formatId: string;
  onData: (chunk: Buffer) => void;
  onEnd: () => void;
  onError: (err: Error) => void;
  onFilename: (name: string) => void;
}): () => void {
  const { url, formatId, onData, onEnd, onError, onFilename } = params;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ytdl = require('@distube/ytdl-core');

  onFilename('video.mp4');

  let cancelled = false;
  const stream = ytdl(url, {
    quality: formatId === 'best' ? 'highestvideo' : formatId,
    filter: formatId === 'best' ? 'audioandvideo' : undefined,
    requestOptions: {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      },
    },
  });

  stream.on('data', (chunk: Buffer) => { if (!cancelled) onData(chunk); });
  stream.on('end', () => { if (!cancelled) onEnd(); });
  stream.on('error', (err: Error) => { if (!cancelled) onError(err); });

  return () => { cancelled = true; stream.destroy(); };
}

// ── Run yt-dlp ─────────────────────────────────────────────
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
    proc.on('error', (err) => reject(new Error('yt-dlp error: ' + err.message)));
  });
}

function translateError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('sign in') || m.includes('bot') || m.includes('cookie'))
    return 'Vídeo requer autenticação. Tente outro link.';
  if (m.includes('private'))           return 'Vídeo privado.';
  if (m.includes('not available'))     return 'Vídeo não disponível nesta região.';
  if (m.includes('unsupported'))       return 'URL não suportada. Verifique o link.';
  if (m.includes('403'))               return 'Acesso negado. Tente outro link.';
  if (m.includes('age'))               return 'Vídeo com restrição de idade.';
  return msg.slice(0, 200);
}

// ── Get video info — YouTube via ytdl-core, others via yt-dlp
export async function getVideoInfo(url: string): Promise<VideoInfo> {
  // Use ytdl-core for YouTube (works on cloud without cookies)
  if (isYouTube(url)) {
    try {
      return await getYouTubeInfo(url);
    } catch (err) {
      const msg = (err as Error).message;
      logger.warn('ytdl-core failed for ' + url + ': ' + msg.slice(0, 80));
      throw new Error(
        msg.includes('age') ? 'Vídeo com restrição de idade — requer login.' :
        msg.includes('private') ? 'Vídeo privado.' :
        msg.includes('unavailable') ? 'Vídeo não disponível.' :
        'Não foi possível carregar este vídeo do YouTube. Tente outro link.'
      );
    }
  }

  // All other sites: use yt-dlp
  const bin = getYtDlpBin();
  const args = [
    '--dump-json', '--no-warnings', '--no-playlist', '--no-check-certificates', url,
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

    const formats = Array.from(seen.values()).sort((a, b) => b.quality - a.quality).slice(0, 10);

    return {
      title:          data.title || 'Vídeo',
      thumbnail:      data.thumbnail || '',
      duration:       data.duration || 0,
      duration_fmt:   formatDuration(data.duration || 0),
      uploader:       data.uploader || data.channel || 'Desconhecido',
      webpage_url:    data.webpage_url || url,
      extractor:      data.extractor_key || 'unknown',
      description:    data.description?.slice(0, 300),
      formats,
      best_format_id: data.format_id || 'best',
      source:         'ytdlp',
    };
  } catch (err) {
    throw new Error(translateError((err as Error).message));
  }
}

// ── Stream download ────────────────────────────────────────
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

  // YouTube: use ytdl-core
  if (isYouTube(url)) {
    return downloadYouTubeStream({ url, formatId, onData, onEnd, onError, onFilename });
  }

  // Others: yt-dlp
  const bin = getYtDlpBin();
  const formatSelector = formatId === 'best'
    ? 'bestvideo+bestaudio/best'
    : `${formatId}+bestaudio/${formatId}/best`;

  const args = [
    '--format', formatSelector,
    '--merge-output-format', outputExt || 'mp4',
    '--no-warnings', '--no-playlist', '--no-check-certificates',
    '--output', '-',
    url,
  ];

  onFilename('video.' + (outputExt || 'mp4'));
  const proc = spawn(bin, args, { timeout: 300000 });
  proc.stdout.on('data', onData);
  proc.stdout.on('end', onEnd);
  proc.stderr.on('data', (chunk) => {
    const msg: string = chunk.toString();
    const match = msg.match(/\[download\] Destination: (.+)/);
    if (match) onFilename(path.basename(match[1]));
  });
  proc.on('error', (err) => onError(new Error('yt-dlp: ' + err.message)));
  proc.on('close', (code) => { if (code !== 0 && code !== null) onError(new Error('yt-dlp exit ' + code)); });
  return () => { proc.kill('SIGTERM'); };
}
