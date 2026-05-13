import sharp from "sharp";
import { uploadMedia, isStorageConfigured } from "./storage.js";
import { toInstagramFeedImage } from "./instagramImage.js";

const INSTAGRAM_MAX_SIDE = 1080;
const FONT_SIZE = 56;
const FONT_FAMILY = "'DejaVu Sans', 'Arial', sans-serif";

/**
 * Quebra o texto em linhas para caber na largura da imagem
 */
function wrapText(text: string, maxCharsPerLine = 35): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + word).length > maxCharsPerLine) {
      if (currentLine) lines.push(currentLine.trim());
      currentLine = word + " ";
    } else {
      currentLine += word + " ";
    }
  }
  if (currentLine) lines.push(currentLine.trim());
  return lines;
}

async function addTextToImage(imageUrl: string, text: string): Promise<string> {
  if (!isStorageConfigured()) {
    throw new Error("Configure um armazenamento (Cloudinary, local ou MinIO) para salvar as imagens com texto.");
  }
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Não foi possível baixar a imagem: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  const inputBuffer = Buffer.from(arrayBuffer);

  const baseResized = await toInstagramFeedImage(inputBuffer);
  const actual = await sharp(baseResized).metadata();
  const width = actual.width ?? INSTAGRAM_MAX_SIDE;
  const height = actual.height ?? INSTAGRAM_MAX_SIDE;

  const lines = wrapText(text);
  const lineHeight = FONT_SIZE * 1.3;
  const totalTextHeight = lines.length * lineHeight;
  
  // Fundo em gradiente suave
  const gradientHeight = Math.max(400, totalTextHeight + 200);
  const gradY = height - gradientHeight;
  
  let svgLines = "";
  // Centraliza o bloco de texto verticalmente dentro do gradiente
  let startY = gradY + (gradientHeight - totalTextHeight) / 2 + (FONT_SIZE / 2);
  
  lines.forEach((line, index) => {
    const safeLine = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const y = startY + (index * lineHeight);
    svgLines += `<text x="${width / 2}" y="${y}" text-anchor="middle" dominant-baseline="central" style="font-family:${FONT_FAMILY};font-size:${FONT_SIZE}px;font-weight:bold;fill:#ffffff;filter:drop-shadow(0px 2px 8px rgba(0,0,0,0.9)); letter-spacing: 1px;">${safeLine}</text>\n`;
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bottomGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="transparent"/>
      <stop offset="40%" stop-color="rgba(0,0,0,0.6)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.95)"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${gradY}" width="${width}" height="${gradientHeight}" fill="url(#bottomGrad)"/>
  <rect x="${width / 2 - 40}" y="${startY - FONT_SIZE - 20}" width="80" height="6" fill="#6366f1" rx="3" />
  ${svgLines}
</svg>`;

  const overlayBuffer = Buffer.from(svg);
  const rasterized = await sharp(overlayBuffer)
    .resize(width, height)
    .toBuffer();

  const withOverlay = await sharp(baseResized)
    .composite([{ input: rasterized, top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer();

  return uploadMedia(withOverlay, "image/jpeg", ".jpg");
}

/**
 * Para cada URL de imagem, adiciona o texto correspondente usando template nativo premium.
 * Retorna array de novas URLs na mesma ordem.
 */
export async function adicionarTextoCarrossel(
  imageUrls: string[],
  texts: string[]
): Promise<string[]> {
  const results: string[] = [];
  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];
    const text = texts[i]?.trim() ?? "";
    if (!text) {
      results.push(url);
      continue;
    }
    const newUrl = await addTextToImage(url, text);
    results.push(newUrl);
  }
  return results;
}
