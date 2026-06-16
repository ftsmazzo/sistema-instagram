import { readFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { GoogleGenAI } from "@google/genai";
import { uploadMedia, isStorageConfigured } from "./storage.js";
import { gerarSlideshowReels } from "./videoSlideshow.js";
import { POSTADOR_CUSTO_ESTIMADO_USD } from "./postadorNiches.js";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GEMINI_API_KEY;
const SORA_MODEL = (process.env.SORA_MODEL ?? "sora-2").trim();
const VEO_MODEL = (process.env.VEO_MODEL ?? "veo-3.1-fast-generate-preview").trim();
const POLL_MS = Number(process.env.POSTADOR_VIDEO_POLL_MS ?? 8000);
const MAX_WAIT_MS = Number(process.env.POSTADOR_VIDEO_MAX_WAIT_MS ?? 300000);

export type VideoGenProvider = "slideshow" | "veo" | "sora";
export type VideoDuration = 4 | 8 | 12;

export type GerarVideoInput = {
  provider: VideoGenProvider;
  prompt: string;
  image_urls?: string[];
  duration_seconds?: VideoDuration;
};

export type GerarVideoResult = {
  media_url: string;
  media_type: "REELS";
  provider: VideoGenProvider;
  duration_seconds: VideoDuration;
  custo_estimado_usd: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function custoEstimado(provider: VideoGenProvider, seconds: VideoDuration): number {
  if (provider === "slideshow") {
    return seconds <= 4 ? 0.01 : POSTADOR_CUSTO_ESTIMADO_USD.video_slideshow_8s;
  }
  if (provider === "veo") {
    return seconds <= 4
      ? POSTADOR_CUSTO_ESTIMADO_USD.video_veo_lite_8s * 0.5
      : POSTADOR_CUSTO_ESTIMADO_USD.video_veo_lite_8s;
  }
  // sora ~0.10/s referência OpenAI
  return seconds * 0.1;
}

async function uploadMp4(buffer: Buffer): Promise<string> {
  return uploadMedia(buffer, "video/mp4", ".mp4");
}

async function gerarVideoVeo(prompt: string, _duration: VideoDuration): Promise<Buffer> {
  if (!GEMINI_API_KEY?.trim()) {
    throw new Error("GEMINI_API_KEY não configurada. Necessária para Veo (Google).");
  }
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY.trim() });

  let operation = await ai.models.generateVideos({
    model: VEO_MODEL,
    prompt: prompt.slice(0, 4000),
    config: {
      numberOfVideos: 1,
      aspectRatio: "9:16",
    },
  });

  const deadline = Date.now() + MAX_WAIT_MS;
  while (!operation.done) {
    if (Date.now() > deadline) {
      throw new Error(`Timeout aguardando Veo (${MAX_WAIT_MS / 1000}s). Tente novamente.`);
    }
    await sleep(POLL_MS);
    operation = await ai.operations.getVideosOperation({ operation });
  }

  const err = (operation as { error?: { message?: string } }).error;
  if (err?.message) throw new Error(`Veo falhou: ${err.message}`);

  const generated = (operation as { response?: { generatedVideos?: Array<{ video?: unknown }> } }).response
    ?.generatedVideos?.[0]?.video;
  if (!generated) throw new Error("Veo não retornou vídeo na operação.");

  const tmpPath = join(tmpdir(), `veo-${Date.now()}.mp4`);
  try {
    await ai.files.download({
      file: generated as never,
      downloadPath: tmpPath,
    });
    return readFile(tmpPath);
  } finally {
    await unlink(tmpPath).catch(() => undefined);
  }
}

