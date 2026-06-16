/**
 * Pacotes de nicho do Postador 2.0 — templates visuais + regras de legenda.
 * Cada organização escolhe (ou herda do segmento) um nicho na UI.
 */

export type PostadorFormato = "feed" | "carrossel" | "reels" | "story";

export type PostadorTemplateId =
  | "autoridade_servico"
  | "oferta_ecommerce"
  | "transformacao_beleza"
  | "destaque_imovel"
  | "lancamento_produto";

export type PostadorNicheId =
  | "servicos_b2b"
  | "ecommerce"
  | "beleza_estetica"
  | "imobiliario"
  | "produtos_marcas";

export type PostadorIngredientes = {
  hook: string;
  corpo: string;
  cta_comentario: string;
  hashtags: string[];
  slides?: Array<{ titulo: string; corpo: string; visual_hint: string }>;
};

export type PostadorNichePack = {
  id: PostadorNicheId;
  label: string;
  descricao: string;
  /** Palavras-chave para auto-sugerir nicho a partir de organization.segmento */
  segmento_keywords: string[];
  tom_legenda: string;
  tom_visual: string;
  paleta_sugerida: string[];
  aspect_ratio_padrao: "4:5" | "9:16";
  templates: Array<{
    id: PostadorTemplateId;
    label: string;
    formato: PostadorFormato;
    slides: number;
    hook_exemplo: string;
    legenda_max_chars: number;
    hashtags_max: number;
    prompt_imagem_base: string;
    regras_legenda: string[];
  }>;
};

