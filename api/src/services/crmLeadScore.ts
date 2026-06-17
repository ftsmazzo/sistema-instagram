import type { LeadActivitySnapshot } from "./crmInsights.js";

export type LeadScoreResult = {
  score: number;
  label: "quente" | "morno" | "frio";
  motivo: string;
};

function hoursSince(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((now - t) / (1000 * 60 * 60)));
}

/** Score 0–100 focado em probabilidade de conversão (não engajamento de post). */
export function computeLeadScore(row: LeadActivitySnapshot, now = Date.now()): LeadScoreResult {
  if (row.status === "convertido") {
    return { score: 100, label: "quente", motivo: "Cliente convertido." };
  }
  if (row.status === "perdido") {
    return { score: 0, label: "frio", motivo: "Lead marcado como perdido." };
  }

  let score = 15;
  const reasons: string[] = [];

  if (row.status === "handoff") {
    score += 35;
    reasons.push("handoff humano");
  } else if (row.status === "qualificado") {
    score += 28;
    reasons.push("qualificado pela IA");
  } else if (row.status === "em_conversa") {
    score += 18;
    reasons.push("em conversa ativa");
  }

  if (row.whatsapp) score += 8;
  if (row.has_whatsapp_msgs) {
    score += 7;
    reasons.push("WhatsApp ativo");
  } else if (row.has_direct) {
    score += 5;
    reasons.push("Direct");
  }

  if (row.visita_proxima) {
    score += 12;
    reasons.push("compromisso agendado");
  }

  const hIn = hoursSince(row.last_inbound_at, now);
  if (hIn !== null && hIn <= 12) {
    score += 22;
    reasons.push("respondeu nas últimas 12h");
  } else if (hIn !== null && hIn <= 48) {
    score += 12;
  } else if (hIn !== null && hIn >= 120) {
    score -= 18;
    reasons.push("sem resposta há 5+ dias");
  } else if (hIn !== null && hIn >= 72) {
    score -= 10;
    reasons.push("esfriando");
  }

  if (row.pending_wa_followup_at) score += 4;

  score = Math.min(100, Math.max(0, Math.round(score)));

  const label: LeadScoreResult["label"] =
    score >= 65 ? "quente" : score >= 35 ? "morno" : "frio";

  const motivo =
    reasons.length > 0
      ? reasons.slice(0, 3).join(" · ")
      : label === "quente"
        ? "Alto potencial de fechamento."
        : label === "morno"
          ? "Acompanhar com follow-up."
          : "Reengajar ou descartar.";

  return { score, label, motivo };
}
