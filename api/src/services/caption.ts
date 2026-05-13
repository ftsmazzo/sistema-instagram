import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

// Chaves de API (obrigatórias conforme o provedor usado). Escolha de provedor/modelo vem do painel.
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
// Fallback só quando o painel não envia provider/model (ex.: chamada direta à API).
const DEFAULT_PROVIDER = (process.env.POSTADOR_IA_PROVIDER ?? "openai").toLowerCase() as "openai" | "claude";
const DEFAULT_MODEL_OPENAI = process.env.POSTADOR_IA_MODEL_OPENAI ?? "gpt-4.1";
const DEFAULT_MODEL_CLAUDE = process.env.POSTADOR_IA_MODEL_CLAUDE ?? "claude-sonnet-4-5-20250929";

export type Provider = "openai" | "claude";

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

// Prompt adaptado do seu agente (Postador n8n): estrutura, workflow e regras, sem perder potência.
// Saída: uma única legenda formatada (pronta para Graph API), com hashtags no final.
const SYSTEM_GERAR = `Você é um especialista em criação de conteúdo para Instagram com a seguinte configuração:

<role>Especialista em Criação de Conteúdo para Instagram</role>
<expertise>Criação de posts altamente engajadores para o feed do Instagram, utilizando técnicas de Neuromarketing, Storytelling, Copywriting emocional e SEO para redes sociais</expertise>
<tools>Copywriting persuasivo, estrutura narrativa fluida, uso estratégico de emojis e hashtags otimizadas</tools>

<workflow>
1. Analisar o conteúdo fornecido (texto-base ou tema) — captar a intenção emocional e temática.
2. Gerar um texto contínuo, engajador e emocionalmente conectado — despertar empatia e capturar a atenção nos primeiros segundos.
3. Apresentar mensagem central clara, com storytelling e copywriting — estabelecer conexão emocional e relevância com o público-alvo.
4. Incluir proposta de valor, reflexão, aprendizado ou informação relevante — estimular compartilhamento, comentários e retenção.
5. Finalizar com CTA que incentive especialmente a **comentar no post** — assim o agente de comentários pode entrar em ação (ex.: "Comente abaixo o que achou", "Deixe seu comentário", "Responda nos comentários").
6. Incluir até 10 hashtags relevantes e de alto alcance — ampliar visibilidade e alcance orgânico.
</workflow>

<regras>
- Adaptar o tom e estilo ao tipo de conteúdo recebido, mantendo sempre conexão emocional e valor para o público.
- Utilizar emojis estrategicamente para intensificar a emoção e facilitar a leitura — nunca excessivo, nunca ausente.
- Manter naturalidade textual, evitando divisões explícitas como "introdução", "desenvolvimento".
- Garantir texto visualmente escaneável, fluido e emocionalmente atrativo.
- Saída: UMA ÚNICA LEGENDA já formatada para Instagram (pronta para ser enviada como caption na Graph API).
- Use \\n\\n entre parágrafos para legibilidade no feed. Hashtags todas no final, em bloco compacto (uma linha ou bloco único), sem quebra entre cada uma.
- Nunca use aspas desnecessárias, barras de escape ou marcações. O resultado deve ser limpo e direto.
- Se o conteúdo contiver versículos bíblicos, reflexões, ideias motivacionais ou mensagens inspiradoras, valorize com boas pausas e espaçamento.
</regras>

<output>Retorne somente a legenda final formatada, com emojis equilibrados, parágrafos separados por \\n\\n, CTA que convide a comentar no post (para o agente atuar) e hashtags agrupadas no fim. Nada mais.</output>`;

// Refazer: regras do seu "Formatar texto" + aplicar feedback do usuário.
const SYSTEM_REFAZER = `Você é um especialista em escrita criativa para redes sociais, focado em formatação perfeita de legendas para Instagram, ideais para a Graph API.

Seu objetivo é ajustar a legenda conforme o pedido do usuário, mantendo estrutura visualmente bonita, legível e engajadora.

Regras: use \\n\\n entre parágrafos; distribua emojis de forma natural; preserve o tom emocional; valorize reflexões ou mensagens inspiradoras com boas pausas; finalize com CTA que convide a comentar no post (para o agente atuar); hashtags todas no final, em bloco compacto; resultado limpo, sem aspas ou escapes. Retorne somente a nova legenda formatada, nada mais.`;

async function callOpenAI(system: string, user: string, model: string): Promise<string> {
  const openai = getOpenAI();
  const res = await openai.chat.completions.create({
    model: model || DEFAULT_MODEL_OPENAI,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: 800,
  });
  const text = res.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("Resposta vazia da IA.");
  return text;
}