export const POSTADOR_NICHES: PostadorNichePack[] = [
  {
    id: "servicos_b2b",
    label: "Serviços & Consultoria",
    descricao: "Agências, automação, SaaS, consultoria — autoridade e leads qualificados.",
    segmento_keywords: [
      "consultoria",
      "agência",
      "automação",
      "automacao",
      "saas",
      "software",
      "marketing",
      "ia",
      "inteligência artificial",
      "b2b",
      "serviço",
      "servico",
    ],
    tom_legenda: "direto, especialista acessível, zero corporativês; 1 insight + 1 pergunta",
    tom_visual: "clean corporativo moderno, espaço para texto, ícones minimalistas",
    paleta_sugerida: ["#0f172a", "#3b82f6", "#f8fafc"],
    aspect_ratio_padrao: "4:5",
    templates: [
      {
        id: "autoridade_servico",
        label: "Autoridade (1 slide)",
        formato: "feed",
        slides: 1,
        hook_exemplo: "Seu time perde lead por demora no WhatsApp?",
        legenda_max_chars: 900,
        hashtags_max: 6,
        prompt_imagem_base:
          "Post Instagram 4:5, estilo editorial B2B, fundo escuro elegante, espaço superior para headline, ícone sutil de chat/automação, sem texto na imagem, alta nitidez",
        regras_legenda: [
          "Hook em 1 linha com dor ou curiosidade do ICP",
          "Corpo: 2-3 linhas com insight prático (não lista genérica)",
          "CTA: pergunta que convide comentário (ex.: 'Você já mediu isso?')",
          "Proibido: textão, jargão vazio ('soluções inovadoras')",
        ],
      },
      {
        id: "autoridade_servico",
        label: "Carrossel educativo (5 slides)",
        formato: "carrossel",
        slides: 5,
        hook_exemplo: "5 sinais de que seu atendimento no WhatsApp está vazando lead",
        legenda_max_chars: 700,
        hashtags_max: 5,
        prompt_imagem_base:
          "Slide carrossel Instagram 4:5, design system consistente, número do slide discreto, tipografia sans-serif moderna, fundo com gradiente sutil azul-marinho",
        regras_legenda: [
          "Legenda curta: reforce o hook + 'Salva pra revisar depois'",
          "Cada slide: 1 ideia, título forte + 1 frase",
          "Último slide: CTA comentário, não link na legenda",
        ],
      },
    ],
  },
  {
    id: "ecommerce",
    label: "E-commerce & Varejo",
    descricao: "Lojas online, ofertas, lançamentos, prova social e urgência saudável.",
    segmento_keywords: [
      "ecommerce",
      "e-commerce",
      "loja",
      "varejo",
      "shop",
      "marketplace",
      "moda",
      "produto",
    ],
    tom_legenda: "desejo + clareza; benefício antes de feature; urgência sem gritaria",
    tom_visual: "editorial lifestyle que evoca a categoria — texturas, luz, ambiente; foto real do produto vem do upload",
    paleta_sugerida: ["#ffffff", "#111827", "#ef4444"],
    aspect_ratio_padrao: "4:5",
    templates: [
      {
        id: "oferta_ecommerce",
        label: "Oferta relâmpago",
        formato: "feed",
        slides: 1,
        hook_exemplo: "Acabou de chegar — e só até domingo",
        legenda_max_chars: 850,
        hashtags_max: 8,
        prompt_imagem_base:
          "Foto produto e-commerce Instagram 4:5, fundo neutro ou lifestyle aspiracional, produto centralizado, sombra suave, estilo campanha D2C premium",
        regras_legenda: [
          "Linha 1: gancho de desejo ou escassez real",
          "2-3 bullets de benefício (não ficha técnica inteira)",
          "Preço/condição só se vier dos dados do produto",
          "CTA: 'Comenta QUERO que te mando o link'",
        ],
      },
      {
        id: "oferta_ecommerce",
        label: "Carrossel produto (4 slides)",
        formato: "carrossel",
        slides: 4,
        hook_exemplo: "Por que essa peça viralizou",
        legenda_max_chars: 750,
        hashtags_max: 7,
        prompt_imagem_base:
          "Carrossel produto 4:5, slide 1 hero shot, slides seguintes detalhe/textura/uso, paleta da marca",
        regras_legenda: [
          "Slide 1 = desejo; slides 2-3 = prova (detalhe, review, uso)",
          "Slide 4 = CTA comentário",
          "Hashtags: mix nicho + produto (máx. 7)",
        ],
      },
    ],
  },
  {
    id: "beleza_estetica",
    label: "Beleza & Estética",
    descricao: "Salões, clínicas, skincare, procedimentos — transformação e confiança.",
    segmento_keywords: [
      "beleza",
      "estética",
      "estetica",
      "salão",
      "salao",
      "clínica",
      "clinica",
      "skincare",
      "cabelo",
      "spa",
      "harmonização",
    ],
    tom_legenda: "acolhedor, aspiracional sem exagero; resultado real; empoderamento",
    tom_visual: "luz suave, pele natural, antes/depois sutil (sem choque), tons quentes",
    paleta_sugerida: ["#fdf2f8", "#9d174d", "#fce7f3"],
    aspect_ratio_padrao: "4:5",
    templates: [
      {
        id: "transformacao_beleza",
        label: "Transformação",
        formato: "carrossel",
        slides: 3,
        hook_exemplo: "O que mudou em 45 minutos",
        legenda_max_chars: 800,
        hashtags_max: 6,
        prompt_imagem_base:
          "Estética Instagram 4:5, ambiente clean spa, close natural, sem filtro exagerado, composição elegante feminina/masculina conforme briefing",
        regras_legenda: [
          "Hook: resultado emocional, não nome técnico do procedimento",
          "Corpo: o que a cliente sentiu + cuidado profissional",
          "Proibido: promessas médicas, 'milagre', antes/depois agressivo",
          "CTA: 'Qual sua maior dúvida sobre [tema]? Comenta'",
        ],
      },
      {
        id: "transformacao_beleza",
        label: "Reels dica rápida",
        formato: "reels",
        slides: 1,
        hook_exemplo: "Erro que resseca seu cabelo no inverno",
        legenda_max_chars: 600,
        hashtags_max: 5,
        prompt_imagem_base:
          "Frame vertical 9:16, profissional em ação, movimento suave, salão/clínica bem iluminado, estética Reels beauty 2026",
        regras_legenda: [
          "Legenda ultra curta (Reels): complementa o vídeo, não repete",
          "1 CTA comentário",
          "Tom de amiga especialista",
        ],
      },
    ],
  },
  {
    id: "imobiliario",
    label: "Imobiliário",
    descricao: "Corretores e imobiliárias — lifestyle, não ficha técnica fria.",
    segmento_keywords: [
      "imob",
      "imóvel",
      "imovel",
      "imobiliária",
      "imobiliaria",
      "corretor",
      "apartamento",
      "casa",
    ],
    tom_legenda: "lifestyle, sonho + praticidade; localização como experiência",
    tom_visual: "foto ampla, luz natural, sensação de morar (não planta fria)",
    paleta_sugerida: ["#1e3a5f", "#c9a227", "#f5f5f4"],
    aspect_ratio_padrao: "4:5",
    templates: [
      {
        id: "destaque_imovel",
        label: "Destaque imóvel",
        formato: "feed",
        slides: 1,
        hook_exemplo: "Acordar com essa vista todo dia",
        legenda_max_chars: 950,
        hashtags_max: 6,
        prompt_imagem_base:
          "Foto arquitetura Instagram 4:5, imóvel residencial premium, golden hour, sensação aspiracional, sem placa de venda na imagem",
        regras_legenda: [
          "Hook lifestyle (não 'Apartamento 3 quartos')",
          "Dados (m², bairro, valor) em 2-3 linhas objetivas",
          "CTA: 'Quer agendar visita? Comenta VISITA'",
          "Proibido: textão de ficha + 30 hashtags de bairro",
        ],
      },
      {
        id: "destaque_imovel",
        label: "Tour carrossel (6 fotos)",
        formato: "carrossel",
        slides: 6,
        hook_exemplo: "Tour em 6 fotos — você moraria aqui?",
        legenda_max_chars: 800,
        hashtags_max: 5,
        prompt_imagem_base:
          "Sequência carrossel imóvel: fachada, sala, cozinha, suíte, área externa, detalhe — coerência de luz e cor",
        regras_legenda: [
          "Legenda convida imaginar morar",
          "1 dado diferencial (ex.: varanda, suíte master)",
          "CTA visita nos comentários",
        ],
      },
    ],
  },
  {
    id: "produtos_marcas",
    label: "Produtos & Marcas (D2C)",
    descricao: "Marcas próprias, infoprodutos, lançamentos — storytelling + prova.",
    segmento_keywords: [
      "marca",
      "brand",
      "lançamento",
      "lancamento",
      "curso",
      "infoproduto",
      "digital",
      "fábrica",
      "fabrica",
      "startup",
    ],
    tom_legenda: "storytelling curto, propósito da marca, prova social leve",
    tom_visual: "bastidor, mood de marca, texturas e contexto de uso — produto físico real vem do upload",
    paleta_sugerida: ["#18181b", "#a855f7", "#fafafa"],
    aspect_ratio_padrao: "4:5",
    templates: [
      {
        id: "lancamento_produto",
        label: "Lançamento",
        formato: "feed",
        slides: 1,
        hook_exemplo: "Demorou 8 meses. Saiu hoje.",
        legenda_max_chars: 900,
        hashtags_max: 6,
        prompt_imagem_base:
          "Lançamento produto D2C 4:5, hero product shot, fundo dramático suave, estética campanha Apple/DTC moderna",
        regras_legenda: [
          "Hook: momento ou história (não 'estamos felizes em anunciar')",
          "1 benefício transformacional",
          "CTA comentário para interesse ('Comenta INFO')",
        ],
      },
      {
        id: "lancamento_produto",
        label: "Bastidor → produto (5 slides)",
        formato: "carrossel",
        slides: 5,
        hook_exemplo: "Do rascunho na mesa até na sua mão",
        legenda_max_chars: 750,
        hashtags_max: 6,
        prompt_imagem_base:
          "Carrossel bastidor marca: processo, equipe, detalhe, produto final, CTA visual — narrativa visual coesa",
        regras_legenda: [
          "Narrativa em arco: problema → processo → resultado",
          "Humanizar sem expor dados sensíveis",
          "Fechar com pergunta nos comentários",
        ],
      },
    ],
  },
];

