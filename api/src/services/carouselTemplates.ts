import type { PostadorOverlayStyle } from "./postadorNiches.js";

export type PostadorSlideTemplate =
  | "limpo"
  | "minimal"
  | "numerado"
  | "capa"
  | "editorial"
  | "magazine"
  | "bold"
  | "split"
  | "glass";

export type CarouselTemplateOptions = {
  template?: PostadorSlideTemplate;
  slideIndex?: number;
  totalSlides?: number;
  logoUrl?: string;
};

export type SlideTemplateInfo = {
  id: PostadorSlideTemplate;
  label: string;
  descricao: string;
  recomendado?: boolean;
};

export const SLIDE_TEMPLATES_CATALOG: SlideTemplateInfo[] = [
  { id: "limpo", label: "Limpo (foto pronta)", descricao: "Faixa mínima na base — sem logo, ideal para arte já montada", recomendado: true },
  { id: "minimal", label: "Minimal", descricao: "Gradiente suave + headline na base" },
  { id: "capa", label: "Capa premium", descricao: "Faixa superior + destaque — só para fundo simples" },
  { id: "numerado", label: "Numerado", descricao: "Badge 1/N + headline na base" },
  { id: "editorial", label: "Editorial", descricao: "Tipografia à esquerda, barra vertical — estilo revista" },
  { id: "magazine", label: "Magazine", descricao: "Faixa lateral colorida + badge — layout publicitário" },
  { id: "bold", label: "Bold block", descricao: "Bloco sólido de marca na base — alto contraste" },
  { id: "split", label: "Split", descricao: "Metade imagem / metade painel — estilo apresentação" },
  { id: "glass", label: "Glass card", descricao: "Card fosco flutuante — visual moderno tipo Canva" },
];

function escapeXml(t: string): string {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Limita headline para não estourar a moldura (max ~2 linhas curtas). */
export function sanitizeOverlayText(text: string, maxChars = 42): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) return cleaned;
  const cut = cleaned.slice(0, maxChars - 1).replace(/\s+\S*$/, "");
  return `${cut}…`;
}

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

export function capaFontSize(text: string, tpl: PostadorSlideTemplate, slideIndex: number): number {
  if (tpl === "capa" && slideIndex === 0) {
    if (text.length > 40) return 32;
    if (text.length > 28) return 36;
    return 40;
  }
  if (tpl === "bold" || tpl === "split") {
    if (text.length > 40) return 30;
    if (text.length > 28) return 34;
    return 38;
  }
  if (tpl === "editorial" || tpl === "magazine") {
    if (text.length > 40) return 28;
    if (text.length > 28) return 32;
    return 36;
  }
  if (tpl === "limpo") {
    if (text.length > 36) return 26;
    return 30;
  }
  return 0;
}

type TextLayout = {
  fontSize: number;
  lines: string[];
  anchor: "middle" | "start";
  x: number;
  startY: number;
  lineH: number;
  fill: string;
  shadow: string;
};

function resolveTextLayout(
  W: number,
  H: number,
  text: string,
  tpl: PostadorSlideTemplate,
  slideIndex: number,
  panelY: number,
  panelH: number
): TextLayout {
  const capaFs = capaFontSize(text, tpl, slideIndex);
  let fontSize = capaFs || 36;
  const maxChars =
    tpl === "editorial" || tpl === "magazine"
      ? text.length > 36
        ? 16
        : text.length > 22
          ? 18
          : 22
      : text.length > 36
        ? 18
        : text.length > 22
          ? 20
          : 24;

  if (!capaFs) {
    if (text.length > 36) fontSize = 32;
    if (text.length > 42) fontSize = 28;
  }

  const lines = wrapText(text, maxChars).slice(0, 2);
  if (lines.length === 2 && wrapText(text, maxChars).length > 2) {
    lines[1] = lines[1].replace(/\s+\S*$/, "…");
  }

  const lineH = fontSize * 1.28;
  const panelPad = capaFs ? 56 : tpl === "glass" ? 40 : 44;
  const textBlockH = lines.length * lineH;
  const startY = panelY + panelPad / 2 + fontSize * 0.55;

  if (tpl === "editorial" || tpl === "magazine") {
    return {
      fontSize,
      lines,
      anchor: "start",
      x: tpl === "magazine" ? W * 0.36 : 72,
      startY: panelY + (panelH - textBlockH) / 2 + fontSize * 0.55,
      lineH,
      fill: "#FFFFFF",
      shadow: "rgba(0,0,0,0.4)",
    };
  }

  if (tpl === "bold") {
    return {
      fontSize,
      lines,
      anchor: "middle",
      x: W / 2,
      startY: panelY + (panelH - textBlockH) / 2 + fontSize * 0.55,
      lineH,
      fill: "#FFFFFF",
      shadow: "rgba(0,0,0,0.25)",
    };
  }

  if (tpl === "limpo") {
    return {
      fontSize,
      lines,
      anchor: "start",
      x: Math.round(W * 0.05),
      startY: panelY + (panelH - textBlockH) / 2 + fontSize * 0.55,
      lineH,
      fill: "#FFFFFF",
      shadow: "rgba(0,0,0,0.35)",
    };
  }

  return {
    fontSize,
    lines,
    anchor: "middle",
    x: W / 2,
    startY,
    lineH,
    fill: "#FFFFFF",
    shadow: "rgba(0,0,0,0.35)",
  };
}

