import { ensureTables, getPool } from "../db/index.js";
import { AGENT_TIMEZONE } from "./agentConfigDefaults.js";
import {
  formatDataVisitaParaAlerta,
  parseAgendaConfig,
  resolveAgendamentoDateTime,
  validateDataVisitaAgenda,
  type AgendaConfig,
} from "./empresaConfigHelpers.js";
import { isEvolutionConfigured, resolveEvolutionBaseUrl, sendEvolutionText } from "./evolution.js";
import { getWhatsappInstanceForOrg } from "../store/whatsappInstance.js";
import { normalizePhoneDigits } from "../util/phone.js";

export type AgendarCompromissoInput = {
  organizationId: string;
  leadPhone: string;
  dataVisita: string;
  diaSemana?: string | null;
  horario?: string | null;
  assunto?: string | null;
  observacoes?: string | null;
  idPostOrigem?: string | null;
};

export type AgendarCompromissoResult = {
  ok: boolean;
  visita_id: number | null;
  lead_updated: boolean;
  alert_sent: boolean;
  handoff_whatsapp: string | null;
  data_visita: string | null;
  data_visita_formatada: string | null;
  confirmacao_sugerida: string | null;
  local: string | null;
  message?: string;
  error?: string;
};

type LeadRow = {
  id: number;
  nome: string | null;
  whatsapp: string | null;
  username_instagram: string | null;
  id_post_origem: string | null;
};