/** Custo estimado por post (USD) — imagem + legenda, valores de referência jun/2026 */
export const POSTADOR_CUSTO_ESTIMADO_USD = {
  legenda_gpt41: 0.008,
  legenda_carrossel_5slides: 0.02,
  imagem_imagen4: 0.04,
  imagem_gpt_image_medium: 0.034,
  carrossel_5_imagens: 0.17,
  video_slideshow_8s: 0.02,
  video_veo_lite_8s: 0.4,
  video_veo_fast_8s: 1.2,
} as const;

export function suggestNicheFromSegmento(segmento: string): PostadorNicheId {
  const s = segmento.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  for (const pack of POSTADOR_NICHES) {
    if (pack.segmento_keywords.some((kw) => s.includes(kw.normalize("NFD").replace(/\p{M}/gu, "")))) {
      return pack.id;
    }
  }
  return "servicos_b2b";
}

export function getNichePack(id: PostadorNicheId): PostadorNichePack {
  return POSTADOR_NICHES.find((p) => p.id === id) ?? POSTADOR_NICHES[0];
}

export type PostadorTemplate = PostadorNichePack["templates"][number];

export type PostadorCaptionContext = {
  nicheId: PostadorNicheId;
  template: PostadorTemplate;
  marcaNome?: string;
  segmento?: string;
};