function buildBadge(W: number, style: PostadorOverlayStyle, tpl: PostadorSlideTemplate, idx: number, total: number): string {
  if (tpl !== "numerado" && tpl !== "capa" && tpl !== "magazine") return "";
  const badgeR = tpl === "capa" && idx === 1 ? 28 : tpl === "magazine" ? 24 : 22;
  const badgeCx = tpl === "magazine" ? Math.round(W * 0.16) : 56;
  const badgeCy = tpl === "magazine" ? Math.round(W * 0.16) : 56;
  return `
    <circle cx="${badgeCx}" cy="${badgeCy}" r="${badgeR + 4}" fill="rgba(0,0,0,0.35)"/>
    <circle cx="${badgeCx}" cy="${badgeCy}" r="${badgeR}" fill="${style.accentMid}"/>
    <text x="${badgeCx}" y="${badgeCy + 1}" text-anchor="middle" dominant-baseline="central"
      font-family="'Segoe UI',Arial,sans-serif" font-size="${tpl === "capa" && idx === 1 ? 22 : 18}"
      font-weight="700" fill="#FFFFFF">${idx}${total > 1 ? `<tspan font-size="12" dy="0">/${total}</tspan>` : ""}</text>`;
}

function buildPanelLayers(
  W: number,
  H: number,
  style: PostadorOverlayStyle,
  tpl: PostadorSlideTemplate,
  slideIndex: number
): { panelY: number; panelH: number; layers: string } {
  const idx = slideIndex + 1;

  if (tpl === "limpo") {
    const panelH = Math.round(H * 0.11);
    const panelY = H - panelH;
    return {
      panelY,
      panelH,
      layers: `<rect x="0" y="${panelY}" width="${W}" height="${panelH}" fill="rgba(0,0,0,0.58)"/>`,
    };
  }

  if (tpl === "split") {
    const splitY = Math.round(H * 0.72);
    const panelH = H - splitY;
    return {
      panelY: splitY,
      panelH,
      layers: `
        <rect x="0" y="${splitY}" width="${W}" height="${panelH}" fill="${style.accentEnd}" opacity="0.94"/>
        <rect x="0" y="${splitY}" width="${W}" height="4" fill="url(#accentGrad)"/>`,
    };
  }

  if (tpl === "bold") {
    const panelH = Math.round(H * 0.26);
    const panelY = H - panelH;
    return {
      panelY,
      panelH,
      layers: `
        <rect x="0" y="${panelY - 8}" width="${W}" height="${panelH + 8}" fill="${style.accentMid}" opacity="0.93"/>
        <rect x="${W * 0.1}" y="${panelY}" width="${W * 0.8}" height="3" fill="#FFFFFF" opacity="0.35" rx="1.5"/>`,
    };
  }

  if (tpl === "glass") {
    const panelH = Math.round(H * 0.22);
    const panelY = H - panelH - 48;
    const padX = Math.round(W * 0.06);
    return {
      panelY,
      panelH,
      layers: `
        <rect x="${padX}" y="${panelY - 12}" width="${W - padX * 2}" height="${panelH + 24}" rx="20"
          fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>
        <rect x="${padX + 24}" y="${panelY + panelH + 4}" width="${W * 0.2}" height="3" fill="url(#accentGrad)" rx="1.5"/>`,
    };
  }

  if (tpl === "magazine") {
    const sidebarW = Math.round(W * 0.28);
    const panelH = Math.round(H * 0.24);
    const panelY = H - panelH;
    return {
      panelY,
      panelH,
      layers: `
        <rect x="0" y="0" width="${sidebarW}" height="${H}" fill="url(#accentGrad)" opacity="0.88"/>
        <rect x="${sidebarW}" y="${panelY - 30}" width="${W - sidebarW}" height="${panelH + 30}" fill="url(#panelGrad)"/>
        <rect x="${sidebarW}" y="${panelY}" width="${W - sidebarW}" height="3" fill="${style.accentMid}"/>`,
    };
  }

  if (tpl === "editorial") {
    const panelH = Math.round(H * 0.26);
    const panelY = H - panelH;
    return {
      panelY,
      panelH,
      layers: `
        <rect x="0" y="0" width="6" height="${H}" fill="url(#accentGrad)"/>
        <rect x="0" y="${panelY - 50}" width="${W}" height="${panelH + 50}" fill="url(#panelGrad)"/>
        <rect x="24" y="${panelY + 8}" width="48" height="3" fill="${style.accentMid}"/>`,
    };
  }

  // minimal | numerado | capa
  const capaFs = tpl === "capa" && slideIndex === 0;
  const panelPad = capaFs ? 52 : 44;
  const panelH = Math.round(H * 0.18) + panelPad;
  const panelY = capaFs ? H - panelH - 24 : H - panelH;

  let extras = "";
  if (tpl === "capa" && idx === 1) {
    extras += `<rect x="0" y="0" width="${W}" height="${Math.round(H * 0.12)}" fill="url(#accentGrad)" opacity="0.85"/>`;
  }

  return {
    panelY,
    panelH,
    layers: `
      ${extras}
      <rect x="0" y="${panelY - 40}" width="${W}" height="${panelH + 40}" fill="url(#panelGrad)"/>
      <rect x="${W * 0.08}" y="${panelY}" width="${W * 0.84}" height="3" fill="url(#accentGrad)" rx="1.5"/>`,
  };
}

