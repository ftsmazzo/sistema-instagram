import OpenAI from "openai";
import type { TimelineItem } from "../store/crmOperacao.js";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CRM_IA_MODEL = (process.env.CRM_IA_MODEL ?? "gpt-4o-mini").trim();

export type LeadCoachInput = {
  empresa: {
    nome_fantasia: string;
    segmento: string;
    objetivo_qualificacao: string;
    criterios_qualificacao: string;
    tom_voz: string;
    link_produto_servico: string;
  };
  lead: {
    nome: string | null;
    username_instagram: string | null;
    status: string;
    objetivo: string | null;
    origem_interacao: string | null;
    handoff_motivo: string | null;
    url_interesse: string | null;
  };
  timeline: TimelineItem[];
  rule_hint?: string | null;
};

export type LeadCoachResult = {
  resumo: string;
  temperatura: "quente" | "morno" | "frio";
  proxima_acao: string;
  mensagem_sugerida: string;
  risco_perda: "baixo" | "medio" | "alto";
  oportunidade: string;
};

function getOpenAI(): OpenAI {
  if (!OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY não configurada. Necessária para sugestões de follow-up com IA.");
  }
  return new OpenAI({ apiKey: OPENAI_API_KEY.trim() });
}

function formatTimeline(timeline: TimelineItem[]): string {
  if (timeline.length === 0) return "(sem mensagens registradas)";
  const recent = timeline.slice(-24);
  return recent
    .map((m) => {
      const who = m.direction === "inbound" ? "LEAD" : "BOT/EMPRESA";
      const canal = m.canal.toUpperCase();
      const when = new Date(m.at).toLocaleString("pt-BR");
      const text = m.text.slice(0, 500);
      return `[${when}] ${canal} ${who}: ${text}`;
    })
    .join("\n");
}

function parseCoachJson(raw: string): LeadCoachResult {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : trimmed;
  const parsed = JSON.parse(jsonStr) as Partial<LeadCoachResult>;

  const temp = parsed.temperatura;
  const risco = parsed.risco_perda;

  return {
    resumo: String(parsed.resumo ?? "").trim() || "Lead em acompanhamento.",
    temperatura: temp === "quente" || temp === "morno" || temp === "frio" ? temp : "morno",
    proxima_acao: String(parsed.proxima_acao ?? "").trim() || "Retomar contato no canal mais quente.",
    mensagem_sugerida: String(parsed.mensagem_sugerida ?? "").trim(),
    risco_perda: risco === "baixo" || risco === "medio" || risco === "alto" ? risco : "medio",
    oportunidade: String(parsed.oportunidade ?? "").trim(),
  };
}

export function isCrmAiConfigured(): boolean {
  return Boolean(OPENAI_API_KEY?.trim());
}

/** Sugestão de follow-up focada em conversão (não conteúdo/postagem). */
export async function generateLeadCoach(input: LeadCoachInput): Promise<LeadCoachResult> {
  const openai = getOpenAI();
  const empresaNome = input.empresa.nome_fantasia || "a empresa";
  const leadNome = input.lead.nome || input.lead.username_instagram || "lead";

  const system = `Você é consultor de vendas B2C/B2B especializado em converter leads de Instagram e WhatsApp em clientes.
Foco: fechar venda, agendar compromisso ou handoff humano — NUNCA sugerir postar conteúdo ou crescer seguidores.
Responda SOMENTE com JSON válido (sem markdown), neste formato:
{
  "resumo": "2 frases sobre onde o lead está no funil",
  "temperatura": "quente|morno|frio",
  "proxima_acao": "ação concreta para o consultor humano fazer agora",
  "mensagem_sugerida": "texto pronto para WhatsApp ou Direct, tom ${input.empresa.tom_voz || "profissional e humano"}, máx 400 caracteres",
  "risco_perda": "baixo|medio|alto",
  "oportunidade": "1 frase sobre o ganho se agir rápido"
}`;

  const user = `Empresa: ${empresaNome} (${input.empresa.segmento || "segmento não informado"})
Objetivo de qualificação: ${input.empresa.objetivo_qualificacao || "—"}
Critérios: ${input.empresa.criterios_qualificacao || "—"}
Link produto/serviço: ${input.empresa.link_produto_servico || "—"}

Lead: ${leadNome}
Instagram: ${input.lead.username_instagram ? `@${input.lead.username_instagram}` : "—"}
Status CRM: ${input.lead.status}
Objetivo detectado: ${input.lead.objetivo || "—"}
Origem: ${input.lead.origem_interacao || "—"}
URL interesse: ${input.lead.url_interesse || "—"}
Motivo handoff: ${input.lead.handoff_motivo || "—"}
${input.rule_hint ? `Alerta operacional: ${input.rule_hint}` : ""}

Histórico recente:
${formatTimeline(input.timeline)}`;

  const res = await openai.chat.completions.create({
    model: CRM_IA_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: 600,
    response_format: { type: "json_object" },
  });

  const text = res.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("IA retornou resposta vazia.");
  return parseCoachJson(text);
}
