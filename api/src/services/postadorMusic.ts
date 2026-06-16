/**
 * Biblioteca de músicas royalty-free para slideshow Reels.
 * Fonte: Mixkit (mixkit.co/license) — uso gratuito em projetos comerciais.
 */

export type PostadorMusicTrack = {
  id: string;
  label: string;
  mood: string;
  /** URL pública do preview MP3 */
  url: string;
  volume: number;
};

export const POSTADOR_MUSIC_CATALOG: PostadorMusicTrack[] = [
  {
    id: "none",
    label: "Sem música",
    mood: "silencioso",
    url: "",
    volume: 0,
  },
  {
    id: "serene",
    label: "Serene View",
    mood: "calmo · spa · bem-estar",
    url: "https://assets.mixkit.co/music/preview/mixkit-serene-view-443.mp3",
    volume: 0.32,
  },
  {
    id: "dreaming",
    label: "Dreaming Big",
    mood: "inspirador · marcas · lifestyle",
    url: "https://assets.mixkit.co/music/preview/mixkit-dreaming-big-31.mp3",
    volume: 0.3,
  },
  {
    id: "champion",
    label: "Spirit of Champion",
    mood: "energético · fitness · motivação",
    url: "https://assets.mixkit.co/music/preview/mixkit-spirit-of-the-champion-878.mp3",
    volume: 0.28,
  },
  {
    id: "tech",
    label: "Tech House Vibes",
    mood: "moderno · tech · B2B",
    url: "https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3",
    volume: 0.3,
  },
  {
    id: "lofi",
    label: "Lo-Fi Chill",
    mood: "relax · criativo · reels suaves",
    url: "https://assets.mixkit.co/music/preview/mixkit-lo-fi-chill-438.mp3",
    volume: 0.32,
  },
  {
    id: "corporate",
    label: "Corporate Success",
    mood: "corporativo · serviços · consultoria",
    url: "https://assets.mixkit.co/music/preview/mixkit-corporate-success-342.mp3",
    volume: 0.28,
  },
  {
    id: "beauty",
    label: "Silent Descent",
    mood: "beleza · estética · delicado",
    url: "https://assets.mixkit.co/music/preview/mixkit-silent-descent-614.mp3",
    volume: 0.28,
  },
];

export function listMusicTracksForApi(): Array<Omit<PostadorMusicTrack, "url"> & { preview_url?: string }> {
  return POSTADOR_MUSIC_CATALOG.map(({ id, label, mood, url, volume }) => ({
    id,
    label,
    mood,
    volume,
    preview_url: url || undefined,
  }));
}

export function resolveMusicTrack(id?: string | null): PostadorMusicTrack | null {
  if (!id || id === "none") return null;
  return POSTADOR_MUSIC_CATALOG.find((t) => t.id === id) ?? null;
}
