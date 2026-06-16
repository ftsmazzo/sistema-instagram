import { access, readFile } from "fs/promises";
import { join } from "path";

/**
 * Biblioteca de músicas royalty-free para slideshow Reels.
 * Fonte: FreePD (CC0) — https://freepd.com/ — espelhado em 0lhi/FreePD no GitHub.
 * Arquivos em assets/music/ (baixados no build Docker).
 */

const FREEPD_RAW = "https://raw.githubusercontent.com/0lhi/FreePD/stream";

export type PostadorMusicTrack = {
  id: string;
  label: string;
  mood: string;
  /** Arquivo local em assets/music/{id}.mp3 */
  local_file: string;
  /** Fallback se assets não existirem (dev local) */
  source_url: string;
  volume: number;
  /** Duração aproximada para slider de corte */
  preview_duration_sec: number;
};

export const POSTADOR_MUSIC_CATALOG: PostadorMusicTrack[] = [
  {
    id: "none",
    label: "Sem música",
    mood: "silencioso",
    local_file: "",
    source_url: "",
    volume: 0,
    preview_duration_sec: 0,
  },
  {
    id: "serene",
    label: "Meditating Beat",
    mood: "calmo · spa · bem-estar",
    local_file: "serene.mp3",
    source_url: `${FREEPD_RAW}/Electronic/Meditating%20Beat.mp3`,
    volume: 0.32,
    preview_duration_sec: 120,
  },
  {
    id: "dreaming",
    label: "Inspiration",
    mood: "inspirador · marcas · lifestyle",
    local_file: "dreaming.mp3",
    source_url: `${FREEPD_RAW}/Upbeat/Inspiration.mp3`,
    volume: 0.3,
    preview_duration_sec: 120,
  },
  {
    id: "champion",
    label: "Bar Brawl",
    mood: "energético · fitness · motivação",
    local_file: "champion.mp3",
    source_url: `${FREEPD_RAW}/Upbeat/Bar%20Brawl.mp3`,
    volume: 0.28,
    preview_duration_sec: 90,
  },
  {
    id: "tech",
    label: "Backbeat",
    mood: "moderno · tech · B2B",
    local_file: "tech.mp3",
    source_url: `${FREEPD_RAW}/Electronic/Backbeat.mp3`,
    volume: 0.3,
    preview_duration_sec: 90,
  },
  {
    id: "lofi",
    label: "Bit Bit Loop",
    mood: "relax · criativo · reels suaves",
    local_file: "lofi.mp3",
    source_url: `${FREEPD_RAW}/Electronic/Bit%20Bit%20Loop.mp3`,
    volume: 0.32,
    preview_duration_sec: 90,
  },
  {
    id: "corporate",
    label: "Stereotype News",
    mood: "corporativo · serviços · consultoria",
    local_file: "corporate.mp3",
    source_url: `${FREEPD_RAW}/Upbeat/Stereotype%20News.mp3`,
    volume: 0.28,
    preview_duration_sec: 90,
  },
  {
    id: "beauty",
    label: "Relaxing Ballad",
    mood: "beleza · estética · delicado",
    local_file: "beauty.mp3",
    source_url: `${FREEPD_RAW}/Upbeat/Relaxing%20Ballad.mp3`,
    volume: 0.28,
    preview_duration_sec: 120,
  },
];

export function getMusicAssetsDir(): string {
  return join(process.cwd(), "assets", "music");
}

export function getMusicAssetPath(trackId: string): string | null {
  const track = resolveMusicTrack(trackId);
  if (!track?.local_file) return null;
  return join(getMusicAssetsDir(), track.local_file);
}

export function listMusicTracksForApi(): Array<{
  id: string;
  label: string;
  mood: string;
  volume: number;
  preview_duration_sec?: number;
  preview_url?: string;
}> {
  return POSTADOR_MUSIC_CATALOG.map(({ id, label, mood, volume, preview_duration_sec }) => ({
    id,
    label,
    mood,
    volume,
    preview_duration_sec: preview_duration_sec || undefined,
    preview_url: id === "none" ? undefined : `/api/postador/music-tracks/${id}/preview`,
  }));
}

export function resolveMusicTrack(id?: string | null): PostadorMusicTrack | null {
  if (!id || id === "none") return null;
  return POSTADOR_MUSIC_CATALOG.find((t) => t.id === id) ?? null;
}

async function downloadMusicRemote(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; PostadorMusic/1.0)" },
  });
  if (!res.ok) throw new Error(`Não foi possível baixar música: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Carrega MP3 do disco (preferido) ou baixa source_url (dev). */
export async function loadMusicBuffer(track: PostadorMusicTrack): Promise<Buffer> {
  const localPath = track.local_file ? join(getMusicAssetsDir(), track.local_file) : null;
  if (localPath) {
    try {
      await access(localPath);
      return readFile(localPath);
    } catch {
      /* tenta fallback remoto */
    }
  }
  if (!track.source_url) {
    throw new Error(`Trilha "${track.label}" não encontrada em assets/music. Reimplante a API.`);
  }
  return downloadMusicRemote(track.source_url);
}
