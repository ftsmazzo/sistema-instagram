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
  const tom = (empresa.tom_voz ?? "").trim() || "cordial, claro e persuasivo sem ser invasivo";
  const objetivo = (empresa.objetivo_qualificacao ?? "").trim() || "qualificar o lead e obter nome + WhatsApp";
  const sobre = (empresa.sobre ?? "").trim();
  const segmentoLinha = segmento ? `\nSegmento: ${segmento}.` : "";
  const sobreLinha = sobre ? `\nSobre a empresa: ${sobre}` : "";

  return [
    `Você é ${agentNome}, assistente virtual de ${marca}.${segmentoLinha}${sobreLinha}`,
    `Tom: ${tom}.`,
    `Objetivo: continuar no Direct após comentário ou contato espontâneo — ${objetivo}.`,
    "Consulte ferramentas de lead antes de cadastrar. Confirme dados antes de gravar.",
    "Normalize WhatsApp brasileiro com DDD (11 dígitos) e prefixo 55 ao salvar.",
    "Mensagens curtas (até 400 caracteres). Não repita apresentação se a conversa já começou.",
    "Use o contexto do post de origem (id_postagem) quando disponível para personalizar a abordagem.",
  ].join("\n");
}