function buildTextSvg(layout: TextLayout): string {
  return layout.lines
    .map((line, i) => {
      const safe = escapeXml(line);
      const y = layout.startY + i * layout.lineH;
      const anchor = layout.anchor;
      return [
        `<text x="${layout.x + (anchor === "middle" ? 2 : 2)}" y="${y + 2}" text-anchor="${anchor}" dominant-baseline="central"
          font-family="'Segoe UI','Helvetica Neue',Arial,sans-serif"
          font-size="${layout.fontSize}" font-weight="700" fill="${layout.shadow}"
          letter-spacing="0.5">${safe}</text>`,
        `<text x="${layout.x}" y="${y}" text-anchor="${anchor}" dominant-baseline="central"
          font-family="'Segoe UI','Helvetica Neue',Arial,sans-serif"
          font-size="${layout.fontSize}" font-weight="700" fill="${layout.fill}"
          letter-spacing="0.5">${safe}</text>`,
      ].join("\n");
    })
    .join("\n");
}

/** Monta SVG completo do overlay (templates elaborados estilo Canva). */
export function buildCarouselOverlaySvg(
  W: number,
  H: number,
  text: string,
  style: PostadorOverlayStyle,
  opts: CarouselTemplateOptions
): string {
  const tpl = opts.template ?? "capa";
  const slideIndex = opts.slideIndex ?? 0;
  const total = opts.totalSlides ?? 1;
  const idx = slideIndex + 1;
  const safeText = sanitizeOverlayText(text);

  const { panelY, panelH, layers } = buildPanelLayers(W, H, style, tpl, slideIndex);
  const layout = resolveTextLayout(W, H, safeText, tpl, slideIndex, panelY, panelH);
  const badge = buildBadge(W, style, tpl, idx, total);
  const textSvg = buildTextSvg(layout);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
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
  ${badge}
  ${layers}
  ${textSvg}
</svg>`;
}

/** @deprecated use buildCarouselOverlaySvg */
export function buildCarouselTemplateExtras(
  W: number,
  H: number,
  style: PostadorOverlayStyle,
  opts: CarouselTemplateOptions
): string {
  return "";
}

export function parseSlideTemplateId(raw?: string): PostadorSlideTemplate {
  const valid: PostadorSlideTemplate[] = [
    "limpo",
    "minimal",
    "numerado",
    "capa",
    "editorial",
    "magazine",
    "bold",
    "split",
    "glass",
  ];
  if (raw && valid.includes(raw as PostadorSlideTemplate)) return raw as PostadorSlideTemplate;
  return "limpo";
}
