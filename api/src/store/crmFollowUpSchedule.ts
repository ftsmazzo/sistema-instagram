import { ensureTables, getPool } from "../db/index.js";
import { normalizePhoneDigits } from "../util/phone.js";

export type CrmFollowUpMessage = {
  id: number;
  lead_id: number;
  telefone: string;
  message_text: string;
  agendado_para: string;
  status: string;
  criado_por: string;
  origin_hint: string | null;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  lead_nome?: string | null;
  username_instagram?: string | null;
};

export type DueFollowUpRow = {
  id: number;
  organization_id: string;
  lead_id: number;
  telefone: string;
  message_text: string;
  instance_name: string;
  evolution_base_url: string;
};

function mapRow(row: Record<string, unknown>): CrmFollowUpMessage {
  return {
    id: Number(row.id),
    lead_id: Number(row.lead_id),
    telefone: String(row.telefone),
    message_text: String(row.message_text),
    agendado_para: new Date(row.agendado_para as Date).toISOString(),
    status: String(row.status),
    criado_por: String(row.criado_por ?? "consultor"),
    origin_hint: row.origin_hint ? String(row.origin_hint) : null,
    error_message: row.error_message ? String(row.error_message) : null,
    sent_at: row.sent_at ? new Date(row.sent_at as Date).toISOString() : null,
    created_at: new Date(row.created_at as Date).toISOString(),
    updated_at: new Date(row.updated_at as Date).toISOString(),
    lead_nome: row.lead_nome != null ? String(row.lead_nome) : undefined,
    username_instagram: row.username_instagram != null ? String(row.username_instagram) : undefined,
  };
}

const MIN_FUTURE_MS = 2 * 60 * 1000;

export async function createCrmFollowUp(input: {
  organizationId: string;
  leadId: number;
  messageText: string;
  agendadoPara: Date;
  originHint?: string | null;
}): Promise<CrmFollowUpMessage> {
  await ensureTables();
  const pool = getPool();

  const messageText = input.messageText.trim();
  if (!messageText) throw new Error("Informe o texto da mensagem.");
  if (messageText.length > 4096) throw new Error("Mensagem muito longa (máx. 4096 caracteres).");

  const when = input.agendadoPara.getTime();
  if (!Number.isFinite(when)) throw new Error("Data/hora de envio inválida.");
  if (when < Date.now() + MIN_FUTURE_MS) {
    throw new Error("Agende com pelo menos 2 minutos de antecedência.");
  }

  const leadR = await pool.query<{ whatsapp_digits: string | null; whatsapp: string | null }>(
    `SELECT whatsapp_digits, whatsapp FROM leads
     WHERE id = $1 AND organization_id = $2::uuid LIMIT 1`,
    [input.leadId, input.organizationId]
  );
  const lead = leadR.rows[0];
  if (!lead) throw new Error("Lead não encontrado.");

  const telefone =
    normalizePhoneDigits(lead.whatsapp_digits) ?? normalizePhoneDigits(lead.whatsapp);
  if (!telefone) {
    throw new Error("Lead sem WhatsApp válido — cadastre o número antes de agendar.");
  }

  const waR = await pool.query<{ instance_name: string }>(
    `SELECT instance_name FROM whatsapp_instances
     WHERE organization_id = $1::uuid AND COALESCE(instance_name, '') <> ''
     LIMIT 1`,
    [input.organizationId]
  );
  if (!waR.rows[0]?.instance_name?.trim()) {
    throw new Error("WhatsApp não conectado — configure a instância Evolution antes de agendar.");
  }

  const r = await pool.query(
    `INSERT INTO crm_followup_mensagens
       (organization_id, lead_id, telefone, message_text, agendado_para, origin_hint)
     VALUES ($1::uuid, $2, $3, $4, $5::timestamptz, $6)
     RETURNING *`,
    [
      input.organizationId,
      input.leadId,
      telefone,
      messageText,
      input.agendadoPara,
      input.originHint?.trim() || null,
    ]
  );

  await pool.query(
    `UPDATE leads SET proximo_followup_em = $3, updated_at = NOW()
     WHERE id = $1 AND organization_id = $2::uuid
       AND (proximo_followup_em IS NULL OR proximo_followup_em > $3::timestamptz)`,
    [input.leadId, input.organizationId, input.agendadoPara]
  );

  return mapRow(r.rows[0]);
}

