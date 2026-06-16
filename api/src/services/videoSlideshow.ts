import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { uploadMedia, isStorageConfigured } from "./storage.js";
import type { PostadorMusicTrack } from "./postadorMusic.js";

const execFileAsync = promisify(execFile);

const REELS_W = 1080;
const REELS_H = 1920;
const FADE_SEC = 0.45;

export type SlideshowMusicOptions = {
  track?: PostadorMusicTrack | null;
  /** Segundo inicial na faixa (corte manual do trecho) */
  startSec?: number;
};

function clampMusicStart(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(180, Math.round(n * 10) / 10);
}

/** Filtro ffmpeg: volume + recorte [start, start+duration) */
function audioTrimFilter(volume: number, startSec: number, durationSec: number): string {
  const vol = Math.max(0.05, Math.min(1, volume));
  const start = clampMusicStart(startSec);
  const end = start + durationSec;
  return `volume=${vol},atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS`;
}

async function assertFfmpeg(): Promise<void> {
  try {
    await execFileAsync("ffmpeg", ["-version"]);
  } catch {
    throw new Error(
      "ffmpeg não está instalado no servidor. Necessário para slideshow (apk add ffmpeg no container da API)."
    );
  }
}

async function downloadBuffer(url: string, kind: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; PostadorVideo/1.0)" },
  });
  if (!res.ok) throw new Error(`Não foi possível baixar ${kind}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function scaleCropFilter(index: number, fps: number): string {
  return `[${index}:v]scale=${REELS_W}:${REELS_H}:force_original_aspect_ratio=increase,crop=${REELS_W}:${REELS_H},setsar=1,fps=${fps},format=yuv420p[v${index}]`;
}

function fadeFilter(label: string, duration: number, fadeSec: number, isFirst: boolean, isLast: boolean): string {
  const parts: string[] = [];
  if (!isFirst) parts.push(`fade=t=in:st=0:d=${fadeSec}`);
  if (!isLast) parts.push(`fade=t=out:st=${Math.max(0, duration - fadeSec)}:d=${fadeSec}`);
  if (!parts.length) return `[${label}]copy[${label}f]`;
  return `[${label}]${parts.join(",")}[${label}f]`;
}

/**
 * Monta MP4 vertical (9:16) a partir de 1–10 imagens — Ken Burns, crossfade e trilha opcional.
 */
export async function gerarSlideshowReels(
  imageUrls: string[],
  durationSeconds: 4 | 8 | 12 = 8,
  musicOpts?: SlideshowMusicOptions
): Promise<Buffer> {
  if (!isStorageConfigured()) {
    throw new Error("Configure armazenamento para salvar o vídeo gerado.");
  }
  if (!imageUrls.length) {
    throw new Error("Slideshow precisa de pelo menos 1 imagem (URL ou upload).");
  }
  await assertFfmpeg();

  const dir = await mkdtemp(join(tmpdir(), "postador-slideshow-"));
  const outPath = join(dir, "reels.mp4");
  const track = musicOpts?.track?.url ? musicOpts.track : null;
  const musicStart = clampMusicStart(musicOpts?.startSec);
  let musicPath: string | null = null;

  try {
    const urls = imageUrls.slice(0, 10);
    const paths: string[] = [];
    for (let i = 0; i < urls.length; i++) {
      const buf = await downloadBuffer(urls[i], "imagem");
      const p = join(dir, `slide_${String(i).padStart(2, "0")}.jpg`);
      await writeFile(p, buf);
      paths.push(p);
    }

    if (track?.url) {
      const musicBuf = await downloadBuffer(track.url, "música");
      musicPath = join(dir, "track.mp3");
      await writeFile(musicPath, musicBuf);
    }

    const n = paths.length;
    const secPerSlide = durationSeconds / n;
    const fps = 30;

    if (n === 1) {
      const vf = [
        `scale=${REELS_W}:${REELS_H}:force_original_aspect_ratio=increase`,
        `crop=${REELS_W}:${REELS_H}`,
        `zoompan=z='min(zoom+0.0012,1.25)':d=${durationSeconds * fps}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${REELS_W}x${REELS_H}:fps=${fps}`,
      ].join(",");

      if (musicPath && track) {
        await execFileAsync("ffmpeg", [
          "-y",
          "-loop",
          "1",
          "-i",
          paths[0],
          "-i",
          musicPath,
          "-filter_complex",
          `[0:v]${vf}[outv];[1:a]${audioTrimFilter(track.volume, musicStart, durationSeconds)}[aout]`,
          "-map",
          "[outv]",
          "-map",
          "[aout]",
          "-t",
          String(durationSeconds),
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "-shortest",
          outPath,
        ]);
      } else {
        await execFileAsync("ffmpeg", [
          "-y",
          "-loop",
          "1",
          "-i",
          paths[0],
          "-f",
          "lavfi",
          "-i",
          "anullsrc=channel_layout=stereo:sample_rate=44100",
          "-vf",
          vf,
          "-t",
          String(durationSeconds),
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "-shortest",
          "-r",
          String(fps),
          outPath,
        ]);
      }
    } else {
      const inputs = paths.flatMap((p) => [
        "-loop",
        "1",
        "-framerate",
        String(fps),
        "-t",
        String(secPerSlide),
        "-i",
        p,
      ]);

      const filterParts: string[] = [];
      for (let i = 0; i < n; i++) {
        filterParts.push(scaleCropFilter(i, fps));
      }
      for (let i = 0; i < n; i++) {
        filterParts.push(fadeFilter(`v${i}`, secPerSlide, FADE_SEC, i === 0, i === n - 1));
      }
      const concatIn = paths.map((_, i) => `[v${i}f]`).join("");
      filterParts.push(`${concatIn}concat=n=${n}:v=1:a=0[outv]`);

      if (musicPath) {
        filterParts.push(`[${n}:a]${audioTrimFilter(track!.volume, musicStart, durationSeconds)}[aout]`);
      }

      const filterComplex = filterParts.join(";");
      const mapArgs = musicPath
        ? ["-map", "[outv]", "-map", "[aout]"]
        : ["-map", "[outv]", "-map", `${n}:a`];

      await execFileAsync("ffmpeg", [
        "-y",
        ...inputs,
        ...(musicPath ? ["-i", musicPath] : ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"]),
        "-filter_complex",
        filterComplex,
        ...mapArgs,
        "-t",
        String(durationSeconds),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-shortest",
        outPath,
      ]);
    }

    const { readFile } = await import("fs/promises");
    return readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
