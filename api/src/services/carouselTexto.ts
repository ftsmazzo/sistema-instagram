import sharp from "sharp";
import { uploadMedia, isStorageConfigured } from "./storage.js";
import { toInstagramFeedImage } from "./instagramImage.js";
import type { PostadorOverlayStyle } from "./postadorNiches.js";
import {
  buildCarouselTemplateExtras,
  capaFontSize,
  type CarouselTemplateOptions,
} from "./carouselTemplates.js";

const INSTAGRAM_MAX_SIDE = 1080;

const DEFAULT_OVERLAY: PostadorOverlayStyle = {
  accentStart: "#fef3c7",
  accentMid: "#d4af37",
  accentEnd: "#b8860b",
  panelTone: "dark",
};

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

async function fetchLogoLayer(logoUrl: string, W: number): Promise<Buffer | null> {
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const logoW = Math.round(W * 0.13);
    return sharp(buf).resize(logoW, undefined, { fit: "inside" }).png().toBuffer();
  } catch {
    return null;
  }
}

async function addTextToImage(
  imageUrl: string,
  text: string,
  style: PostadorOverlayStyle = DEFAULT_OVERLAY,
  templateOpts?: CarouselTemplateOptions
): Promise<string> {
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

  const tpl = templateOpts?.template ?? "minimal";
  const slideIdx = templateOpts?.slideIndex ?? 0;
  const capaFs = capaFontSize(text, tpl, slideIdx);

  let fontSize = capaFs || 48;
  const maxChars = text.length > 60 ? 22 : text.length > 30 ? 24 : 26;
  if (!capaFs) {
    if (text.length > 50) fontSize = 42;
    if (text.length > 80) fontSize = 34;
  }

  const lines = wrapText(text, maxChars).slice(0, 3);
  if (lines.length === 3 && wrapText(text, maxChars).length > 3) {
    lines[2] = lines[2].replace(/\s+\S*$/, "…");
  }

  const lineH = fontSize * 1.35;
  const panelPad = capaFs ? 72 : 56;
  const textBlockH = lines.length * lineH;
  const panelH = textBlockH + panelPad;
  const panelY = tpl === "capa" && slideIdx === 0 ? H - panelH - 24 : H - panelH;
  const accentH = 3;

  const startY = panelY + panelPad / 2 + fontSize * 0.55;
  const svgLines = lines
    .map((line, i) => {
      const safe = escapeXml(line);
      const y = startY + i * lineH;
      return [
        `<text x="${W / 2 + 2}" y="${y + 2}" text-anchor="middle" dominant-baseline="central"
          font-family="'Segoe UI','Helvetica Neue',Arial,sans-serif"
          font-size="${fontSize}" font-weight="700" fill="rgba(0,0,0,0.35)"
          letter-spacing="0.5">${safe}</text>`,
        `<text x="${W / 2}" y="${y}" text-anchor="middle" dominant-baseline="central"
          font-family="'Segoe UI','Helvetica Neue',Arial,sans-serif"
          font-size="${fontSize}" font-weight="700" fill="#FFFFFF"
          letter-spacing="0.5">${safe}</text>`,
      ].join("\n");
    })
    .join("\n");

  const templateExtras = templateOpts
    ? buildCarouselTemplateExtras(W, H, style, templateOpts)
    : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="panelGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#000000" stop-opacity="0"/>
      <stop offset="35%"  stop-color="#000000" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.82"/>
    </linearGradient>
    <linearGradient id="accentGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="${style.accentStart}"/>
      <stop offset="50%"  stop-color="${style.accentMid}"/>
      <stop offset="100%" stop-color="${style.accentEnd}"/>
    </linearGradient>
  </defs>

  ${templateExtras}
  <rect x="0" y="${panelY - 40}" width="${W}" height="${panelH + 40}" fill="url(#panelGrad)"/>
  <rect x="${W * 0.08}" y="${panelY}" width="${W * 0.84}" height="${accentH}" fill="url(#accentGrad)" rx="1.5"/>
  ${svgLines}
</svg>`;

  const overlay = Buffer.from(svg);
  const rasterized = await sharp(overlay).resize(W, H).toBuffer();

  const composites: sharp.OverlayOptions[] = [{ input: rasterized, top: 0, left: 0 }];
  const logoUrl = templateOpts?.logoUrl?.trim();
  if (logoUrl) {
    const logo = await fetchLogoLayer(logoUrl, W);
    if (logo) composites.push({ input: logo, top: Math.round(H * 0.035), left: W - Math.round(W * 0.17) });
  }

  const final = await sharp(base).composite(composites).jpeg({ quality: 95 }).toBuffer();
  return uploadMedia(final, "image/jpeg", ".jpg");
}

export type CarrosselOverlayOptions = {
  style?: PostadorOverlayStyle;
  slideTemplate?: CarouselTemplateOptions["template"];
  logoUrl?: string;
};

export async function adicionarTextoCarrossel(
  imageUrls: string[],
  texts: string[],
  style?: PostadorOverlayStyle,
  overlayOpts?: CarrosselOverlayOptions
): Promise<string[]> {
  const overlayStyle = style ?? DEFAULT_OVERLAY;
  const slideTemplate = overlayOpts?.slideTemplate ?? "numerado";
  const logoUrl = overlayOpts?.logoUrl;
  const results: string[] = [];
  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];
    const text = texts[i]?.trim() ?? "";
    if (!text) {
      results.push(url);
      continue;
    }
    const newUrl = await addTextToImage(url, text, overlayStyle, {
      template: slideTemplate,
      slideIndex: i,
      totalSlides: imageUrls.length,
      logoUrl,
    });
    results.push(newUrl);
  }
  return results;
}
