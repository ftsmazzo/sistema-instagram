import { gerarImagemComIA, type ImageGenProvider } from "./imageGen.js";
import { adicionarTextoCarrossel } from "./carouselTexto.js";
import { enriquecerPromptImagem, gerarIngredientesCarrossel, type GerarCaptionOptions } from "./caption.js";
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
 * Fase 2 — ingredientes → N imagens criativas → moldura opcional → legenda curta.
 */
export async function gerarCarrosselCompleto(args: {
  brief: string;
  provider?: ImageGenProvider;
  aplicarMoldura?: boolean;
  options?: GerarCaptionOptions;
}): Promise<GerarCarrosselResult> {
  const brief = args.brief.trim();
  if (!brief) throw new Error("Brief vazio — informe a descrição do post.");

  const provider: ImageGenProvider = args.provider === "openai" ? "openai" : "gemini";
  const aplicarMoldura = args.aplicarMoldura !== false;
  const ctx = resolveCaptionContext({
    nicheId: args.options?.nicheId,
    templateKey: args.options?.templateKey,
    segmento: args.options?.segmento,
    marcaNome: args.options?.marcaNome,
  });

  if (ctx.template.formato !== "carrossel" || ctx.template.slides < 2) {
    throw new Error("O template selecionado não é um carrossel multi-slide. Escolha um template de carrossel no passo Nicho.");
  }

  const ingredientes = await gerarIngredientesCarrossel(brief, args.options);
  const slides = ingredientes.slides ?? [];
  if (slides.length < 2) {
    throw new Error("A IA não retornou slides suficientes para o carrossel.");
  }

  const total = Math.min(slides.length, ctx.template.slides);
  const slidePlan = slides.slice(0, total);
  const slideTexts = slidePlan.map((s) => s.titulo.trim());
  const imageUrls: string[] = [];

  for (let i = 0; i < slidePlan.length; i++) {
    const slideBrief = buildCarouselSlideBrief(slidePlan[i], i, total, ctx);
    let imgPrompt = slideBrief;
    try {
      imgPrompt = await enriquecerPromptImagem(slideBrief, ctx, args.options);
    } catch {
      /* fallback brief estruturado */
    }
    const url = await gerarImagemComIA(imgPrompt, provider);
    imageUrls.push(url);
  }

  let finalUrls = imageUrls;
  let overlayApplied = false;
  if (aplicarMoldura && slideTexts.some((t) => t.length > 0)) {
    const style = overlayStyleFromContext(ctx);
    finalUrls = await adicionarTextoCarrossel(imageUrls, slideTexts, style);
    overlayApplied = true;
  }

  const caption = montarCaptionDeIngredientes(ingredientes, ctx);
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
