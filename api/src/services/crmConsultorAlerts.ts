import type { FastifyBaseLogger } from "fastify";
import { ensureTables, getPool } from "../db/index.js";
import { canSendEvolutionAlert, resolveEvolutionBaseUrl, sendEvolutionText } from "./evolution.js";
import { getCrmCadenciaConfig } from "../store/crmCadencia.js";
import { getWhatsappInstanceForOrg } from "../store/whatsappInstance.js";
import { normalizePhoneDigits } from "../util/phone.js";

type AlertRow = {
  followup_id: number;
  organization_id: string;
  lead_id: number;
  telefone: string;
  sent_at: Date;
  message_text: string;
  lead_nome: string | null;
  handoff_whatsapp: string;
  instance_name: string;
  evolution_base_url: string;
};

async function findFollowUpsNeedingAlert(limit = 10): Promise<AlertRow[]> {
  await ensureTables();
  const pool = getPool();
  const r = await pool.query<AlertRow>(
    `SELECT f.id AS followup_id, f.organization_id, f.lead_id, f.telefone, f.sent_at,
            f.message_text, l.nome AS lead_nome,
            COALESCE(o.handoff_whatsapp, '') AS handoff_whatsapp,
            wi.instance_name, wi.evolution_base_url
     FROM crm_followup_mensagens f
     INNER JOIN leads l ON l.id = f.lead_id
     INNER JOIN organizations o ON o.id = f.organization_id
     INNER JOIN LATERAL (
       SELECT wi2.instance_name, wi2.evolution_base_url
       FROM whatsapp_instances wi2
       WHERE wi2.organization_id = f.organization_id
         AND COALESCE(wi2.instance_name, '') <> ''
       ORDER BY wi2.updated_at DESC LIMIT 1
     ) wi ON true
     WHERE f.status = 'enviado'
       AND f.sent_at IS NOT NULL
       AND f.alerta_consultor_em IS NULL
       AND COALESCE(o.handoff_whatsapp, '') <> ''
       AND f.sent_at <= NOW() - INTERVAL '1 hour'
       AND NOT EXISTS (
         SELECT 1 FROM whatsapp_messages wm
         WHERE wm.organization_id = f.organization_id
           AND wm.telefone = f.telefone
           AND wm.direction = 'inbound'
           AND wm.created_at > f.sent_at
       )
     ORDER BY f.sent_at ASC
     LIMIT $1`,
    [limit]
  );
  return r.rows;
}

async function findHandoffsNeedingAlert(limit = 10): Promise<
  Array<{
    organization_id: string;
    lead_id: number;
    nome: string | null;
    whatsapp_digits: string;
    handoff_motivo: string | null;
    handoff_at: Date;
    handoff_whatsapp: string;
    instance_name: string;
    evolution_base_url: string;
  }>
> {
  await ensureTables();
  const pool = getPool();
  const r = await pool.query(
    `SELECT l.organization_id, l.id AS lead_id, l.nome, l.whatsapp_digits,
            l.handoff_motivo, l.handoff_at,
            COALESCE(o.handoff_whatsapp, '') AS handoff_whatsapp,
            wi.instance_name, wi.evolution_base_url
     FROM leads l
     INNER JOIN organizations o ON o.id = l.organization_id
     INNER JOIN LATERAL (
       SELECT wi2.instance_name, wi2.evolution_base_url
       FROM whatsapp_instances wi2
       WHERE wi2.organization_id = l.organization_id
         AND COALESCE(wi2.instance_name, '') <> ''
       ORDER BY wi2.updated_at DESC LIMIT 1
     ) wi ON true
     WHERE l.status = 'handoff'
       AND l.handoff_at IS NOT NULL
       AND l.handoff_at <= NOW() - INTERVAL '2 hours'
       AND l.handoff_alerta_em IS NULL
       AND COALESCE(o.handoff_whatsapp, '') <> ''
     LIMIT $1`,
    [limit]
  );
  return r.rows;
}

export async function processConsultorAlerts(log?: FastifyBaseLogger): Promise<number> {
  let sent = 0;

  const followUps = await findFollowUpsNeedingAlert(8);
  for (const row of followUps) {
    const config = await getCrmCadenciaConfig(row.organization_id);
    const alertHours = config.alerta_consultor_horas;
    const sentAt = new Date(row.sent_at).getTime();
    if (Date.now() - sentAt < alertHours * 60 * 60 * 1000) continue;

    const consultor = normalizePhoneDigits(row.handoff_whatsapp);
    if (!consultor || !canSendEvolutionAlert(row.evolution_base_url)) continue;

    const baseUrl = resolveEvolutionBaseUrl(row.evolution_base_url);
    const nome = row.lead_nome ?? "Lead";
    const text = [
      "⚠️ *CRM — lead sem resposta*",
      "",
      `Lead: ${nome}`,
      `Tel: +${row.telefone}`,
      `Follow-up enviado há mais de ${alertHours}h sem retorno.`,
      "",
      `Última msg: ${row.message_text.slice(0, 120)}${row.message_text.length > 120 ? "…" : ""}`,
      "",
      "Assuma a conversa no WhatsApp para não perder a venda.",
    ].join("\n");

    try {
      await sendEvolutionText(row.instance_name, consultor, text, baseUrl);
      await getPool().query(
        `UPDATE crm_followup_mensagens SET alerta_consultor_em = NOW() WHERE id = $1`,
        [row.followup_id]
      );
      sent++;
      log?.info({ lead_id: row.lead_id }, "Alerta consultor — follow-up sem resposta.");
    } catch (err) {
      log?.error({ err, lead_id: row.lead_id }, "Falha alerta consultor (follow-up).");
    }
  }

  const handoffs = await findHandoffsNeedingAlert(5);
  for (const row of handoffs) {
    const consultor = normalizePhoneDigits(row.handoff_whatsapp);
    if (!consultor || !canSendEvolutionAlert(row.evolution_base_url)) continue;

    const baseUrl = resolveEvolutionBaseUrl(row.evolution_base_url);
    const nome = row.nome ?? "Lead";
    const text = [
      "🔔 *CRM — handoff aguardando*",
      "",
      `Lead: ${nome}`,
      row.whatsapp_digits ? `Tel: +${row.whatsapp_digits}` : "",
      row.handoff_motivo ? `Motivo: ${row.handoff_motivo}` : "",
      "",
      "Lead qualificado há mais de 2h — entre em contato.",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await sendEvolutionText(row.instance_name, consultor, text, baseUrl);
      await getPool().query(
        `UPDATE leads SET handoff_alerta_em = NOW(), updated_at = NOW()
         WHERE id = $1 AND organization_id = $2::uuid`,
        [row.lead_id, row.organization_id]
      );
      sent++;
      log?.info({ lead_id: row.lead_id }, "Alerta consultor — handoff.");
    } catch (err) {
      log?.error({ err, lead_id: row.lead_id }, "Falha alerta consultor (handoff).");
    }
  }

  return sent;
}