const VALID_NICHE_IDS = new Set<string>(POSTADOR_NICHES.map((p) => p.id));

export function parseNicheId(raw?: string | null): PostadorNicheId {
  const id = (raw ?? "").trim();
  if (VALID_NICHE_IDS.has(id)) return id as PostadorNicheId;
  return "servicos_b2b";
}

/** Chave estável: `{nicheId}:{index}` — ex.: `ecommerce:0` */
export function templateKey(nicheId: PostadorNicheId, index: number): string {
  return `${nicheId}:${index}`;
}

export function resolveTemplate(nicheId: PostadorNicheId, templateKeyRaw?: string | null): PostadorTemplate {
  const pack = getNichePack(nicheId);
  const key = (templateKeyRaw ?? "").trim();
  const match = key.match(/^[^:]+:(\d+)$/);
  if (match) {
    const idx = Number(match[1]);
    if (pack.templates[idx]) return pack.templates[idx];
  }
  return pack.templates[0];
}

export function resolveCaptionContext(args: {
  nicheId?: string | null;
  templateKey?: string | null;
  segmento?: string | null;
  marcaNome?: string | null;
}): PostadorCaptionContext {
  const suggested = args.segmento?.trim()
    ? suggestNicheFromSegmento(args.segmento)
    : "servicos_b2b";
  const nicheId = args.nicheId?.trim() ? parseNicheId(args.nicheId) : suggested;
  const template = resolveTemplate(nicheId, args.templateKey);
  return {
    nicheId,
    template,
    marcaNome: args.marcaNome?.trim() || undefined,
    segmento: args.segmento?.trim() || undefined,
  };
}

export function listNichesForApi(): Array<{
  id: PostadorNicheId;
  label: string;
  descricao: string;
  tom_legenda: string;
  tom_visual: string;
  templates: Array<PostadorTemplate & { key: string }>;
}> {
  return POSTADOR_NICHES.map((pack) => ({
    id: pack.id,
    label: pack.label,
    descricao: pack.descricao,
    tom_legenda: pack.tom_legenda,
    tom_visual: pack.tom_visual,
    templates: pack.templates.map((t, i) => ({
      ...t,
      key: templateKey(pack.id, i),
    })),
  }));
}

export function buildCaptionSystemPrompt(ctx: PostadorCaptionContext): string {
  const { template, nicheId } = ctx;
  const pack = getNichePack(nicheId);
  const marca = ctx.marcaNome ? `Marca: ${ctx.marcaNome}.` : "";
  const segmento = ctx.segmento ? `Segmento: ${ctx.segmento}.` : "";

  return `Você cria legendas curtas e modernas para Instagram (2026) — estilo social media profissional, NÃO textão de blog.

NICHO: ${pack.label}
TEMPLATE: ${template.label} (${template.formato}, ${template.slides} slide(s))
TOM: ${pack.tom_legenda}
${marca} ${segmento}

ESTRUTURA OBRIGATÓRIA:
1. HOOK — 1 linha que para o scroll (inspire-se em: "${template.hook_exemplo}")
2. CORPO — no máximo 2-3 linhas curtas com valor real (sem blocos enormes)
3. CTA — 1 frase convidando a COMENTAR no post (ex.: "Comenta X" — alimenta o agente de comentários)
4. HASHTAGS — no máximo ${template.hashtags_max}, relevantes, em 1 linha no final

REGRAS:
- Máximo ${template.legenda_max_chars} caracteres no total
- Use no máximo 2 emojis bem colocados (ou nenhum se o tom for mais sério)
- Parágrafos separados por \\n\\n
- PROIBIDO: "Como posso te ajudar?", tom de call center, neuromarketing genérico, listas longas
- PROIBIDO: inventar preços, datas ou promessas não mencionadas no briefing
${template.regras_legenda.map((r) => `- ${r}`).join("\n")}

Retorne SOMENTE a legenda final formatada, pronta para a Graph API do Instagram.`;
}

