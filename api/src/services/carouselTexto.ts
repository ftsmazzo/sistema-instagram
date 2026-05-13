import sharp from "sharp";
import { uploadMedia, isStorageConfigured } from "./storage.js";
import { toInstagramFeedImage } from "./instagramImage.js";

const INSTAGRAM_MAX_SIDE = 1080;

/**
 * Quebra o texto em linhas dinamicamente baseado no comprimento máximo estimado
 */
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length + 1 > maxChars) {
      if (current) lines.push(current.trim());
      current = word + " ";
    } else {
      current += word + " ";
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

function escapeXml(t: string): string {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Template premium para overlay de texto em imagens de imóveis.
 * Design ousado: faixa diagonal de cor sólida com logo accent + texto bold grande.
 */
async function addTextToImage(imageUrl: string, text: string): Promise<string> {
  if (!isStorageConfigured()) {
    throw new Error("Configure um armazenamento para salvar as imagens com texto.");
  }

  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Não foi possível baixar a imagem: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  const base = await toInstagramFeedImage(buf);
  const meta = await sharp(base).metadata();
  const W = meta.width ?? INSTAGRAM_MAX_SIDE;
  const H = meta.height ?? INSTAGRAM_MAX_SIDE;

  // ─── Tipografia dinâmica ───────────────────────────────────────────────────
  let fontSize = 50;
  const maxChars = text.length > 60 ? 24 : text.length > 30 ? 26 : 28;
  if (text.length > 50) fontSize = 43;
  if (text.length > 80) fontSize = 36;

  const lines = wrapText(text, maxChars).slice(0, 4);
  if (lines.length === 4 && wrapText(text, maxChars).length > 4)
    lines[3] = lines[3].replace(/\s+\S*$/, "…");

  const lineH = fontSize * 1.3;
  const textBlockH = lines.length * lineH;

  // ─── Dimensões do painel de fundo ─────────────────────────────────────────
  const panelH = textBlockH + 80;
  const panelY = H - panelH;

  // Accent bar (linha colorida no topo do painel)
  const accentH = 5;

  // ─── Geração de linhas SVG ────────────────────────────────────────────────
  const startY = panelY + 40 + fontSize * 0.5;
  const svgLines = lines
    .map((line, i) => {
      const safe = escapeXml(line);
      const y = startY + i * lineH;
      return [
        // Sombra do texto (duplica levemente deslocado)
        `<text x="${W / 2 + 3}" y="${y + 3}" text-anchor="middle" dominant-baseline="central"
          font-family="'Arial Black','Franklin Gothic Heavy','Impact',sans-serif"
          font-size="${fontSize}" font-weight="900" fill="rgba(0,0,0,0.55)"
          letter-spacing="-1">${safe}</text>`,
        // Texto principal em branco
        `<text x="${W / 2}" y="${y}" text-anchor="middle" dominant-baseline="central"
          font-family="'Arial Black','Franklin Gothic Heavy','Impact',sans-serif"
          font-size="${fontSize}" font-weight="900" fill="#FFFFFF"
          letter-spacing="-1">${safe}</text>`,
      ].join("\n");
    })
    .join("\n");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <!-- Gradiente do painel inferior: preto profundo com leve azul-violeta -->
    <linearGradient id="panelGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#0a0a14" stop-opacity="0"/>
      <stop offset="25%"  stop-color="#0d0d1f" stop-opacity="0.82"/>
      <stop offset="100%" stop-color="#050510" stop-opacity="0.97"/>
    </linearGradient>
    <!-- Brilho lateral esquerdo (accent) -->
    <linearGradient id="accentGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#7c3aed"/>
      <stop offset="50%"  stop-color="#4f46e5"/>
      <stop offset="100%" stop-color="#0ea5e9"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- Painel de fundo gradiente -->
  <rect x="0" y="${panelY - 60}" width="${W}" height="${panelH + 60}" fill="url(#panelGrad)"/>

  <!-- Linha accent vibrante (barra colorida) -->
  <rect x="0" y="${panelY}" width="${W}" height="${accentH}" fill="url(#accentGrad)"/>

  <!-- Ponto de brilho no lado esquerdo da barra -->
  <circle cx="60" cy="${panelY + accentH / 2}" r="18" fill="rgba(124,58,237,0.30)" filter="url(#glow)"/>

  <!-- Decoração: pequeno traço vertical colorido antes do texto -->
  <rect x="${W / 2 - 130}" y="${startY - fontSize * 0.65}" width="4" height="${textBlockH}" fill="url(#accentGrad)" rx="2"/>

  <!-- Bloco de texto -->
  ${svgLines}
</svg>`;

  const overlay = Buffer.from(svg);
  const rasterized = await sharp(overlay).resize(W, H).toBuffer();

  const final = await sharp(base)
    .composite([{ input: rasterized, top: 0, left: 0 }])
    .jpeg({ quality: 95 })
    .toBuffer();

  return uploadMedia(final, "image/jpeg", ".jpg");
}

/**
 * Para cada URL de imagem, adiciona o texto correspondente usando template premium.
 * Imagens sem texto são retornadas sem modificação.
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
