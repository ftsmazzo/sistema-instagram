import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import {
  resolveCaptionContext,
  buildCaptionSystemPrompt,
  buildCtaOverlaySystemPrompt,
  buildImagePrompt,
  buildImageEnrichSystemPrompt,
  getNichePack,
  resolveImageMode,
  type PostadorCaptionContext,
  type PostadorImageMode,
} from "./postadorNiches.js";

// Chaves de API (obrigatórias conforme o provedor usado). Escolha de provedor/modelo vem do painel.
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
// Fallback só quando o painel não envia provider/model (ex.: chamada direta à API).
const DEFAULT_PROVIDER = (process.env.POSTADOR_IA_PROVIDER ?? "openai").toLowerCase() as "openai" | "claude";
const DEFAULT_MODEL_OPENAI = process.env.POSTADOR_IA_MODEL_OPENAI ?? "gpt-4.1";
const DEFAULT_MODEL_CLAUDE = process.env.POSTADOR_IA_MODEL_CLAUDE ?? "claude-sonnet-4-5-20250929";

export type Provider = "openai" | "claude";

function normalizeOpenAIModel(model?: string | null): string {
  const m = (model?.trim() || DEFAULT_MODEL_OPENAI).toLowerCase();
  if (m.startsWith("gpt-5")) return DEFAULT_MODEL_OPENAI;
  return model?.trim() || DEFAULT_MODEL_OPENAI;
}

function getOpenAI(): OpenAI {
  if (!OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY não configurada. Defina a variável de ambiente na API.");
  }
  return new OpenAI({ apiKey: OPENAI_API_KEY.trim() });
}

function getAnthropic(): Anthropic {
  if (!ANTHROPIC_API_KEY?.trim()) {
    throw new Error("ANTHROPIC_API_KEY não configurada. Defina a variável de ambiente na API para usar Claude.");
  }
  return new Anthropic({ apiKey: ANTHROPIC_API_KEY.trim() });
}

// Refazer: mantém tom curto e moderno do nicho quando informado.
function buildRefazerSystem(ctx?: PostadorCaptionContext): string {
  const base = `Você ajusta legendas curtas para Instagram (2026) — estilo social media, NÃO textão.

Regras: use \\n\\n entre parágrafos; no máximo 2 emojis; preserve tom natural; finalize com CTA que convide a comentar; hashtags no final (poucas); resultado limpo, sem aspas ou escapes. Retorne somente a nova legenda.`;
  if (!ctx) return base;
  const { template } = ctx;
  return `${base}

Limite: ${template.legenda_max_chars} caracteres. Máximo ${template.hashtags_max} hashtags.
Template: ${template.label}.`;
}

async function callOpenAI(system: string, user: string, model: string, maxTokens = 400): Promise<string> {
  const openai = getOpenAI();
  const res = await openai.chat.completions.create({
    model: normalizeOpenAIModel(model),
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: maxTokens,
  });
  const text = res.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("Resposta vazia da IA.");
  return text;
}

async function callClaude(system: string, user: string, model: string, maxTokens = 400): Promise<string> {
  const anthropic = getAnthropic();
  const res = await anthropic.messages.create({
    model: model || DEFAULT_MODEL_CLAUDE,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  const block = res.content.find((b) => b.type === "text");
  const text = block && "text" in block ? (block.text as string).trim() : "";
  if (!text) throw new Error("Resposta vazia da IA.");
  return text;
}

async function complete(
  system: string,
  user: string,
  provider?: Provider | null,
  model?: string | null
): Promise<string> {
  const p: Provider = provider === "claude" ? "claude" : "openai";
  const m = (model?.trim() || (p === "openai" ? DEFAULT_MODEL_OPENAI : DEFAULT_MODEL_CLAUDE)) as string;
  if (p === "claude") return callClaude(system, user, m, 400);
  return callOpenAI(system, user, m, 400);
}

async function completeLong(
  system: string,
  user: string,
  provider?: Provider | null,
  model?: string | null
): Promise<string> {
  const p: Provider = provider === "claude" ? "claude" : "openai";
  const m = (model?.trim() || (p === "openai" ? DEFAULT_MODEL_OPENAI : DEFAULT_MODEL_CLAUDE)) as string;
  // Usa max_tokens maior para respostas longas como jornada JSON
  if (p === "claude") {
    const anthropic = getAnthropic();
    const res = await anthropic.messages.create({
      model: m,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: user }],
    });
    const block = res.content.find((b) => b.type === "text");
    const text = block && "text" in block ? (block.text as string).trim() : "";
    if (!text) throw new Error("Resposta vazia da IA.");
    return text;
  }
  const openai = getOpenAI();
  const res = await openai.chat.completions.create({
    model: normalizeOpenAIModel(m),
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: 4096,
  });
  const text = res.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("Resposta vazia da IA.");
  return text;
}

export type GerarCaptionOptions = {
  provider?: Provider | null;
  model?: string | null;
  nicheId?: string | null;
  templateKey?: string | null;
  segmento?: string | null;
  marcaNome?: string | null;
  imageMode?: PostadorImageMode | null;
};

function captionContextFromOptions(options?: GerarCaptionOptions): PostadorCaptionContext {
  return resolveCaptionContext({
    nicheId: options?.nicheId,
    templateKey: options?.templateKey,
    segmento: options?.segmento,
    marcaNome: options?.marcaNome,
  });
}

