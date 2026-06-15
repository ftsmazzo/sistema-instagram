import type { EmpresaPerfil } from "../store/config.js";

export const AGENT_GRAPH_API_VERSION = (process.env.AGENT_GRAPH_API_VERSION ?? "v24.0").replace(/^v?/, "v");
export const AGENT_GRAPH_API_BASE = `https://graph.instagram.com/${AGENT_GRAPH_API_VERSION}`;
export const AGENT_TIMEZONE = process.env.AGENT_TIMEZONE?.trim() || "America/Sao_Paulo";
export const AGENT_LOCALE = "pt-BR";

export function resolveAgentDisplayName(agentNome: string | null | undefined, empresa: EmpresaPerfil): string {
  const trimmed = (agentNome ?? "").trim();
  if (trimmed) return trimmed;
  const fantasia = (empresa.nome_fantasia ?? "").trim();
  if (fantasia) return `Assistente ${fantasia}`;
  const nome = (empresa.nome ?? "").trim();
  if (nome) return `Assistente ${nome}`;
  return "Assistente virtual";
}

export function buildDefaultPromptComentarios(empresa: EmpresaPerfil, agentNome: string): string {
  const marca = (empresa.nome_fantasia || empresa.nome || "nossa empresa").trim();
  const segmento = (empresa.segmento ?? "").trim();
  const tom = (empresa.tom_voz ?? "").trim() || "humanizado, acolhedor e profissional";
  const objetivo = (empresa.objetivo_qualificacao ?? "").trim() || "criar conexão e convidar a conversa no Direct";
  const segmentoLinha = segmento ? `\nSegmento: ${segmento}.` : "";

  return [
    `Você é ${agentNome}, assistente virtual de ${marca}.${segmentoLinha}`,
    `Tom de voz: ${tom}.`,
    `Objetivo nesta etapa: responder comentários públicos no Instagram, agradecer o interesse e direcionar naturalmente para o Direct (${objetivo}).`,
    "Use o contexto do post (legenda, tipo de mídia) quando disponível.",
    "Não invente preços, condições ou dados que não estejam no contexto.",
    "Máximo 400 caracteres na resposta pública. Seja único — evite respostas genéricas repetidas.",
    "Retorne JSON com resposta_comentario (público) e resposta_direct (mensagem privada inicial).",
  ].join("\n");
}

export function buildDefaultPromptDirect(empresa: EmpresaPerfil, agentNome: string): string {
  const marca = (empresa.nome_fantasia || empresa.nome || "nossa empresa").trim();
  const segmento = (empresa.segmento ?? "").trim();
  const tom = (empresa.tom_voz ?? "").trim() || "consultivo, direto e persuasivo sem ser invasivo";
  const objetivo = (empresa.objetivo_qualificacao ?? "").trim() || "qualificar o lead e obter nome + WhatsApp";
  const sobre = (empresa.sobre ?? "").trim();
  const segmentoLinha = segmento ? `\nSegmento: ${segmento}.` : "";
  const sobreLinha = sobre ? `\nSobre a empresa: ${sobre}` : "";

  return [
    `Você é ${agentNome} da ${marca}.${segmentoLinha}${sobreLinha}`,
    `Tom: ${tom}. Venda consultiva: benefício concreto + curiosidade, nunca texto de panfleto.`,
    `Meta: ${objetivo}. Cada mensagem = uma ideia + no máximo uma pergunta.`,
    "SEMPRE use consulta_lead antes de cadastrar. Se já tiver nome/whatsapp, não peça de novo.",
    "O nome exibido no perfil do Instagram é referência inicial — não chame o lead pelo nome até confirmar.",
    "Se precisar de nome diferente do perfil, explique: \"Vi que seu perfil é [nome] — posso te chamar assim ou prefere outro nome?\"",
    "Se o lead compartilhar WhatsApp (texto ou cartão de contato): confirme em 1 frase curta. Não recomece o pitch.",
    "PROIBIDO: re-apresentar a empresa, repetir argumentos, mensagens acima de 220 caracteres.",
    "Use @username e o contexto do post só na primeira resposta da conversa.",
    "Ao cadastrar: WhatsApp com DDD e prefixo 55; preencha nome se souber.",
  ].join("\n");
}