export function extractVisualBrief(userBrief: string, ctx: PostadorCaptionContext): string {
  const text = userBrief.trim();
  if (!text) return "Instagram post visual";

  const tituloMatch = text.match(/^Título:\s*(.+)$/im) ?? text.match(/^Title:\s*(.+)$/im);
  if (tituloMatch) {
    const name = tituloMatch[1].trim().slice(0, 120);
    if (ctx.nicheId === "ecommerce" || ctx.nicheId === "produtos_marcas" || ctx.nicheId === "beleza_estetica") {
      return `Produto "${name}" — foto hero de catálogo premium, embalagem centralizada, fundo neutro ou lifestyle aspiracional, luz de estúdio suave.`;
    }
    return name;
  }

  if (text.length > 220) {
    const firstLine = text.split(/\n/)[0]?.trim() ?? "";
    if (firstLine.length >= 12 && firstLine.length <= 160) return firstLine;
    const firstSentence = text.split(/[.!?]\s+/)[0]?.trim() ?? "";
    if (firstSentence.length >= 12 && firstSentence.length <= 180) return firstSentence;
    return text.slice(0, 160).trim() + "…";
  }

  return text;
}

export type PostadorImageMode = "criativo" | "produto";

export function isProductLedNiche(nicheId: PostadorNicheId): boolean {
  return nicheId === "ecommerce" || nicheId === "beleza_estetica" || nicheId === "produtos_marcas";
}

export function resolveImageMode(mode: string | undefined | null, nicheId: PostadorNicheId): PostadorImageMode {
  if (mode === "produto") return "produto";
  return "criativo";
}

const CREATIVE_IMAGE_BASE: Partial<Record<PostadorNicheId, string>> = {
  ecommerce:
    "Arte editorial Instagram 4:5, still life ou lifestyle aspiracional que EVOCA a categoria pelo sensorial (texturas, ingredientes abstratos, luz, ambiente) — nunca packshot, nunca embalagem, nunca tentar recriar o produto físico",
  beleza_estetica:
    "Beauty editorial 4:5, macro de textura (cabelo, pele, água, luz), mood spa ou glam — composição artística variada, sem frasco ou embalagem",
  produtos_marcas:
    "Campanha D2C editorial 4:5, mood de marca e contexto de uso real ou still life de ingredientes/texturas — produto real não aparece (virá do upload)",
};

const MOOD_KEYWORD_CUES: Array<{ pattern: RegExp; cue: string }> = [
  { pattern: /\b(honey|mel|mel\b|&honey)/i, cue: "gotas de mel dourado, luz âmbar quente, textura orgânica luxuosa" },
  { pattern: /\b(hair|cabelo|capilar|moist|hidrata|frizz|frizzy|strands)/i, cue: "cabelo sedoso com brilho, gotículas de água, movimento fluido, luz spa" },
  { pattern: /\b(skin|pele|skincare|facial|serum|creme|hyaluronic)/i, cue: "pele luminosa, névoa de água, luz matinal suave, minimalismo clean" },
  { pattern: /\b(japanese|jap[aã]o|jap[aã]nes)/i, cue: "estética japonesa minimalista, madeira clara, cerâmica, luz difusa zen" },
  { pattern: /\b(argan|oil|[óo]leo|keratin|silk|protein)/i, cue: "óleo dourado em movimento, reflexos sedosos, macro de textura líquida" },
  { pattern: /\b(spa|sal[aã]o|tratamento|treatment|ritual)/i, cue: "ambiente spa premium, vapor suave, toalhas brancas, luz acolhedora" },
  { pattern: /\b(mod[aã]|fashion|roupa|vestido|look)/i, cue: "editorial de moda, tecido em movimento, styling aspiracional, luz de estúdio fashion" },
  { pattern: /\b(cosm[eé]tico|makeup|maquiagem|beauty)/i, cue: "flat lay beauty artístico, pincéis e texturas, paleta harmoniosa, sem embalagens legíveis" },
  { pattern: /\b(unbox|lan[cç]amento|launch|d2c|marca)/i, cue: "bastidor de marca, mesa criativa, materiais premium, storytelling visual" },
];