function formatAlertPhone(digits: string): string {
  if (digits.length < 12) return `+${digits}`;
  const local = digits.startsWith("55") ? digits.slice(2) : digits;
  if (local.length === 11) {
    return `+55 (${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `+55 (${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return `+${digits}`;
}

function buildAgendaAlert(args: {
  lead: LeadRow | null;
  leadPhone: string;
  dataVisitaFmt: string;
  local: string;
  assunto?: string | null;
  observacoes?: string | null;
}): string {
  const lines = ["📅 *Novo compromisso agendado*", ""];
  if (args.lead?.nome?.trim()) lines.push(`Lead: ${args.lead.nome.trim()}`);
  lines.push(`WhatsApp: ${formatAlertPhone(args.leadPhone)}`);
  if (args.lead?.username_instagram?.trim()) {
    lines.push(`Instagram: @${args.lead.username_instagram.trim()}`);
  }
  lines.push(`Quando: ${args.dataVisitaFmt}`);
  lines.push(`Local: ${args.local}`);
  if (args.assunto?.trim()) lines.push(`Assunto: ${args.assunto.trim()}`);
  if (args.observacoes?.trim()) lines.push(`Observações: ${args.observacoes.trim()}`);
  lines.push("");
  lines.push("Confirme com o lead se necessário.");
  return lines.join("\n").slice(0, 1200);
}

export async function agendarCompromisso(input: AgendarCompromissoInput): Promise<AgendarCompromissoResult> {
  const organizationId = input.organizationId.trim();
  const leadPhone = normalizePhoneDigits(input.leadPhone);
  const timezone = AGENT_TIMEZONE;

  const fail = (error: string, partial?: Partial<AgendarCompromissoResult>): AgendarCompromissoResult => ({
    ok: false,
    visita_id: null,
    lead_updated: false,
    alert_sent: false,
    handoff_whatsapp: null,
    data_visita: null,
    data_visita_formatada: null,
    confirmacao_sugerida: null,
    local: null,
    error,
    ...partial,
  });

  if (!organizationId) {
    return fail("organization_id obrigatório.");
  }
  if (!leadPhone) {
    return fail("Telefone do lead inválido.");
  }

  await ensureTables();
  const pool = getPool();

  const orgRes = await pool.query<{
    handoff_whatsapp: string;
    agenda_local: string;
    agenda_config: unknown;
  }>(
    `SELECT COALESCE(handoff_whatsapp, '') AS handoff_whatsapp,
            COALESCE(agenda_local, '') AS agenda_local,
            COALESCE(agenda_config, '{"dias_semana":[1,2,3,4,5],"horario_inicio":"09:00","horario_fim":"18:00","duracao_minutos":60}'::jsonb) AS agenda_config
     FROM organizations WHERE id = $1::uuid LIMIT 1`,
    [organizationId]
  );
  const handoffWhatsapp = normalizePhoneDigits(orgRes.rows[0]?.handoff_whatsapp ?? null);
  const local =
    (orgRes.rows[0]?.agenda_local ?? "").trim() || "A combinar com o consultor";
  const agenda: AgendaConfig = parseAgendaConfig(orgRes.rows[0]?.agenda_config);

  const resolved = resolveAgendamentoDateTime({
    dataVisitaRaw: input.dataVisita,
    diaSemana: input.diaSemana,
    horario: input.horario,
    timezone,
  });
  if (!resolved.date) {
    return fail(resolved.error ?? "Data/hora do compromisso inválida.");
  }

  const validation = validateDataVisitaAgenda(resolved.date, timezone, agenda);
  if (!validation.ok) {
    return fail(validation.error ?? "Data fora da disponibilidade.");
  }

  const dataVisita = resolved.date;

  const leadRes = await pool.query<LeadRow>(
    `SELECT id, nome, whatsapp, username_instagram, id_post_origem
     FROM leads
     WHERE organization_id = $1::uuid
       AND (whatsapp_digits = $2 OR regexp_replace(COALESCE(whatsapp, ''), '\\D', '', 'g') = $2)
     ORDER BY updated_at DESC LIMIT 1`,
    [organizationId, leadPhone]
  );
  const lead = leadRes.rows[0] ?? null;
  const idPost = (input.idPostOrigem ?? lead?.id_post_origem ?? "").trim() || null;
  const obsParts = [input.assunto?.trim(), input.observacoes?.trim()].filter(Boolean);
  const observacoes = obsParts.join(" — ") || null;

  const insertRes = await pool.query<{ id: number }>(
    `INSERT INTO visitas (organization_id, lead_id, telefone, id_post_origem, data_visita, observacoes, status)
     VALUES ($1::uuid, $2, $3, $4, $5::timestamptz, $6, 'agendada')
     RETURNING id`,
    [
      organizationId,
      lead?.id ?? null,
      leadPhone,
      idPost,
      dataVisita.toISOString(),
      observacoes,
    ]
  );
  const visitaId = insertRes.rows[0]?.id ?? null;

  const updateRes = await pool.query(
    `UPDATE leads
     SET status = 'qualificado', updated_at = NOW()
     WHERE organization_id = $1::uuid
       AND (whatsapp_digits = $2 OR regexp_replace(COALESCE(whatsapp, ''), '\\D', '', 'g') = $2)`,
    [organizationId, leadPhone]
  );
  const leadUpdated = (updateRes.rowCount ?? 0) > 0;

  const dataVisitaFmt = formatDataVisitaParaAlerta(dataVisita.toISOString(), timezone);
  const confirmacaoSugerida = `Compromisso confirmado: ${dataVisitaFmt}. Local: ${local}.`;

  if (!handoffWhatsapp) {
    return {
      ok: true,
      visita_id: visitaId,
      lead_updated: leadUpdated,
      alert_sent: false,
      handoff_whatsapp: null,
      data_visita: dataVisita.toISOString(),
      data_visita_formatada: dataVisitaFmt,
      confirmacao_sugerida: confirmacaoSugerida,
      local,
      message: "Compromisso registrado, mas nenhum WhatsApp de consultor está configurado para alerta.",
    };
  }

  if (!isEvolutionConfigured()) {
    return {
      ok: true,
      visita_id: visitaId,
      lead_updated: leadUpdated,
      alert_sent: false,
      handoff_whatsapp: handoffWhatsapp,
      data_visita: dataVisita.toISOString(),
      data_visita_formatada: dataVisitaFmt,
      confirmacao_sugerida: confirmacaoSugerida,
      local,
      message: "Compromisso registrado, mas Evolution não está configurada para enviar o alerta.",
    };
  }

  const instance = await getWhatsappInstanceForOrg(organizationId);
  if (!instance?.instance_name?.trim()) {
    return {
      ok: true,
      visita_id: visitaId,
      lead_updated: leadUpdated,
      alert_sent: false,
      handoff_whatsapp: handoffWhatsapp,
      data_visita: dataVisita.toISOString(),
      data_visita_formatada: dataVisitaFmt,
      confirmacao_sugerida: confirmacaoSugerida,
      local,
      message: "Compromisso registrado, mas não há instância WhatsApp para enviar o alerta.",
    };
  }

  const baseUrl = resolveEvolutionBaseUrl(instance.evolution_base_url);
  const alertText = buildAgendaAlert({
    lead,
    leadPhone,
    dataVisitaFmt,
    local,
    assunto: input.assunto,
    observacoes: input.observacoes,
  });

  try {
    await sendEvolutionText(instance.instance_name, handoffWhatsapp, alertText, baseUrl);
    return {
      ok: true,
      visita_id: visitaId,
      lead_updated: leadUpdated,
      alert_sent: true,
      handoff_whatsapp: handoffWhatsapp,
      data_visita: dataVisita.toISOString(),
      data_visita_formatada: dataVisitaFmt,
      confirmacao_sugerida: confirmacaoSugerida,
      local,
      message: "Compromisso registrado e consultor alertado no WhatsApp.",
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Falha ao enviar alerta ao consultor.";
    return {
      ok: false,
      visita_id: visitaId,
      lead_updated: leadUpdated,
      alert_sent: false,
      handoff_whatsapp: handoffWhatsapp,
      data_visita: dataVisita.toISOString(),
      data_visita_formatada: dataVisitaFmt,
      confirmacao_sugerida: confirmacaoSugerida,
      local,
      error,
    };
  }
}
