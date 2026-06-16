import type { PostadorOverlayStyle } from "./postadorNiches.js";

export type PostadorSlideTemplate = "minimal" | "numerado" | "capa";

export type CarouselTemplateOptions = {
  template?: PostadorSlideTemplate;
  slideIndex?: number;
  totalSlides?: number;
  logoUrl?: string;
};

/** Extras SVG: badge numerado e faixa de capa no slide 1. */
export function buildCarouselTemplateExtras(
  W: number,
  H: number,
  style: PostadorOverlayStyle,
  opts: CarouselTemplateOptions
): string {
  const parts: string[] = [];
  const tpl = opts.template ?? "numerado";
  const idx = (opts.slideIndex ?? 0) + 1;
  const total = opts.totalSlides ?? 1;

  if (tpl === "numerado" || tpl === "capa") {
    const badgeR = tpl === "capa" && idx === 1 ? 28 : 22;
    const badgeCx = 56;
    const badgeCy = 56;
    parts.push(`
    <circle cx="${badgeCx}" cy="${badgeCy}" r="${badgeR + 4}" fill="rgba(0,0,0,0.35)"/>
    <circle cx="${badgeCx}" cy="${badgeCy}" r="${badgeR}" fill="${style.accentMid}"/>
    <text x="${badgeCx}" y="${badgeCy + 1}" text-anchor="middle" dominant-baseline="central"
      font-family="'Segoe UI',Arial,sans-serif" font-size="${tpl === "capa" && idx === 1 ? 22 : 18}"
      font-weight="700" fill="#FFFFFF">${idx}${total > 1 ? `<tspan font-size="12" dy="0">/${total}</tspan>` : ""}</text>
    `);
  }

  if (tpl === "capa" && idx === 1) {
    parts.push(`
    <rect x="0" y="0" width="${W}" height="${Math.round(H * 0.12)}" fill="url(#accentGrad)" opacity="0.85"/>
    `);
  }

  return parts.join("\n");
}

export function capaFontSize(text: string, tpl: PostadorSlideTemplate, slideIndex: number): number {
  if (tpl === "capa" && slideIndex === 0) {
    if (text.length > 50) return 40;
    if (text.length > 30) return 46;
    return 52;
  }
  return 0;
}
