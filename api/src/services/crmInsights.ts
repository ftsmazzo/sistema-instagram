export type LeadActivitySnapshot = {
  id: number;
  nome: string | null;
  username_instagram: string | null;
  whatsapp: string | null;
  status: string;
  objetivo: string | null;
  handoff_at: string | null;
  handoff_motivo: string | null;
  whatsapp_boas_vindas_enviado: boolean;
  whatsapp_primeira_ia_enviada: boolean;
  whatsapp_ia_agendada_em: string | null;
  proximo_followup_em: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_any_at: string | null;
  has_direct: boolean;
  has_whatsapp_msgs: boolean;
  visita_proxima: string | null;
};

export type FollowUpPriority = "critical" | "high" | "medium" | "low";

export type FollowUpItem = {
  lead_id: number;
  nome: string | null;
  username_instagram: string | null;
  whatsapp: string | null;
  status: string;
  priority: FollowUpPriority;
  temperature: "quente" | "morno" | "frio";
  motivo: string;
  acao_sugerida: string;
  horas_parado: number | null;
  funil_etapa: string;
  visita_proxima: string | null;
};

const PRIORITY_RANK: Record<FollowUpPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function hoursSince(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((now - t) / (1000 * 60 * 60)));
}

export function computeTemperature(row: LeadActivitySnapshot, now = Date.now()): "quente" | "morno" | "frio" {
  if (row.status === "qualificado" || row.status === "handoff" || row.status === "em_conversa") {
    return "quente";
  }
  const h = hoursSince(row.last_inbound_at, now);
  if (h !== null && h <= 24) return "quente";
  if (h !== null && h <= 72) return "morno";
  return "frio";
}

export function computeFunilEtapa(row: LeadActivitySnapshot): string {
  if (row.status === "handoff") return "Handoff";
  if (row.status === "qualificado") return "Qualificado";
  if (row.has_whatsapp_msgs || row.whatsapp) return "WhatsApp";
  if (row.has_direct) return "Direct";
  return "Comentário / novo";
}

type RuleHit = { priority: FollowUpPriority; motivo: string; acao: string };

export function evaluateFollowUp(row: LeadActivitySnapshot, now = Date.now()): FollowUpItem | null {
  if (row.status === "convertido" || row.status === "perdido") return null;

  const horasParado = hoursSince(row.last_inbound_at, now);
  const rules: RuleHit[] = [];

  if (row.proximo_followup_em) {
    const followAt = new Date(row.proximo_followup_em).getTime();
    if (Number.isFinite(followAt) && followAt <= now) {
      rules.push({
        priority: "high",
        motivo: "Follow-up agendado para agora ou já passou.",
        acao: "Entrar em contato conforme combinado e registrar resultado nas notas.",
      });
    }
  }

  if (row.visita_proxima) {
    const visitaAt = new Date(row.visita_proxima).getTime();
    const horasVisita = (visitaAt - now) / (1000 * 60 * 60);
    if (Number.isFinite(visitaAt) && horasVisita >= 0 && horasVisita <= 24) {
      rules.push({
        priority: "high",
        motivo: "Compromisso agendado nas próximas 24h.",
        acao: "Confirmar presença com o lead e preparar material de fechamento.",
      });
    }
  }

  if (row.status === "handoff" && row.handoff_at) {
    const hHandoff = hoursSince(row.handoff_at, now);
    if (hHandoff !== null && hHandoff >= 2 && (horasParado === null || horasParado >= 2)) {
      rules.push({
        priority: "critical",
        motivo: "Handoff para humano — lead aguardando consultor.",
        acao: row.handoff_motivo
          ? `Ligar ou chamar no WhatsApp. Motivo: ${row.handoff_motivo}`
          : "Assumir conversa no WhatsApp imediatamente.",
      });
    }
  }

  if (row.status === "qualificado" && !row.handoff_at) {
    rules.push({
      priority: "high",
      motivo: "Lead qualificado pela IA, mas ainda sem handoff humano.",
      acao: "Revisar critérios, confirmar interesse e transferir para fechamento.",
    });
  }

  if (row.whatsapp && row.has_whatsapp_msgs && horasParado !== null && horasParado >= 24) {
    const ultimaFoiInbound =
      row.last_inbound_at &&
      (!row.last_outbound_at ||
        new Date(row.last_inbound_at).getTime() > new Date(row.last_outbound_at).getTime());
    if (ultimaFoiInbound) {
      rules.push({
        priority: "high",
        motivo: `Lead respondeu no WhatsApp há ${horasParado}h e ficou sem retorno.`,
        acao: "Responder com proposta clara ou convite para call — não deixar esfriar.",
      });
    }
  }

  if (row.whatsapp && !row.whatsapp_boas_vindas_enviado) {
    rules.push({
      priority: "medium",
      motivo: "WhatsApp cadastrado, mas boas-vindas ainda não enviadas.",
      acao: "Verificar fila do agente WA ou enviar mensagem manual de abertura.",
    });
  }

  if (
    row.whatsapp_boas_vindas_enviado &&
    !row.whatsapp_primeira_ia_enviada &&
    row.whatsapp_ia_agendada_em
  ) {
    const agendada = new Date(row.whatsapp_ia_agendada_em).getTime();
    if (Number.isFinite(agendada) && agendada < now) {
      rules.push({
        priority: "medium",
        motivo: "Primeira mensagem proativa da IA estava agendada e atrasou.",
        acao: "Conferir cron do n8n ou retomar conversa manualmente.",
      });
    }
  }

  if (row.has_direct && !row.whatsapp && horasParado !== null && horasParado >= 48) {
    rules.push({
      priority: "medium",
      motivo: "Conversa no Direct sem WhatsApp após 48h.",
      acao: "Pedir WhatsApp com benefício claro (material, orçamento, agenda).",
    });
  }

  if (
    !row.has_whatsapp_msgs &&
    !row.has_direct &&
    horasParado !== null &&
    horasParado >= 72 &&
    row.status === "novo"
  ) {
    rules.push({
      priority: "low",
      motivo: "Lead entrou só por comentário e não avançou no funil.",
      acao: "Responder no Direct com pergunta aberta sobre o interesse.",
    });
  }

  if (horasParado !== null && horasParado >= 72 && row.status === "em_conversa") {
    rules.push({
      priority: "medium",
      motivo: `Sem mensagem do lead há ${horasParado}h.`,
      acao: "Follow-up de reengajamento com valor (prova social, prazo, bônus).",
    });
  }

  if (rules.length === 0) return null;

  const best = rules.reduce((acc, r) => {
    if (!acc || PRIORITY_RANK[r.priority] > PRIORITY_RANK[acc.priority]) return r;
    return acc;
  });

  return {
    lead_id: row.id,
    nome: row.nome,
    username_instagram: row.username_instagram,
    whatsapp: row.whatsapp,
    status: row.status,
    priority: best.priority,
    temperature: computeTemperature(row, now),
    motivo: best.motivo,
    acao_sugerida: best.acao,
    horas_parado: horasParado,
    funil_etapa: computeFunilEtapa(row),
    visita_proxima: row.visita_proxima,
  };
}

export function sortFollowUps(items: FollowUpItem[]): FollowUpItem[] {
  return [...items].sort((a, b) => {
    const pd = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
    if (pd !== 0) return pd;
    return (b.horas_parado ?? 0) - (a.horas_parado ?? 0);
  });
}

export function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}
