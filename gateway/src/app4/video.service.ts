import { spawn, execSync } from 'child_process';
import { createWriteStream, mkdirSync, existsSync, unlinkSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

// ── Detect yt-dlp binary ────────────────────────────────────
function getYtDlpBin(): string {
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
  uploader: string;
  webpage_url: string;
  extractor: string;
  description?: string;
  formats: VideoFormat[];
  best_format_id: string;
}

// ── Get video metadata without downloading ─────────────────
export async function getVideoInfo(url: string): Promise<VideoInfo> {
  const bin = getYtDlpBin();

  return new Promise((resolve, reject) => {
    const args = [
      '--dump-json',
      '--no-warnings',
      '--no-playlist',
      url,
    ];

    let output = '';
    let errorOutput = '';

    const proc = spawn(bin, args, { timeout: 30000 });

    proc.stdout.on('data', (chunk) => { output += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { errorOutput += chunk.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(
          errorOutput.includes('Unsupported URL') ? 'URL não suportada. Verifique o link.' :
          errorOutput.includes('Private video')   ? 'Vídeo privado.' :
          errorOutput.includes('not available')   ? 'Vídeo não disponível nesta região.' :
          `Erro ao obter informações: ${errorOutput.slice(0, 200)}`
        ));
      }

      try {
        const data = JSON.parse(output);

        // Filter to useful formats (video+audio or audio only)
        const rawFormats: VideoFormat[] = (data.formats || [])
          .filter((f: VideoFormat) =>
            f.vcodec !== 'none' || f.acodec !== 'none'
          )
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

        // Deduplicate by resolution, keeping best quality per resolution
        const seen = new Map<string, VideoFormat>();
        for (const f of rawFormats) {
          const key = f.resolution;
          if (!seen.has(key) || f.quality > (seen.get(key)?.quality || 0)) {
            seen.set(key, f);
          }
        }

        const formats = Array.from(seen.values())
          .sort((a, b) => b.quality - a.quality)
          .slice(0, 10); // max 10 options

        resolve({
          title:         data.title || 'Vídeo sem título',
          thumbnail:     data.thumbnail || '',
          duration:      data.duration || 0,
          uploader:      data.uploader || data.channel || 'Desconhecido',
          webpage_url:   data.webpage_url || url,
          extractor:     data.extractor_key || data.extractor || 'unknown',
          description:   data.description?.slice(0, 300),
          formats,
          best_format_id: data.format_id || 'bestvideo+bestaudio/best',
        });
      } catch (e) {
        reject(new Error('Resposta inválida do yt-dlp'));
      }
    });

    proc.on('error', (err) => reject(new Error(`Falha ao executar yt-dlp: ${err.message}`)));
  });
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

  // Format selector:
  // - If user picks a specific format, use it merged with best audio
  // - "best" = single file with video+audio merged
  const formatSelector = formatId === 'best'
    ? 'bestvideo+bestaudio/best'
    : `${formatId}+bestaudio/${formatId}/best`;

  const args = [
    '--format', formatSelector,
    '--merge-output-format', outputExt || 'mp4',
    '--no-warnings',
    '--no-playlist',
    '--output', '-',   // pipe to stdout
    url,
  ];

  logger.info(`yt-dlp download: ${url} [format=${formatId}]`);

  // Emit a reasonable filename
  onFilename(`video.${outputExt || 'mp4'}`);

  const proc = spawn(bin, args, { timeout: 300000 }); // 5 min timeout

  proc.stdout.on('data', onData);
  proc.stdout.on('end', onEnd);
  proc.stderr.on('data', (chunk) => {
    const msg = chunk.toString();
    // Extract filename from yt-dlp output
    const match = msg.match(/\[download\] Destination: (.+)/);
    if (match) onFilename(path.basename(match[1]));
  });

  proc.on('error', (err) => onError(new Error(`yt-dlp error: ${err.message}`)));
  proc.on('close', (code) => {
    if (code !== 0 && code !== null) {
      onError(new Error(`yt-dlp exited with code ${code}`));
    }
  });

  // Return cancel function
  return () => { proc.kill('SIGTERM'); };
}

// ── Format duration to mm:ss or hh:mm:ss ──────────────────
export function formatDuration(seconds: number): string {
  if (!seconds) return 'desconhecido';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Format bytes to human readable ────────────────────────
export function formatBytes(bytes?: number): string {
  if (!bytes) return 'tamanho desconhecido';
  const units = ['B', 'KB', 'MB', 'GB'];
  let val = bytes;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(1)} ${units[i]}`;
}
