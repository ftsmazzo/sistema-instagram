import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { uploadMedia, isStorageConfigured } from "./storage.js";

const execFileAsync = promisify(execFile);

const REELS_W = 1080;
const REELS_H = 1920;
const FADE_SEC = 0.45;

async function assertFfmpeg(): Promise<void> {
  try {
    await execFileAsync("ffmpeg", ["-version"]);
  } catch {
    throw new Error(
      "ffmpeg não está instalado no servidor. Necessário para slideshow (apk add ffmpeg no container da API)."
    );
  }
}

async function downloadImageBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; PostadorVideo/1.0)" },
  });
  if (!res.ok) throw new Error(`Não foi possível baixar imagem para slideshow: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function scaleCropFilter(index: number, fps: number): string {
  return `[${index}:v]scale=${REELS_W}:${REELS_H}:force_original_aspect_ratio=increase,crop=${REELS_W}:${REELS_H},setsar=1,fps=${fps},format=yuv420p[v${index}]`;
}

function fadeFilter(label: string, duration: number, fadeSec: number, isFirst: boolean, isLast: boolean): string {
  const parts: string[] = [];
  if (!isFirst) {
    parts.push(`fade=t=in:st=0:d=${fadeSec}`);
  }
  if (!isLast) {
    parts.push(`fade=t=out:st=${Math.max(0, duration - fadeSec)}:d=${fadeSec}`);
  }
  if (!parts.length) return `[${label}]copy[${label}f]`;
  return `[${label}]${parts.join(",")}[${label}f]`;
}

/**
 * Monta MP4 vertical (9:16) a partir de 1–10 imagens — Ken Burns, crossfade suave e faixa de áudio silenciosa.
 */
export async function gerarSlideshowReels(
  imageUrls: string[],
  durationSeconds: 4 | 8 | 12 = 8
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

  try {
    const urls = imageUrls.slice(0, 10);
    const paths: string[] = [];
    for (let i = 0; i < urls.length; i++) {
      const buf = await downloadImageBuffer(urls[i]);
      const p = join(dir, `slide_${String(i).padStart(2, "0")}.jpg`);
      await writeFile(p, buf);
      paths.push(p);
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
        filterParts.push(
          fadeFilter(`v${i}`, secPerSlide, FADE_SEC, i === 0, i === n - 1)
        );
      }
      const concatIn = paths.map((_, i) => `[v${i}f]`).join("");
      filterParts.push(`${concatIn}concat=n=${n}:v=1:a=0[outv]`);

      await execFileAsync("ffmpeg", [
        "-y",
        ...inputs,
        "-f",
        "lavfi",
        "-i",
        "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-filter_complex",
        filterParts.join(";"),
        "-map",
        "[outv]",
        "-map",
        `${n}:a`,
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