/**
 * Gera caption para Instagram a partir da descrição do usuário.
 * provider e model vêm do painel (seletor); se não enviados, usa fallback das variáveis de ambiente.
 */
export async function gerarCaption(
  descricao: string,
  mediaType?: "IMAGE" | "REELS" | "CAROUSEL",
  options?: GerarCaptionOptions
): Promise<string> {
  const ctx = captionContextFromOptions(options);
  const system = buildCaptionSystemPrompt(ctx);
  const tipo =
    mediaType === "REELS" ? "Reels (vídeo)" : mediaType === "CAROUSEL" ? "carrossel com várias fotos" : "post de imagem";
  const user = `Briefing para o post (${tipo}):\n\n""" ${descricao} """\n\nGere UMA legenda final curta e moderna. Retorne só a legenda.`;
  return complete(system, user, options?.provider, options?.model);
}

/**
 * Refaz o caption com base no feedback do usuário.
 * provider e model vêm do painel (mesma escolha da geração).
 */
export async function refazerCaption(
  captionAtual: string,
  feedback: string,
  options?: GerarCaptionOptions
): Promise<string> {
  const ctx = captionContextFromOptions(options);
  const system = buildRefazerSystem(ctx);
  const user = `Legenda atual:\n\n${captionAtual}\n\nPedido do usuário: ${feedback}\n\nNova legenda (só o texto formatado):`;
  return complete(system, user, options?.provider, options?.model);
}

function buildJornadaSystem(ctx: PostadorCaptionContext): string {
  const { template } = ctx;
  return `Você é estrategista de conteúdo para Instagram (${ctx.nicheId}).
Crie uma JORNADA com EXATAMENTE 3 posts sequenciais sobre o mesmo assunto.

Cada legenda: hook + 2 linhas + CTA para comentar + até ${template.hashtags_max} hashtags.
Máximo ${template.legenda_max_chars} caracteres por legenda. Tom: ${getNichePack(ctx.nicheId).tom_legenda}

Posts:
1. Teaser/Atenção — dor ou diferencial
2. Detalhes/Desejo — benefícios concretos
3. Urgência/CTA — próximo passo

Saída: APENAS array JSON válido (sem markdown):
[
  { "post_number": 1, "estrategia": "...", "caption": "..." },
  { "post_number": 2, "estrategia": "...", "caption": "..." },
  { "post_number": 3, "estrategia": "...", "caption": "..." }
]`;
}

/**
 * Gera 3 captions em sequência (Jornada) a partir de dados de uma página de produto/serviço.
 */
export async function gerarJornadaPorLink(
  descricao: string,
  options?: GerarCaptionOptions
): Promise<Array<{ post_number: number; estrategia: string; caption: string }>> {
  const ctx = captionContextFromOptions(options);
  const system = buildJornadaSystem(ctx);
  const user = `Dados extraídos da página:\n\n""" ${descricao} """\n\nGere o ARRAY JSON estrito com as 3 legendas:`;
  const resText = await completeLong(system, user, options?.provider, options?.model);
  
  try {
    const match = resText.match(/\[\s*\{[\s\S]*\}\s*\]/);
    const raw = match ? match[0] : resText.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error("Resposta não é um array.");
    const posts = parsed
      .filter((p): p is { post_number: number; estrategia: string; caption: string } =>
        Boolean(p && typeof p === "object" && typeof (p as { caption?: string }).caption === "string")
      )
      .slice(0, 3);
    if (posts.length < 3) throw new Error(`Esperados 3 posts, recebidos ${posts.length}.`);
    return posts.map((p, i) => ({
      post_number: p.post_number ?? i + 1,
      estrategia: p.estrategia ?? `Post ${i + 1}`,
      caption: p.caption.trim(),
    }));
  } catch (err) {
    console.error("Erro ao fazer parse da Jornada JSON. Retorno da IA:", resText);
    const detail = err instanceof Error ? err.message : "";
    throw new Error(
      detail
        ? `A IA não retornou a jornada em JSON válido: ${detail}`
        : "A Inteligência Artificial não retornou o formato JSON corretamente."
    );
  }
}

/**
 * Gera um texto curto e criativo para sobrepor na imagem, baseado no post da jornada.
 * Cada chamada deve retornar uma frase diferente e impactante.
 */
export async function gerarCTAImagem(
  captionContext: string,
  options?: GerarCaptionOptions
): Promise<string> {
  const ctx = captionContextFromOptions(options);
  const system = buildCtaOverlaySystemPrompt(ctx);
  const user = `Legenda deste post:\n\n${captionContext}\n\nCrie uma frase impactante para sobrepor nesta foto:`;
  return complete(system, user, options?.provider, options?.model);
}

/**
 * Expande brief + nicho em prompt cinematográfico em inglês para Imagen/DALL·E.
 */
export async function enriquecerPromptImagem(
  userBrief: string,
  ctx: PostadorCaptionContext,
  options?: GerarCaptionOptions
): Promise<string> {
  const mode = resolveImageMode(options?.imageMode ?? null, ctx.nicheId);
  const base = buildImagePrompt(userBrief, ctx, mode);
  const system = buildImageEnrichSystemPrompt(ctx, mode);
  const user = `Brief estruturado:\n${base}\n\nPrompt cinematográfico em inglês:`;
  const enriched = await complete(system, user, options?.provider, options?.model ?? "gpt-4o-mini");
  return enriched.replace(/^["'`]|["'`]$/g, "").replace(/\s+/g, " ").trim().slice(0, 1200);
}