function inferMoodCues(text: string): string[] {
  const cues: string[] = [];
  for (const { pattern, cue } of MOOD_KEYWORD_CUES) {
    if (pattern.test(text) && !cues.includes(cue)) cues.push(cue);
  }
  return cues.slice(0, 4);
}

/** Brief visual criativo: evoca o produto pelo mood, nunca recria embalagem. */
export function extractCreativeMoodBrief(userBrief: string, ctx: PostadorCaptionContext): string {
  const text = userBrief.trim();
  if (!text) {
    return "Cena editorial aspiracional alinhada ao nicho, composição artística variada, mood premium.";
  }

  const cues = inferMoodCues(text);
  const tituloMatch = text.match(/^Título:\s*(.+)$/im) ?? text.match(/^Title:\s*(.+)$/im);
  if (tituloMatch && cues.length === 0) {
    cues.push(...inferMoodCues(tituloMatch[1]));
  }

  const benefitMatch = text.match(/\b(dry|seco|damaged|danificado|frizz|dull|opaco|hydrat|hidrata|soft|sedoso|shine|brilho)\b/gi);
  if (benefitMatch) {
    const wantsHydration = benefitMatch.some((w) => /dry|seco|hydrat|hidrata|damaged|danificado/i.test(w));
    const wantsShine = benefitMatch.some((w) => /dull|opaco|shine|brilho|soft|sedoso/i.test(w));
    if (wantsHydration && !cues.some((c) => c.includes("água"))) {
      cues.push("sensação de hidratação profunda, gotas e vapor suave");
    }
    if (wantsShine && !cues.some((c) => c.includes("brilho") || c.includes("sedoso"))) {
      cues.push("brilho saudável, reflexos de luz em superfície sedosa");
    }
  }

  const moodPart =
    cues.length > 0
      ? `Elementos sensoriais: ${cues.join("; ")}.`
      : "Ambiente lifestyle premium que remete à categoria do briefing.";

  const variety = [
    "Varie a composição a cada geração (macro textura, still life de ingredientes, ambiente spa, ou detalhe artístico).",
    "PROIBIDO: embalagem, frasco, pote, caixa, rótulo legível, packshot, produto centralizado tentando copiar referência.",
    "A foto real do produto, se necessária, será enviada separadamente pelo usuário.",
  ].join(" ");

  return `${moodPart} ${variety}`;
}

export function buildImagePrompt(
  userBrief: string,
  ctx: PostadorCaptionContext,
  mode: PostadorImageMode = "criativo"
): string {
  const pack = getNichePack(ctx.nicheId);
  const paleta = pack.paleta_sugerida.join(", ");
  const useCreative = mode === "criativo";
  const imageBase =
    useCreative && CREATIVE_IMAGE_BASE[ctx.nicheId]
      ? CREATIVE_IMAGE_BASE[ctx.nicheId]!
      : ctx.template.prompt_imagem_base;
  const visualBrief = useCreative
    ? extractCreativeMoodBrief(userBrief, ctx)
    : extractVisualBrief(userBrief, ctx);

  const antiRepeat = useCreative
    ? "Evite composições genéricas repetidas (frasco no centro, fundo branco). Prefira arte editorial memorável."
    : "";

  return [
    imageBase,
    `Cena visual: ${visualBrief}`,
    `Estilo visual do nicho: ${pack.tom_visual}`,
    `Paleta sugerida: ${paleta}`,
    "Vertical 4:5 Instagram feed, editorial social media 2026",
    "Iluminação cinematográfica (golden hour, rim light ou soft studio), profundidade de campo, textura realista",
    "Composição com respiro visual no terço superior ou inferior para eventual overlay de texto",
    "Sem texto escrito na imagem, sem logos falsos, sem marcas d'água, sem rostos distorcidos",
    antiRepeat,
  ]
    .filter(Boolean)
    .join(". ");
}

