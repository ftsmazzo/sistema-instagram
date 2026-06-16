import { ensureTables, getPool } from "../db/index.js";
import { normalizePhoneDigits } from "../util/phone.js";

export type ProactiveLeadRow = {
  lead_id: number;
  organization_id: string;
  nome: string | null;
  whatsapp: string | null;
  whatsapp_digits: string;
  objetivo: string | null;
  id_post_origem: string | null;
  username_instagram: string | null;
  instance_name: string;
  evolution_base_url: string;
};

function clampDelay(minutes: number): number {
  if (!Number.isFinite(minutes)) return 20;
  return Math.min(1440, Math.max(0, Math.round(minutes)));
}

/** Garante whatsapp_ia_agendada_em a partir de boas-vindas + delay quando ainda não definido. */
export async function ensureProactiveScheduleForLead(leadId: number): Promise<void> {
  await ensureTables();
  const pool = getPool();
  await pool.query(
    `UPDATE leads l
     SET whatsapp_ia_agendada_em = sub.scheduled
     FROM (
       SELECT l2.id,
              COALESCE(l2.whatsapp_boas_vindas_em, (
                SELECT MIN(wm.created_at)
                FROM whatsapp_messages wm
                WHERE wm.organization_id = l2.organization_id
                  AND wm.telefone = l2.whatsapp_digits
                  AND wm.direction = 'outbound'
              ), l2.updated_at)
              + (COALESCE(wi.delay_primeira_msg_minutos, 20) || ' minutes')::interval AS scheduled
       FROM leads l2
       INNER JOIN whatsapp_instances wi
         ON wi.organization_id = l2.organization_id AND wi.agent_ativo = true
       WHERE l2.id = $1
         AND l2.whatsapp_boas_vindas_enviado = true
         AND l2.whatsapp_primeira_ia_enviada = false
         AND l2.whatsapp_ia_agendada_em IS NULL
     ) sub
     WHERE l.id = sub.id`,
    [leadId]
  );
}

/** Marca boas-vindas enviada e agenda 1ª msg proativa (workflow de welcome deve chamar). */
export async function markWhatsappBoasVindas(args: {
  organizationId: string;
  phoneDigits: string;
  delayMinutes?: number;
}): Promise<{ ok: boolean; lead_id?: number; ia_agendada_em?: string }> {
  await ensureTables();
  const pool = getPool();
  const phoneDigits = normalizePhoneDigits(args.phoneDigits);
  if (!phoneDigits) return { ok: false };
  const delay = clampDelay(args.delayMinutes ?? 20);
  const r = await pool.query<{ id: number; ia_agendada_em: Date }>(
    `UPDATE leads l
     SET whatsapp_boas_vindas_enviado = true,
         whatsapp_boas_vindas_em = COALESCE(l.whatsapp_boas_vindas_em, NOW()),
         whatsapp_ia_agendada_em = COALESCE(
           l.whatsapp_ia_agendada_em,
           COALESCE(l.whatsapp_boas_vindas_em, NOW()) + ($3 || ' minutes')::interval
         ),
         updated_at = NOW()
     FROM whatsapp_instances wi
     WHERE l.organization_id = $1::uuid
       AND l.whatsapp_digits = $2
       AND wi.organization_id = l.organization_id
       AND wi.agent_ativo = true
     RETURNING l.id, l.whatsapp_ia_agendada_em AS ia_agendada_em`,
    [args.organizationId, phoneDigits, String(delay)]
  );
  const row = r.rows[0];
  if (!row) return { ok: false };
  return { ok: true, lead_id: row.id, ia_agendada_em: row.ia_agendada_em.toISOString() };
}

/** Backfill de agenda + lista leads prontos para 1ª msg proativa (cron n8n). */
export async function listLeadsReadyForProactiveIa(limit = 5): Promise<ProactiveLeadRow[]> {
  await ensureTables();
  const pool = getPool();

  await pool.query(
    `UPDATE leads l
     SET whatsapp_ia_agendada_em = sub.scheduled
     FROM (
       SELECT l2.id,
              COALESCE(l2.whatsapp_boas_vindas_em, (
                SELECT MIN(wm.created_at)
                FROM whatsapp_messages wm
                WHERE wm.organization_id = l2.organization_id
                  AND wm.telefone = l2.whatsapp_digits
                  AND wm.direction = 'outbound'
              ), l2.updated_at)
              + (COALESCE(wi.delay_primeira_msg_minutos, 20) || ' minutes')::interval AS scheduled
       FROM leads l2
       INNER JOIN whatsapp_instances wi
         ON wi.organization_id = l2.organization_id AND wi.agent_ativo = true
       WHERE l2.whatsapp_boas_vindas_enviado = true
         AND l2.whatsapp_primeira_ia_enviada = false
         AND l2.whatsapp_ia_agendada_em IS NULL
         AND COALESCE(l2.whatsapp_digits, '') <> ''
         AND l2.status NOT IN ('handoff', 'convertido', 'perdido')
     ) sub
     WHERE l.id = sub.id`
  );

  const r = await pool.query<ProactiveLeadRow>(
    `SELECT l.id AS lead_id, l.organization_id, l.nome, l.whatsapp, l.whatsapp_digits,
            l.objetivo, l.id_post_origem, l.username_instagram,
            wi.instance_name, wi.evolution_base_url
     FROM leads l
     INNER JOIN whatsapp_instances wi
       ON wi.organization_id = l.organization_id AND wi.agent_ativo = true
     WHERE l.whatsapp_boas_vindas_enviado = true
       AND l.whatsapp_primeira_ia_enviada = false
       AND l.whatsapp_ia_agendada_em IS NOT NULL
       AND l.whatsapp_ia_agendada_em <= NOW()
       AND l.status NOT IN ('handoff', 'convertido', 'perdido')
       AND COALESCE(l.whatsapp_digits, '') <> ''
     ORDER BY l.whatsapp_ia_agendada_em ASC
     LIMIT $1`,
    [Math.min(20, Math.max(1, limit))]
  );
  return r.rows;
}
