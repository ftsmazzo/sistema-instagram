import type { EmpresaPerfil } from "../store/config.js";
import { resolveAgentDisplayName } from "./agentConfigDefaults.js";

export const WHATSAPP_DEFAULT_OBJETIVOS = ["link_produto", "agendar_visita", "handoff_humano"] as const;
export type WhatsappObjetivo = (typeof WHATSAPP_DEFAULT_OBJETIVOS)[number];

export function buildDefaultPromptWhatsapp(empresa: EmpresaPerfil, agentNome: string): string {
  const marca = (empresa.nome_fantasia || empresa.nome || "nossa empresa").trim();
  const segmento = (empresa.segmento ?? "").trim();
  const tom = (empresa.tom_voz ?? "").trim() || "consultivo, humano e objetivo";
  const objetivo = (empresa.objetivo_qualificacao ?? "").trim() || "qualificar o lead e avançar para visita ou contato humano";
  const sobre = (empresa.sobre ?? "").trim();
  const segmentoLinha = segmento ? `\nSegmento: ${segmento}.` : "";
  const sobreLinha = sobre ? `\nSobre a empresa: ${sobre}` : "";

  return [
    `Você é ${agentNome} da ${marca}, continuando a conversa no WhatsApp após contato pelo Instagram.${segmentoLinha}${sobreLinha}`,
    `Tom: ${tom}. Mensagens curtas (máx. 400 caracteres), uma ideia por vez.`,
    `Meta: ${objetivo}.`,
    "CONTINUIDADE OBRIGATÓRIA: se houver histórico Instagram Direct abaixo, você JÁ conversou com este lead — continue de onde parou.",
    "NUNCA trate como primeiro contato, pitch frio ou descoberta do post se já houve troca no Direct.",
    "NUNCA re-apresente a empresa, repita argumentos ou pergunte WhatsApp de novo.",
    "Cumprimente de forma natural (ex.: retomar assunto da conversa anterior), não como vendedor genérico.",
    "Use nome, post de origem e histórico Instagram quando disponíveis.",
    "Ferramentas disponíveis conforme objetivos da organização:",
    "- link_produto: envie URL do imóvel/produto quando o lead pedir detalhes.",
    "- agendar_visita: colete dia/horário preferidos e registre a visita.",
    "- handoff_humano: quando o lead pedir humano ou estiver qualificado, encaminhe para atendente.",
    "Não invente preços ou condições. Se não souber, diga que um consultor confirma.",
    "Se o lead já veio do Instagram, não peça WhatsApp de novo.",
  ].join("\n");
}

export function resolveWhatsappAgentDisplayName(
  instanceAgentNome: string | null | undefined,
  empresa: EmpresaPerfil
): string {
  const trimmed = (instanceAgentNome ?? "").trim();
  if (trimmed) return trimmed;
  return resolveAgentDisplayName(null, empresa);
}
