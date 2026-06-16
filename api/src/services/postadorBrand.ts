import type { PostadorOverlayStyle } from "./postadorNiches.js";

export type PostadorBrandKit = {
  /** Cor primária (hex) */
  cor_primaria: string;
  /** Cor secundária (hex) */
  cor_secundaria: string;
  /** Cor de destaque / accent (hex) */
  cor_destaque: string;
  /** URL pública do logo (PNG/SVG com fundo transparente ideal) */
  logo_url?: string;
  /** Sobrepõe logo discreto nos criativos */
  usar_logo_em_posts?: boolean;
};

export const DEFAULT_BRAND_KIT: PostadorBrandKit = {
  cor_primaria: "#111827",
  cor_secundaria: "#6b7280",
  cor_destaque: "#d4af37",
  logo_url: "",
  usar_logo_em_posts: false,
};

const HEX = /^#[0-9a-fA-F]{6}$/;

function normHex(raw: unknown, fallback: string): string {
  const s = String(raw ?? "").trim();
  if (HEX.test(s)) return s.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s.toLowerCase()}`;
  return fallback;
}

export function parsePostadorBrandKit(raw: unknown): PostadorBrandKit | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const prim = normHex(o.cor_primaria ?? o.primary, DEFAULT_BRAND_KIT.cor_primaria);
  const sec = normHex(o.cor_secundaria ?? o.secondary, DEFAULT_BRAND_KIT.cor_secundaria);
  const acc = normHex(o.cor_destaque ?? o.accent, DEFAULT_BRAND_KIT.cor_destaque);
  const logo = String(o.logo_url ?? "").trim();
  const usar = o.usar_logo_em_posts === true;
  const hasCustom = prim !== DEFAULT_BRAND_KIT.cor_primaria || sec !== DEFAULT_BRAND_KIT.cor_secundaria || logo;
  if (!hasCustom && !usar) return null;
  return {
    cor_primaria: prim,
    cor_secundaria: sec,
    cor_destaque: acc,
    logo_url: logo || undefined,
    usar_logo_em_posts: usar,
  };
}

export function brandKitToOverlayStyle(brand: PostadorBrandKit): PostadorOverlayStyle {
  return {
    accentStart: brand.cor_secundaria,
    accentMid: brand.cor_destaque,
    accentEnd: brand.cor_primaria,
    panelTone: "dark",
  };
}

export function brandPaletaString(brand: PostadorBrandKit): string {
  return [brand.cor_primaria, brand.cor_secundaria, brand.cor_destaque].join(", ");
}

export function mergeBrandIntoContextPaleta(paletaNicho: string[], brand?: PostadorBrandKit | null): string {
  if (!brand) return paletaNicho.join(", ");
  return brandPaletaString(brand);
}