async function gerarVideoSora(prompt: string, duration: VideoDuration): Promise<Buffer> {
  if (!OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY não configurada. Necessária para Sora (OpenAI).");
  }
  const key = OPENAI_API_KEY.trim();
  const seconds = duration === 4 ? "4" : duration === 12 ? "12" : "8";

  const form = new FormData();
  form.append("prompt", prompt.slice(0, 4000));
  form.append("model", SORA_MODEL);
  form.append("size", "720x1280");
  form.append("seconds", seconds);

  const createRes = await fetch("https://api.openai.com/v1/videos", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });

  if (!createRes.ok) {
    const errBody = (await createRes.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(errBody.error?.message ?? `Sora HTTP ${createRes.status}`);
  }

  const job = (await createRes.json()) as { id: string; status?: string };
  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    const stRes = await fetch(`https://api.openai.com/v1/videos/${job.id}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!stRes.ok) {
      throw new Error(`Sora status HTTP ${stRes.status}`);
    }
    const data = (await stRes.json()) as {
      status: string;
      error?: { message?: string };
    };
    if (data.status === "failed") {
      throw new Error(data.error?.message ?? "Sora falhou ao gerar o vídeo.");
    }
    if (data.status === "completed") {
      const dl = await fetch(`https://api.openai.com/v1/videos/${job.id}/content`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!dl.ok) throw new Error(`Falha ao baixar vídeo Sora: HTTP ${dl.status}`);
      return Buffer.from(await dl.arrayBuffer());
    }
  }

  throw new Error(`Timeout aguardando Sora (${MAX_WAIT_MS / 1000}s).`);
}

export const VIDEO_PROVIDERS_INFO = [
  {
    id: "slideshow" as const,
    label: "Slideshow (ffmpeg)",
    descricao: "Imagens em sequência com movimento leve. Quase sem custo de IA.",
    requer_imagens: true,
    requer_prompt: false,
    duracoes: [4, 8, 12] as VideoDuration[],
    custo_ref_8s_usd: POSTADOR_CUSTO_ESTIMADO_USD.video_slideshow_8s,
  },
  {
    id: "veo" as const,
    label: "Veo (Google)",
    descricao: "Texto → vídeo vertical via Gemini API. Assíncrono (~1–3 min).",
    requer_imagens: false,
    requer_prompt: true,
    duracoes: [4, 8] as VideoDuration[],
    custo_ref_8s_usd: POSTADOR_CUSTO_ESTIMADO_USD.video_veo_lite_8s,
  },
  {
    id: "sora" as const,
    label: "Sora 2 (OpenAI)",
    descricao: "Texto → vídeo com áudio. Assíncrono (~2–5 min).",
    requer_imagens: false,
    requer_prompt: true,
    duracoes: [4, 8, 12] as VideoDuration[],
    custo_ref_8s_usd: 0.8,
  },
];

/**
 * Gera vídeo Reels (9:16) com slideshow, Veo ou Sora.
 */
export async function gerarVideoComIA(input: GerarVideoInput): Promise<GerarVideoResult> {
  if (!isStorageConfigured()) {
    throw new Error("Configure armazenamento (Cloudinary, local ou MinIO) para salvar o vídeo.");
  }

  const provider = input.provider;
  const duration: VideoDuration = input.duration_seconds ?? 8;
  const prompt = (input.prompt ?? "").trim();
  const imageUrls = (input.image_urls ?? []).filter(Boolean);

  let buffer: Buffer;

  switch (provider) {
    case "slideshow": {
      if (!imageUrls.length) {
        throw new Error("Slideshow precisa de pelo menos 1 imagem. Envie fotos ou gere uma imagem antes.");
      }
      buffer = await gerarSlideshowReels(imageUrls, duration);
      break;
    }
    case "veo": {
      if (!prompt) throw new Error("Veo precisa de um prompt/descrição do vídeo.");
      buffer = await gerarVideoVeo(prompt, duration);
      break;
    }
    case "sora": {
      if (!prompt) throw new Error("Sora precisa de um prompt/descrição do vídeo.");
      buffer = await gerarVideoSora(prompt, duration);
      break;
    }
    default:
      throw new Error(`Provedor de vídeo inválido: ${provider}`);
  }

  const media_url = await uploadMp4(buffer);
  return {
    media_url,
    media_type: "REELS",
    provider,
    duration_seconds: duration,
    custo_estimado_usd: custoEstimado(provider, duration),
  };
}
