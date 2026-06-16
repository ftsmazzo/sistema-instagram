import { ensureTables, getPool } from "../db/index.js";
import { canSendEvolutionAlert, resolveEvolutionBaseUrl, sendEvolutionText } from "./evolution.js";
import { getWhatsappInstanceForOrg } from "../store/whatsappInstance.js";
import { normalizePhoneDigits } from "../util/phone.js";

export type QualificarHandoffInput = {
  organizationId: string;
  leadPhone: string;
  motivo: string;
  criterios?: string | null;
  resumo?: string | null;
};

export type QualificarHandoffResult = {
  ok: boolean;
  lead_updated: boolean;
  alert_sent: boolean;
  handoff_whatsapp: string | null;
  message?: string;
  error?: string;
};

type LeadRow = {
  id: number;
  nome: string | null;
  whatsapp: string | null;
  username_instagram: string | null;
  objetivo: string | null;
  status: string;
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

function buildConsultorAlert(args: {
  lead: LeadRow | null;
  leadPhone: string;
  motivo: string;
  criterios?: string | null;
  resumo?: string | null;
}): string {
  const lines = ["🔔 *Lead qualificado — hora de fechar*", ""];
  if (args.lead?.nome?.trim()) lines.push(`Nome: ${args.lead.nome.trim()}`);
  lines.push(`WhatsApp: ${formatAlertPhone(args.leadPhone)}`);
  if (args.lead?.username_instagram?.trim()) {
    lines.push(`Instagram: @${args.lead.username_instagram.trim()}`);
  }
  if (args.lead?.objetivo?.trim()) lines.push(`Objetivo: ${args.lead.objetivo.trim()}`);
  lines.push(`Status anterior: ${args.lead?.status ?? "desconhecido"}`);
  lines.push("");
  lines.push(`Motivo: ${args.motivo.trim()}`);
  if (args.criterios?.trim()) lines.push(`Critérios: ${args.criterios.trim()}`);
  if (args.resumo?.trim()) lines.push(`Resumo: ${args.resumo.trim()}`);
  lines.push("");
  lines.push("Entre agora no WhatsApp do lead para conduzir o fechamento.");
  return lines.join("\n").slice(0, 1200);
}

export async function qualificarEAcionarHumano(
  input: QualificarHandoffInput
): Promise<QualificarHandoffResult> {
  const organizationId = input.organizationId.trim();
  const leadPhone = normalizePhoneDigits(input.leadPhone);
  const motivo = input.motivo.trim();

  if (!organizationId) {
    return { ok: false, lead_updated: false, alert_sent: false, handoff_whatsapp: null, error: "organization_id obrigatório." };
  }
  if (!leadPhone) {
    return { ok: false, lead_updated: false, alert_sent: false, handoff_whatsapp: null, error: "Telefone do lead inválido." };
  }
  if (!motivo) {
    return { ok: false, lead_updated: false, alert_sent: false, handoff_whatsapp: null, error: "Informe o motivo da qualificação." };
  }

  await ensureTables();
  const pool = getPool();

  const orgRes = await pool.query<{ handoff_whatsapp: string }>(
    `SELECT COALESCE(handoff_whatsapp, '') AS handoff_whatsapp FROM organizations WHERE id = $1::uuid LIMIT 1`,
    [organizationId]
  );
  const handoffWhatsapp = normalizePhoneDigits(orgRes.rows[0]?.handoff_whatsapp ?? null);

  const leadRes = await pool.query<LeadRow>(
    `SELECT id, nome, whatsapp, username_instagram, objetivo, status
     FROM leads
     WHERE organization_id = $1::uuid
       AND (whatsapp_digits = $2 OR regexp_replace(COALESCE(whatsapp, ''), '\\D', '', 'g') = $2)
     ORDER BY updated_at DESC LIMIT 1`,
    [organizationId, leadPhone]
  );
  const lead = leadRes.rows[0] ?? null;

  const updateRes = await pool.query(
    `UPDATE leads
     SET status = 'handoff',
         handoff_at = NOW(),
         handoff_motivo = $3,
         updated_at = NOW()
     WHERE organization_id = $1::uuid
       AND (whatsapp_digits = $2 OR regexp_replace(COALESCE(whatsapp, ''), '\\D', '', 'g') = $2)`,
    [organizationId, leadPhone, motivo]
  );
  const leadUpdated = (updateRes.rowCount ?? 0) > 0;

  if (!handoffWhatsapp) {
    return {
      ok: true,
      lead_updated: leadUpdated,
      alert_sent: false,
      handoff_whatsapp: null,
      message: leadUpdated
        ? "Lead marcado para handoff, mas nenhum WhatsApp de consultor está configurado no painel."
        : "Lead não encontrado no CRM; configure o WhatsApp do consultor no painel.",
    };
  }

  const instance = await getWhatsappInstanceForOrg(organizationId);
  if (!instance?.instance_name?.trim()) {
    return {
      ok: true,
      lead_updated: leadUpdated,
      alert_sent: false,
      handoff_whatsapp: handoffWhatsapp,
      message: "Lead atualizado, mas não há instância WhatsApp configurada para enviar o alerta.",
    };
  }

  if (!canSendEvolutionAlert(instance.evolution_base_url)) {
    return {
      ok: true,
      lead_updated: leadUpdated,
      alert_sent: false,
      handoff_whatsapp: handoffWhatsapp,
      message:
        "Lead atualizado, mas Evolution não está configurada (EVOLUTION_BASE_URL + EVOLUTION_GLOBAL_API_KEY) para enviar o alerta.",
    };
  }

  const baseUrl = resolveEvolutionBaseUrl(instance.evolution_base_url);
  const alertText = buildConsultorAlert({
    lead,
    leadPhone,
    motivo,
    criterios: input.criterios,
    resumo: input.resumo,
  });

  try {
    await sendEvolutionText(instance.instance_name, handoffWhatsapp, alertText, baseUrl);
    return {
      ok: true,
      lead_updated: leadUpdated,
      alert_sent: true,
      handoff_whatsapp: handoffWhatsapp,
      message: "Lead qualificado e consultor alertado no WhatsApp.",
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Falha ao enviar alerta ao consultor.";
    return {
      ok: false,
      lead_updated: leadUpdated,
      alert_sent: false,
      handoff_whatsapp: handoffWhatsapp,
      error,
    };
  }
}
