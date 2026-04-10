import { spawn, execSync, spawnSync } from 'child_process';
import { existsSync, unlinkSync, readdirSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

// ── Paths ──────────────────────────────────────────────────
const COOKIES_PATH = process.env.YOUTUBE_COOKIES_FILE
  || path.join(process.cwd(), 'youtube-cookies.txt');

// ── Detect yt-dlp ──────────────────────────────────────────
export function getYtDlpBin(): string {
  for (const bin of ['yt-dlp', '/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp']) {
    try { execSync(`${bin} --version`, { stdio: 'pipe' }); return bin; } catch { /* next */ }
  }
  throw new Error('yt-dlp não encontrado. Instale com: pip install yt-dlp');
}

export function hasCookies(): boolean {
  return existsSync(COOKIES_PATH) && readFileSync(COOKIES_PATH, 'utf8').trim().length > 50;
}

export function saveCookies(content: string): void {
  writeFileSync(COOKIES_PATH, content, 'utf8');
  logger.info('YouTube cookies saved to ' + COOKIES_PATH);
}

// ── Shared yt-dlp args ─────────────────────────────────────
function baseArgs(): string[] {
  const args = ['--no-warnings', '--no-playlist', '--no-check-certificates'];
  if (hasCookies()) {
    args.push('--cookies', COOKIES_PATH);
  }
  return args;
}

// ── Translate errors ───────────────────────────────────────
export function translateError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('sign in') || m.includes('bot') || m.includes('login') || m.includes('cookie'))
    return 'Este vídeo requer login. Configure os cookies do YouTube no painel de configurações do App4.';
  if (m.includes('private'))            return 'Vídeo privado.';
  if (m.includes('not available'))      return 'Vídeo não disponível nesta região.';
  if (m.includes('unsupported'))        return 'URL não suportada. Verifique o link.';
  if (m.includes('403'))                return 'Acesso negado. Tente outro link.';
  if (m.includes('age') || m.includes('confirm')) return 'Vídeo com restrição de idade — configure cookies.';
  if (m.includes('http error 429'))     return 'Muitas requisições. Aguarde alguns minutos.';
  return msg.slice(0, 300);
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
  is_audio_only: boolean;
}

export interface VideoInfo {
  title: string;
  thumbnail: string;
  duration: number;
  duration_fmt: string;
  uploader: string;
  extractor: string;
  description?: string;
  formats: VideoFormat[];
}

