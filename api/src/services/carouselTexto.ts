import sharp from "sharp";
import { uploadMedia, isStorageConfigured } from "./storage.js";
import { toInstagramFeedImage } from "./instagramImage.js";
import type { PostadorOverlayStyle } from "./postadorNiches.js";
import {
  buildCarouselOverlaySvg,
  type CarouselTemplateOptions,
} from "./carouselTemplates.js";

const INSTAGRAM_MAX_SIDE = 1080;

const DEFAULT_OVERLAY: PostadorOverlayStyle = {
  accentStart: "#fef3c7",
  accentMid: "#d4af37",
  accentEnd: "#b8860b",
  panelTone: "dark",
};

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

  const svg = buildCarouselOverlaySvg(W, H, text, style, templateOpts ?? {});
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
  const slideTemplate = overlayOpts?.slideTemplate ?? "capa";
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
