import sharp from "sharp";
import { uploadMedia, isStorageConfigured } from "./storage.js";
import { toInstagramFeedImage } from "./instagramImage.js";
import type { PostadorOverlayStyle } from "./postadorNiches.js";
import {
  buildCarouselOverlaySvg,
  type CarouselTemplateOptions,
  type PostadorSlideTemplate,
} from "./carouselTemplates.js";

const INSTAGRAM_MAX_SIDE = 1080;

const DEFAULT_OVERLAY: PostadorOverlayStyle = {
  accentStart: "#fef3c7",
  accentMid: "#d4af37",
  accentEnd: "#b8860b",
  panelTone: "dark",
};

type LogoLayer = { buffer: Buffer; width: number; height: number };

async function fetchLogoLayer(logoUrl: string, W: number, H: number): Promise<LogoLayer | null> {
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const maxW = Math.round(W * 0.1);
    const maxH = Math.round(H * 0.07);
    const png = await sharp(buf).resize(maxW, maxH, { fit: "inside" }).png().toBuffer();
    const meta = await sharp(png).metadata();
    const width = meta.width ?? maxW;
    const height = meta.height ?? maxH;
    if (width < 1 || height < 1) return null;
    return { buffer: png, width, height };
  } catch {
    return null;
  }
}

/** Logo só em templates «capa» / «magazine» — não em foto pronta (limpo) nem minimal. */
function shouldApplyLogo(tpl: PostadorSlideTemplate | undefined, logoUrl?: string): boolean {
  if (!logoUrl?.trim()) return false;
  return tpl === "capa" || tpl === "magazine";
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

  const tpl = templateOpts?.template ?? "limpo";
  const svg = buildCarouselOverlaySvg(W, H, text, style, templateOpts ?? {});
  const overlay = Buffer.from(svg);
  const rasterized = await sharp(overlay).resize(W, H).toBuffer();

  const composites: sharp.OverlayOptions[] = [{ input: rasterized, top: 0, left: 0 }];
  const logoUrl = templateOpts?.logoUrl?.trim();
  if (shouldApplyLogo(tpl, logoUrl)) {
    const logo = await fetchLogoLayer(logoUrl!, W, H);
    if (logo) {
      const pad = Math.round(W * 0.04);
      const left = Math.max(pad, W - logo.width - pad);
      const top = pad;
      composites.push({ input: logo.buffer, top, left });
    }
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
  const slideTemplate = overlayOpts?.slideTemplate ?? "limpo";
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