export async function listCrmFollowUpsForLead(
  organizationId: string,
  leadId: number
): Promise<CrmFollowUpMessage[]> {
  await ensureTables();
  const pool = getPool();
  const r = await pool.query(
    `SELECT * FROM crm_followup_mensagens
     WHERE organization_id = $1::uuid AND lead_id = $2
     ORDER BY agendado_para DESC
     LIMIT 50`,
    [organizationId, leadId]
  );
  return r.rows.map(mapRow);
}

export async function listPendingCrmFollowUps(organizationId: string): Promise<CrmFollowUpMessage[]> {
  await ensureTables();
  const pool = getPool();
  const r = await pool.query(
    `SELECT f.*, l.nome AS lead_nome, l.username_instagram
     FROM crm_followup_mensagens f
     INNER JOIN leads l ON l.id = f.lead_id
     WHERE f.organization_id = $1::uuid
       AND f.status = 'pendente'
       AND f.agendado_para >= NOW() - INTERVAL '1 hour'
     ORDER BY f.agendado_para ASC
     LIMIT 100`,
    [organizationId]
  );
  return r.rows.map(mapRow);
}

export async function cancelCrmFollowUp(organizationId: string, id: number): Promise<boolean> {
  await ensureTables();
  const pool = getPool();
  const r = await pool.query(
    `UPDATE crm_followup_mensagens
     SET status = 'cancelado', updated_at = NOW()
     WHERE id = $1 AND organization_id = $2::uuid AND status = 'pendente'`,
    [id, organizationId]
  );
  return (r.rowCount ?? 0) > 0;
}

/** Reserva mensagens vencidas para envio (evita duplicata em múltiplos workers). */
export async function claimDueCrmFollowUps(limit = 15): Promise<DueFollowUpRow[]> {
  await ensureTables();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query<DueFollowUpRow>(
      `SELECT f.id, f.organization_id, f.lead_id, f.telefone, f.message_text,
              wi.instance_name, wi.evolution_base_url
       FROM crm_followup_mensagens f
       INNER JOIN LATERAL (
         SELECT wi2.instance_name, wi2.evolution_base_url
         FROM whatsapp_instances wi2
         WHERE wi2.organization_id = f.organization_id
           AND COALESCE(wi2.instance_name, '') <> ''
         ORDER BY wi2.updated_at DESC
         LIMIT 1
       ) wi ON true
       WHERE f.status = 'pendente'
         AND f.agendado_para <= NOW()
       ORDER BY f.agendado_para ASC
       LIMIT $1
       FOR UPDATE OF f SKIP LOCKED`,
      [Math.min(50, Math.max(1, limit))]
    );
    const ids = r.rows.map((row) => row.id);
    if (ids.length > 0) {
      await client.query(
        `UPDATE crm_followup_mensagens SET status = 'enviando', updated_at = NOW()
         WHERE id = ANY($1::int[])`,
        [ids]
      );
    }
    await client.query("COMMIT");
    return r.rows;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function markCrmFollowUpSent(id: number): Promise<void> {
  await ensureTables();
  const pool = getPool();
  await pool.query(
    `UPDATE crm_followup_mensagens
     SET status = 'enviado', sent_at = NOW(), updated_at = NOW(), error_message = NULL
     WHERE id = $1`,
    [id]
  );
}

export async function markCrmFollowUpFailed(id: number, error: string): Promise<void> {
  await ensureTables();
  const pool = getPool();
  await pool.query(
    `UPDATE crm_followup_mensagens
     SET status = 'falhou', updated_at = NOW(), error_message = $2
     WHERE id = $1`,
    [id, error.slice(0, 2000)]
  );
}

export async function logWhatsappOutbound(params: {
  organizationId: string;
  leadId: number;
  telefone: string;
  messageText: string;
  instanceName: string;
}): Promise<void> {
  await ensureTables();
  const pool = getPool();
  await pool.query(
    `INSERT INTO whatsapp_messages
       (organization_id, lead_id, telefone, direction, message_text, instance_name)
     VALUES ($1::uuid, $2, $3, 'outbound', $4, $5)`,
    [
      params.organizationId,
      params.leadId,
      params.telefone,
      params.messageText,
      params.instanceName,
    ]
  );
}

export async function countPendingCrmFollowUps(organizationId: string): Promise<number> {
  await ensureTables();
  const pool = getPool();
  const r = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM crm_followup_mensagens
     WHERE organization_id = $1::uuid AND status = 'pendente' AND agendado_para > NOW()`,
    [organizationId]
  );
  return Number(r.rows[0]?.n ?? 0);
}
