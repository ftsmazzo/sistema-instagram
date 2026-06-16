import sharp from "sharp";
import { uploadMedia, isStorageConfigured } from "./storage.js";
import { toInstagramFeedImage } from "./instagramImage.js";

const INSTAGRAM_MAX_SIDE = 1080;

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Não foi possível baixar a imagem: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Compõe foto real do produto sobre fundo criativo (IA ou upload).
 * Produto centralizado no terço inferior, com sombra suave.
 */
export async function compositarProdutoNoFundo(args: {
  background_url: string;
  product_url: string;
  logo_url?: string;
  product_scale?: number;
}): Promise<string> {
  if (!isStorageConfigured()) {
    throw new Error("Configure armazenamento para salvar a composição.");
  }

  const [bgRaw, productRaw] = await Promise.all([
    fetchImageBuffer(args.background_url),
    fetchImageBuffer(args.product_url),
  ]);

  const base = await toInstagramFeedImage(bgRaw);
  const meta = await sharp(base).metadata();
  const W = meta.width ?? INSTAGRAM_MAX_SIDE;
  const H = meta.height ?? INSTAGRAM_MAX_SIDE;

  const scale = Math.min(Math.max(args.product_scale ?? 0.52, 0.35), 0.7);
  const productW = Math.round(W * scale);
  const product = await sharp(productRaw)
    .resize(productW, undefined, { fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();
  const pMeta = await sharp(product).metadata();
  const pW = pMeta.width ?? productW;
  const pH = pMeta.height ?? productW;

  const left = Math.round((W - pW) / 2);
  const top = Math.round(H * 0.52 - pH / 2);

  const shadowSvg = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="${left + pW / 2}" cy="${top + pH + 8}" rx="${Math.round(pW * 0.38)}" ry="14" fill="rgba(0,0,0,0.28)"/>
    </svg>`
  );
  const shadow = await sharp(shadowSvg).png().toBuffer();

  const layers: sharp.OverlayOptions[] = [
    { input: shadow, top: 0, left: 0 },
    { input: product, top: Math.max(0, top), left: Math.max(0, left) },
  ];

  if (args.logo_url?.trim()) {
    try {
      const logoRaw = await fetchImageBuffer(args.logo_url.trim());
      const logoW = Math.round(W * 0.14);
      const logo = await sharp(logoRaw).resize(logoW, undefined, { fit: "inside" }).png().toBuffer();
      layers.push({ input: logo, top: Math.round(H * 0.04), left: Math.round(W * 0.04) });
    } catch {
      /* logo opcional */
    }
  }

  const final = await sharp(base).composite(layers).jpeg({ quality: 95 }).toBuffer();
  return uploadMedia(final, "image/jpeg", ".jpg");
}