export function formatDuration(seconds: number): string {
  if (!seconds) return 'desconhecido';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${m}:${String(s).padStart(2,'0')}`;
}

export function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  const u = ['B','KB','MB','GB'];
  let v = bytes, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `~${v.toFixed(0)} ${u[i]}`;
}

// ── Get video info ─────────────────────────────────────────
export async function getVideoInfo(url: string): Promise<VideoInfo> {
  const bin = getYtDlpBin();
  const args = [...baseArgs(), '--dump-json', url];

  return new Promise((resolve, reject) => {
    let out = ''; let err = '';
    const proc = spawn(bin, args, { timeout: 45000 });
    proc.stdout.on('data', (c) => { out += c.toString(); });
    proc.stderr.on('data', (c) => { err += c.toString(); });
    proc.on('error', (e) => reject(new Error('yt-dlp: ' + e.message)));
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(translateError(err)));

      let data: Record<string, unknown>;
      try { data = JSON.parse(out); }
      catch { return reject(new Error('Resposta inválida do yt-dlp')); }

      // Build format list
      const rawFormats = (data.formats as VideoFormat[] || []);
      const seen = new Map<string, VideoFormat>();

      for (const f of rawFormats) {
        if (!f.format_id) continue;
        // Skip storyboard/thumbnails formats
        if ((f.vcodec === 'none' && f.acodec === 'none')) continue;
        if (String(f.format_id).startsWith('sb')) continue;

        const isAudio = f.vcodec === 'none';
        const key = isAudio
          ? `audio_${f.acodec}_${f.format_id}`
          : (f.resolution || f.format_id);

        const quality = Number(f.quality) || 0;
        if (!seen.has(key) || quality > (seen.get(key)?.quality || 0)) {
          seen.set(key, {
            format_id:    String(f.format_id),
            ext:          String(f.ext || 'mp4'),
            resolution:   String(f.resolution || (isAudio ? 'audio only' : 'unknown')),
            filesize:     f.filesize ? Number(f.filesize) : undefined,
            vcodec:       String(f.vcodec || 'none'),
            acodec:       String(f.acodec || 'none'),
            format_note:  String(f.format_note || ''),
            quality,
            is_audio_only: isAudio,
          });
        }
      }

      const formats = Array.from(seen.values())
        .sort((a, b) =>
          Number(a.is_audio_only) - Number(b.is_audio_only) || b.quality - a.quality
        )
        .slice(0, 15);

      // Always add explicit MP3 audio option if not present
      if (!formats.some(f => f.is_audio_only)) {
        formats.push({
          format_id: 'bestaudio', ext: 'mp3', resolution: 'audio only',
          vcodec: 'none', acodec: 'mp4a', format_note: 'Melhor áudio (MP3)',
          quality: 0, is_audio_only: true,
        });
      }

      resolve({
        title:       String(data.title || 'Vídeo'),
        thumbnail:   String(data.thumbnail || ''),
        duration:    Number(data.duration || 0),
        duration_fmt: formatDuration(Number(data.duration || 0)),
        uploader:    String(data.uploader || data.channel || 'Desconhecido'),
        extractor:   String(data.extractor_key || data.extractor || 'unknown'),
        description: data.description ? String(data.description).slice(0, 300) : undefined,
        formats,
      });
    });
  });
}

// ── Download to temp file ─────────────────────────────────
// Strategy: let yt-dlp choose output name, find the file, return it
export async function downloadToFile(params: {
  url: string;
  formatId: string;
  isAudio: boolean;
}): Promise<{ filePath: string; filename: string; mimeType: string; cleanup: () => void }> {
  const { url, formatId, isAudio } = params;
  const bin = getYtDlpBin();
  const tmpId = uuidv4().slice(0, 8);

  // Use a temp dir per download to easily find the output file
  const tmpDir = path.join(tmpdir(), `ytdl-${tmpId}`);
  const { mkdirSync } = await import('fs');
  mkdirSync(tmpDir, { recursive: true });

  const outputTemplate = path.join(tmpDir, '%(title)s.%(ext)s');

  let args: string[];
  if (isAudio) {
    args = [
      ...baseArgs(),
      '--format', 'bestaudio/best',
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '192K',
      '--output', outputTemplate,
      url,
    ];
  } else {
    // Use a format that results in a single ready-to-play mp4
    // bestvideo*+bestaudio: requires ffmpeg to merge
    // best[ext=mp4]: single file mp4
    const hasFfmpegBin = (() => {
      try { execSync('ffmpeg -version', { stdio: 'pipe' }); return true; } catch { return false; }
    })();

    const fmt = formatId === 'best' || formatId === 'bestaudio'
      ? (hasFfmpegBin ? 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best' : 'best[ext=mp4]/best')
      : formatId;

    args = [
      ...baseArgs(),
      '--format', fmt,
      ...(hasFfmpegBin ? ['--merge-output-format', 'mp4'] : []),
      '--output', outputTemplate,
      url,
    ];
  }

  logger.info(`yt-dlp: ${isAudio ? 'AUDIO' : 'VIDEO'} format=${formatId} url=${url}`);

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(bin, args, { timeout: 600000 }); // 10 min
    let errBuf = '';
    proc.stderr.on('data', (c) => {
      const msg = c.toString();
      errBuf += msg;
      if (msg.includes('[download]') || msg.includes('[ffmpeg]')) {
        logger.info('yt-dlp: ' + msg.trim().slice(0, 120));
      }
    });
    proc.on('error', (e) => reject(new Error('yt-dlp spawn: ' + e.message)));
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(translateError(errBuf)));
      else resolve();
    });
  });

  // Find the downloaded file
  const files = readdirSync(tmpDir);
  if (files.length === 0) throw new Error('yt-dlp não gerou nenhum arquivo');

  const downloaded = files[0];
  const filePath = path.join(tmpDir, downloaded);
  const ext = path.extname(downloaded).slice(1) || (isAudio ? 'mp3' : 'mp4');
  const mimeType = isAudio ? 'audio/mpeg' : ext === 'webm' ? 'video/webm' : 'video/mp4';
  const safeFilename = downloaded.replace(/[^\w\s.\-]/g, '').slice(0, 100) || `video.${ext}`;

  return {
    filePath,
    filename: safeFilename,
    mimeType,
    cleanup: () => {
      try {
        if (existsSync(filePath)) unlinkSync(filePath);
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('fs').rmdirSync(tmpDir);
      } catch { /* ignore */ }
    },
  };
}
