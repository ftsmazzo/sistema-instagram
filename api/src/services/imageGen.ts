import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { uploadMedia, isStorageConfigured } from "./storage.js";
import { toInstagramFeedImage } from "./instagramImage.js";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GEMINI_API_KEY;

function getOpenAI(): OpenAI {
  if (!OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY não configurada. Necessária para gerar imagem com IA (DALL·E).");
  }
  return new OpenAI({ apiKey: OPENAI_API_KEY.trim() });
}

function getGemini(): GoogleGenAI {
  if (!GEMINI_API_KEY?.trim()) {
    throw new Error("GEMINI_API_KEY não configurada. Defina a variável de ambiente para usar Imagen.");
  }
  return new GoogleGenAI({ apiKey: GEMINI_API_KEY.trim() });
}

async function uploadFeedImage(buffer: Buffer): Promise<string> {
  const normalized = await toInstagramFeedImage(buffer);
  return uploadMedia(normalized, "image/jpeg", ".jpg");
}

/**
 * Gera imagem com DALL·E 3 (OpenAI) em retrato ~4:5.
 */
export async function gerarImagemOpenAI(prompt: string): Promise<string> {
  if (!isStorageConfigured()) {
    throw new Error("Configure um armazenamento (Cloudinary, local ou MinIO) para salvar a imagem gerada.");
  }
  const openai = getOpenAI();
  const res = await openai.images.generate({
    model: "dall-e-3",
    prompt: prompt.slice(0, 4000),
    n: 1,
    size: "1024x1792",
    quality: "standard",
    response_format: "b64_json",
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("DALL·E não retornou imagem.");
  const buffer = Buffer.from(b64, "base64");
  return uploadFeedImage(buffer);
}

/**
 * Gera imagem com Imagen 4 (Google Gemini API).
 */
export async function gerarImagemGemini(prompt: string): Promise<string> {
  if (!isStorageConfigured()) {
    throw new Error("Configure um armazenamento (Cloudinary, local ou MinIO) para salvar a imagem gerada.");
  }
  const ai = getGemini();
  const response = await ai.models.generateImages({
    model: "imagen-4.0-generate-001",
    prompt: prompt.slice(0, 4000),
    config: { numberOfImages: 1, aspectRatio: "3:4" },
  });
  const generatedImages = (response as { generatedImages?: Array<{ image?: { imageBytes?: string } }> }).generatedImages;
  const b64 = generatedImages?.[0]?.image?.imageBytes;
  if (!b64) throw new Error("Imagen não retornou imagem.");
  const buffer = Buffer.from(b64, "base64");
  return uploadFeedImage(buffer);
}

export type ImageGenProvider = "openai" | "gemini";

/**
 * Gera uma imagem com IA (OpenAI DALL·E ou Google Imagen) e faz upload no storage (4:5 feed).
 */
export async function gerarImagemComIA(prompt: string, provider: ImageGenProvider = "gemini"): Promise<string> {
  if (provider === "gemini") return gerarImagemGemini(prompt);
  return gerarImagemOpenAI(prompt);
}
