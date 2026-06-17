import { gerarImagemComIA, type ImageGenProvider } from "./imageGen.js";
import { adicionarTextoCarrossel } from "./carouselTexto.js";
import { enriquecerPromptImagem, gerarIngredientesCarrossel, type GerarCaptionOptions } from "./caption.js";
import type { PostadorBrandKit } from "./postadorBrand.js";
import type { PostadorSlideTemplate } from "./carouselTemplates.js";
import {
  resolveCaptionContext,
  buildCarouselSlideBrief,
  montarCaptionDeIngredientes,
  overlayStyleFromContext,
  POSTADOR_CUSTO_ESTIMADO_USD,
  type PostadorIngredientes,
} from "./postadorNiches.js";

export type GerarCarrosselResult = {
  media_type: "CAROUSEL";
  media_urls: string[];
  slide_texts: string[];
  caption: string;
  ingredientes: PostadorIngredientes;
  overlay_applied: boolean;
  slides_count: number;
  custo_estimado_usd: number;
};

function custoPorSlide(provider: ImageGenProvider): number {
  return provider === "gemini"
    ? POSTADOR_CUSTO_ESTIMADO_USD.imagem_imagen4
    : POSTADOR_CUSTO_ESTIMADO_USD.imagem_gpt_image_medium;
}

/**
 * Fase 2/3 — ingredientes → N imagens criativas → template visual + brand kit → legenda.
 */
export async function gerarCarrosselCompleto(args: {
  brief: string;
  provider?: ImageGenProvider;
  aplicarMoldura?: boolean;
  slides_count?: number;
  slide_template?: PostadorSlideTemplate;
  brandKit?: PostadorBrandKit | null;
  options?: GerarCaptionOptions;
}): Promise<GerarCarrosselResult> {
  const brief = args.brief.trim();
  if (!brief) throw new Error("Brief vazio — informe a descrição do post.");

  const provider: ImageGenProvider = args.provider === "openai" ? "openai" : "gemini";
  const aplicarMoldura = args.aplicarMoldura === true;
  const slideTemplate = args.slide_template ?? "capa";
  const ctx = resolveCaptionContext({
    nicheId: args.options?.nicheId,
    templateKey: args.options?.templateKey,
    segmento: args.options?.segmento,
    marcaNome: args.options?.marcaNome,
    brandKit: args.brandKit ?? args.options?.brandKit ?? undefined,
  });

  const requested =
    args.slides_count != null && args.slides_count >= 2
      ? Math.min(10, Math.max(2, Math.round(args.slides_count)))
      : null;
  let targetSlides: number;
  if (requested != null) {
    targetSlides = requested;
  } else if (ctx.template.formato === "carrossel" && ctx.template.slides >= 2) {
    targetSlides = ctx.template.slides;
  } else {
    throw new Error("Informe quantos slides (2–10) ou escolha um template de carrossel no nicho.");
  }

  const effectiveCtx = {
    ...ctx,
    template: { ...ctx.template, formato: "carrossel" as const, slides: targetSlides },
  };

  const ingredientes = await gerarIngredientesCarrossel(brief, {
    ...args.options,
    brandKit: effectiveCtx.brandKit,
    slidesCount: targetSlides,
  });
  const slides = ingredientes.slides ?? [];
  if (slides.length < 2) {
    throw new Error("A IA não retornou slides suficientes para o carrossel.");
  }

  const total = Math.min(slides.length, targetSlides);
  const slidePlan = slides.slice(0, total);
  const slideTexts = slidePlan.map((s) => s.titulo.trim());
  const imageUrls: string[] = [];

  for (let i = 0; i < slidePlan.length; i++) {
    const slideBrief = buildCarouselSlideBrief(slidePlan[i], i, total, effectiveCtx);
    let imgPrompt = slideBrief;
    try {
      imgPrompt = await enriquecerPromptImagem(slideBrief, effectiveCtx, args.options);
    } catch {
      /* fallback */
    }
    const url = await gerarImagemComIA(imgPrompt, provider);
    imageUrls.push(url);
  }

  let finalUrls = imageUrls;
  let overlayApplied = false;
  if (aplicarMoldura && slideTexts.some((t) => t.length > 0)) {
    const style = overlayStyleFromContext(effectiveCtx);
    const logoUrl =
      effectiveCtx.brandKit?.usar_logo_em_posts && effectiveCtx.brandKit.logo_url
        ? effectiveCtx.brandKit.logo_url
        : undefined;
    finalUrls = await adicionarTextoCarrossel(imageUrls, slideTexts, style, {
      slideTemplate,
      logoUrl,
    });
    overlayApplied = true;
  }

  const caption = montarCaptionDeIngredientes(ingredientes, effectiveCtx);
  const custo =
    slidePlan.length * custoPorSlide(provider) +
    POSTADOR_CUSTO_ESTIMADO_USD.legenda_gpt41 +
    POSTADOR_CUSTO_ESTIMADO_USD.legenda_carrossel_5slides * 0.5;

  return {
    media_type: "CAROUSEL",
    media_urls: finalUrls,
    slide_texts: slideTexts,
    caption,
    ingredientes,
    overlay_applied: overlayApplied,
    slides_count: finalUrls.length,
    custo_estimado_usd: Math.round(custo * 100) / 100,
  };
}