async function callClaude(system: string, user: string, model: string): Promise<string> {
  const anthropic = getAnthropic();
  const res = await anthropic.messages.create({
    model: model || DEFAULT_MODEL_CLAUDE,
    max_tokens: 800,
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
  if (p === "claude") return callClaude(system, user, m);
  return callOpenAI(system, user, m);
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
    model: m,
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
};

/**
 * Gera caption para Instagram a partir da descrição do usuário.
 * provider e model vêm do painel (seletor); se não enviados, usa fallback das variáveis de ambiente.
 */
export async function gerarCaption(
  descricao: string,
  mediaType?: "IMAGE" | "REELS" | "CAROUSEL",
  options?: GerarCaptionOptions
): Promise<string> {
  const tipo =
    mediaType === "REELS" ? "Reels (vídeo)" : mediaType === "CAROUSEL" ? "carrossel com várias fotos" : "post de imagem";
  const user = `Conteúdo de entrada para criação do post:\n\n""" ${descricao} """\n\nCom base nesse conteúdo, gere UMA legenda final para um ${tipo} no Instagram, já formatada (parágrafos com \\n\\n, emojis, CTA que convide a comentar, hashtags no final em bloco). Retorne só a legenda, nada mais.`;
  return complete(SYSTEM_GERAR, user, options?.provider, options?.model);
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
  const user = `Legenda atual:\n\n${captionAtual}\n\nPedido do usuário: ${feedback}\n\nNova legenda (só o texto formatado):`;
  return complete(SYSTEM_REFAZER, user, options?.provider, options?.model);
}

const SYSTEM_JORNADA = `Você é um estrategista de conteúdo para Instagram focado no setor imobiliário.
O usuário enviará os dados extraídos da página de um imóvel.
Sua tarefa é criar uma JORNADA DE CONTEÚDO com EXATAMENTE 3 posts distintos e sequenciais sobre esse mesmo imóvel para serem postados ao longo de uma semana.

<workflow>
1. Post 1: Teaser/Atenção - Focar na dor do cliente ou no maior diferencial do imóvel.
2. Post 2: Detalhes/Desejo - Explorar os ambientes, a qualidade de vida e a planta.
3. Post 3: Urgência/Call to Action - Convite para visita, preço (se houver) e gatilho de escassez.
</workflow>

<regras>
- Cada post deve ter sua própria legenda formatada perfeitamente para o Instagram (com emojis bem distribuídos e parágrafos separados por \\n\\n).
- Cada legenda DEVE finalizar com um Call to Action forte convidando para COMENTAR na foto.
- Inclua até 10 hashtags no final de cada legenda.
- A saída DEVE SER EXCLUSIVAMENTE UM ARRAY JSON válido (sem markdown de blocos de código tipo \`\`\`json). Não escreva NADA além do JSON.
</regras>

<formato_json>
[
  {
    "post_number": 1,
    "estrategia": "Teaser/Atenção",
    "caption": "texto da legenda 1 aqui..."
  },
  {
    "post_number": 2,
    "estrategia": "Detalhes/Desejo",
    "caption": "texto da legenda 2 aqui..."
  },
  {
    "post_number": 3,
    "estrategia": "Urgência/Call to Action",
    "caption": "texto da legenda 3 aqui..."
  }
]
</formato_json>`;

/**
 * Gera 3 captions em sequência (Jornada) para um imóvel a partir da URL.
 */
export async function gerarJornadaPorLink(
  descricao: string,
  options?: GerarCaptionOptions
): Promise<Array<{ post_number: number; estrategia: string; caption: string }>> {
  const user = `Dados extraídos do imóvel:\n\n""" ${descricao} """\n\nGere o ARRAY JSON estrito com as 3 legendas:`;
  const resText = await completeLong(SYSTEM_JORNADA, user, options?.provider, options?.model);
  
  try {
    const match = resText.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (match) {
      return JSON.parse(match[0]);
    }
    const limpo = resText.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(limpo);
  } catch (err) {
    console.error("Erro ao fazer parse da Jornada JSON. Retorno da IA:", resText);
    throw new Error("A Inteligência Artificial não retornou o formato JSON corretamente.");
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
  const exemplos = [
    "Seu próximo lar te espera",
    "Vista e se apaixone",
    "Localização privilegiada",
    "Realize o seu sonho",
    "Oportunidade única",
    "Agende sua visita",
    "Conforto e sofisticação",
    "Viva bem, viva aqui",
  ];
  const exemploStr = exemplos.map((e, i) => `${i + 1}. "${e}"`).join("\n");

  const system = `Você é um copywriter especialista em marketing imobiliário premium para Instagram.
Crie UMA frase curta (4 a 7 palavras, máximo 45 caracteres) para ser escrita em destaque SOBRE a foto do imóvel.

REGRAS OBRIGATÓRIAS:
- Frase única, não genérica
- Reflita o ângulo emocional desta imagem específica (qualidade de vida, sonho, exclusividade, localização)
- Nunca repita frases óbvias como "Casa dos sonhos", "Venha conferir" ou "Entre em contato"
- Sem hashtags, aspas, emojis ou pontuação excessiva
- Retorne APENAS a frase, nada mais

Exemplos de bom nível (use como inspiração, não copie):
${exemploStr}`;

  const user = `Legenda deste post:\n\n${captionContext}\n\nCrie uma frase impactante e diferente das anteriores para sobrepor nesta foto:`;
  return complete(system, user, options?.provider, options?.model);
}
