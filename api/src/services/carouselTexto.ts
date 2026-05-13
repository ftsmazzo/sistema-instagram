import sharp from "sharp";
import { uploadMedia, isStorageConfigured } from "./storage.js";
import { toInstagramFeedImage } from "./instagramImage.js";

const INSTAGRAM_MAX_SIDE = 1080;
const FONT_FAMILY = "'Inter', 'Helvetica Neue', 'Arial', sans-serif";

/**
 * Quebra o texto em linhas dinamicamente baseado no tamanho estimado dos caracteres
 */
function wrapText(text: string, width: number, fontSize: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";
  
  // Fator de largura médio de um caractere para fontes sans-serif
  const avgCharWidth = fontSize * 0.55; 
  const maxWidth = width * 0.85; // 85% da largura da imagem
  const maxCharsPerLine = Math.floor(maxWidth / avgCharWidth);

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

  // Ajuste dinâmico de fonte baseado no comprimento do texto
  let fontSize = 64;
  if (text.length > 100) fontSize = 56;
  if (text.length > 200) fontSize = 48;

  const lines = wrapText(text, width, fontSize);
  
  // Limite rígido para não extrapolar a tela (máximo 5 linhas)
  const displayLines = lines.slice(0, 5);
  if (lines.length > 5) {
    displayLines[4] = displayLines[4].replace(/\s+\S*$/, "...");
  }

  const lineHeight = fontSize * 1.35;
  const totalTextHeight = displayLines.length * lineHeight;
  
  // Calcula o painel de fundo (Glass/Gradient Box)
  const paddingY = 80;
  const panelHeight = totalTextHeight + paddingY * 2;
  const panelY = height - panelHeight;

  let svgLines = "";
  let startY = panelY + paddingY + (fontSize / 2);
  
  displayLines.forEach((line, index) => {
    const safeLine = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const y = startY + (index * lineHeight);
    svgLines += `<text x="${width / 2}" y="${y}" text-anchor="middle" dominant-baseline="central" style="font-family:${FONT_FAMILY};font-size:${fontSize}px;font-weight:700;fill:#ffffff;filter:drop-shadow(0px 4px 12px rgba(0,0,0,0.6)); letter-spacing:-0.5px;">${safeLine}</text>\n`;
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bottomGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(15,23,42,0)"/>
      <stop offset="30%" stop-color="rgba(15,23,42,0.7)"/>
      <stop offset="100%" stop-color="rgba(15,23,42,0.98)"/>
    </linearGradient>
  </defs>
  
  <!-- Gradiente inferior com blend mais profundo -->
  <rect x="0" y="${height - panelHeight - 150}" width="${width}" height="${panelHeight + 150}" fill="url(#bottomGrad)"/>
  
  <!-- Linha de destaque/Decoração superior do bloco de texto -->
  <rect x="${width / 2 - 60}" y="${panelY + 30}" width="120" height="6" fill="#4f46e5" rx="3" />
  
  ${svgLines}
</svg>`;

  const overlayBuffer = Buffer.from(svg);
  const rasterized = await sharp(overlayBuffer)
    .resize(width, height)
    .toBuffer();

  const withOverlay = await sharp(baseResized)
    .composite([{ input: rasterized, top: 0, left: 0 }])
    .jpeg({ quality: 95 })
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