export function buildImageEnrichSystemPrompt(
  ctx: PostadorCaptionContext,
  mode: PostadorImageMode = "criativo"
): string {
  const pack = getNichePack(ctx.nicheId);
  const paleta = pack.paleta_sugerida.join(", ");
  const creativeBlock =
    mode === "criativo"
      ? `
MODO CRIATIVO (obrigatório — o usuário NÃO quer recriar o produto):
- NÃO gere packshot, product photo, bottle, jar, tube, box, packaging, label, barcode, ou qualquer tentativa de reproduzir embalagem específica.
- Crie cena editorial/lifestyle que EVOCA a categoria: texturas, ingredientes como elementos artísticos (mel escorrendo, splash de água, macro de cabelo/pele), ambiente, luz, mood.
- Varie o conceito: macro, flat lay de ingredientes, ambiente spa/sala/banheiro, detalhe abstrato — evite sempre a mesma composição.
- Se o brief mencionar nome de produto, use só para inferir CATEGORIA e MOOD — nunca desenhe o produto.
- O usuário envia a foto real do produto separadamente quando precisar; sua imagem é o criativo de apoio.

PROIBIDO: "product on white background", "centered bottle", "e-commerce product shot", imagens repetitivas e sem alma.`
      : `
MODO PRODUTO (usuário pediu explicitamente):
- Pode incluir representação genérica de produto/embalagem, mas sem logos legíveis nem cópia fiel de marca específica.`;

  return `Você é diretor de arte para posts de Instagram (2026) — especialista em prompts para Imagen/DALL·E.

NICHO: ${pack.label}
TEMPLATE: ${ctx.template.label}
TOM VISUAL: ${pack.tom_visual}
PALETA: ${paleta}
${creativeBlock}

Transforme o brief em UM único prompt em INGLÊS (máx. 900 caracteres) para gerador de imagens.

IMPORTANTE: se o brief contiver descrição longa de marketing ou ficha técnica, IGNORE claims e extraia só mood, texturas, ambiente e sensação.

OBRIGATÓRIO no prompt:
- Sujeito/cena concreta e específica (não genérica)
- Ambiente detalhado (materiais, contexto, época do dia)
- Iluminação nomeada (ex.: golden hour, soft window light, neon accent, high-key studio)
- Ângulo de câmera e lente (ex.: 35mm, slight low angle, shallow depth of field)
- Color grading alinhado à paleta
- Mood emocional (aspiracional, urgente, acolhedor, premium)
- Espaço negativo no terço superior ou inferior para overlay futuro
- "no text, no logos, no watermark, photorealistic, ultra sharp"

PROIBIDO: prompt vago ("beautiful image", "professional photo"), listas com bullets, aspas, explicações.
Retorne SOMENTE o prompt em inglês, uma linha contínua.`;
}

export type PostadorOverlayStyle = {
  accentStart: string;
  accentMid: string;
  accentEnd: string;
  /** Cor do painel inferior (RGBA ou hex com opacidade via gradiente) */
  panelTone?: "light" | "dark";
};

const OVERLAY_BY_NICHE: Record<PostadorNicheId, PostadorOverlayStyle> = {
  servicos_b2b: { accentStart: "#60a5fa", accentMid: "#3b82f6", accentEnd: "#1d4ed8", panelTone: "dark" },
  ecommerce: { accentStart: "#fef3c7", accentMid: "#d4af37", accentEnd: "#b8860b", panelTone: "dark" },
  beleza_estetica: { accentStart: "#fce7f3", accentMid: "#f9a8d4", accentEnd: "#ec4899", panelTone: "dark" },
  imobiliario: { accentStart: "#cbd5e1", accentMid: "#94a3b8", accentEnd: "#475569", panelTone: "dark" },
  produtos_marcas: { accentStart: "#fef3c7", accentMid: "#c4b5fd", accentEnd: "#8b5cf6", panelTone: "dark" },
};

export function overlayStyleFromContext(ctx: PostadorCaptionContext): PostadorOverlayStyle {
  return OVERLAY_BY_NICHE[ctx.nicheId] ?? OVERLAY_BY_NICHE.servicos_b2b;
}

export function buildCtaOverlaySystemPrompt(ctx: PostadorCaptionContext): string {
  return `Copywriter para overlay curto em foto de Instagram (${getNichePack(ctx.nicheId).label}).
Crie UMA frase (4-7 palavras, máx. 45 caracteres) para destaque sobre a imagem.
Tom: ${getNichePack(ctx.nicheId).tom_legenda}
Inspire-se no hook do template: "${ctx.template.hook_exemplo}"
Sem hashtags, aspas ou emojis. Retorne só a frase.`;
}
