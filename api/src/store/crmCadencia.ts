import { randomUUID } from "crypto";
import { ensureTables, getPool } from "../db/index.js";
import { normalizePhoneDigits } from "../util/phone.js";
import {
  applyCadenciaTemplate,
  parseCrmCadenciaConfig,
  type CrmCadenciaConfig,
} from "../services/crmCadenciaConfig.js";

export async function getCrmCadenciaConfig(organizationId: string): Promise<CrmCadenciaConfig> {
  await ensureTables();
  const pool = getPool();
  const r = await pool.query<{ crm_cadencia_config: unknown }>(
    `SELECT crm_cadencia_config FROM organizations WHERE id = $1::uuid LIMIT 1`,
    [organizationId]
  );
  return parseCrmCadenciaConfig(r.rows[0]?.crm_cadencia_config);
}

export async function saveCrmCadenciaConfig(
  organizationId: string,
  config: CrmCadenciaConfig
): Promise<CrmCadenciaConfig> {
  await ensureTables();
  const pool = getPool();
  const parsed = parseCrmCadenciaConfig(config);
  await pool.query(
    `UPDATE organizations SET crm_cadencia_config = $2::jsonb WHERE id = $1::uuid`,
    [organizationId, JSON.stringify(parsed)]
  );
  return parsed;
}

type ColdLeadRow = {
  id: number;
  nome: string | null;
  objetivo: string | null;
  whatsapp_digits: string;
  parada_em: Date;
  nome_fantasia: string | null;
};

/** Lead respondeu no WhatsApp — cancela cadência pendente. */
export async function onLeadWhatsappReply(organizationId: string, phone: string): Promise<void> {
  await ensureTables();
  const pool = getPool();
  const telefone = normalizePhoneDigits(phone);
  if (!telefone) return;

  await pool.query(
    `UPDATE crm_followup_mensagens f
     SET status = 'cancelado', updated_at = NOW()
     FROM leads l
     WHERE f.organization_id = $1::uuid
       AND f.status = 'pendente'
       AND f.origin_hint LIKE 'cadencia%'
       AND l.id = f.lead_id
       AND l.organization_id = f.organization_id
       AND l.whatsapp_digits = $2`,
    [organizationId, telefone]
  );

  await pool.query(
    `UPDATE leads SET crm_cadencia_serie_id = NULL, updated_at = NOW()
     WHERE organization_id = $1::uuid AND whatsapp_digits = $2`,
    [organizationId, telefone]
  );
}

async function findColdLeadsForCadencia(
  organizationId: string,
  config: CrmCadenciaConfig
): Promise<ColdLeadRow[]> {
  const pool = getPool();
  const r = await pool.query<ColdLeadRow & { nome_fantasia: string | null }>(
    `SELECT l.id, l.nome, l.objetivo, l.whatsapp_digits, act.parada_em,
            COALESCE(o.nome_fantasia, o.nome, '') AS nome_fantasia
     FROM leads l
     INNER JOIN organizations o ON o.id = l.organization_id
     INNER JOIN LATERAL (
       SELECT MAX(CASE WHEN ev.dir = 'out' THEN ev.at END) AS last_out,
              MAX(CASE WHEN ev.dir = 'in' THEN ev.at END) AS last_in
       FROM (
         SELECT wm.created_at AS at,
                CASE WHEN wm.direction = 'outbound' THEN 'out' ELSE 'in' END AS dir
         FROM whatsapp_messages wm
         WHERE wm.organization_id = l.organization_id
           AND wm.telefone = l.whatsapp_digits
       ) ev
     ) wa ON true
     INNER JOIN LATERAL (
       SELECT COALESCE(wa.last_out, l.updated_at) AS parada_em
     ) act ON true
     WHERE l.organization_id = $1::uuid
       AND COALESCE(l.whatsapp_digits, '') <> ''
       AND l.crm_cadencia_pausada = false
       AND l.crm_cadencia_serie_id IS NULL
       AND l.status IN ('novo', 'em_conversa', 'qualificado')
       AND wa.last_out IS NOT NULL
       AND (wa.last_in IS NULL OR wa.last_out >= wa.last_in)
       AND act.parada_em <= NOW() - ($2 || ' hours')::interval
       AND NOT EXISTS (
         SELECT 1 FROM crm_followup_mensagens f
         WHERE f.lead_id = l.id AND f.status = 'pendente'
           AND f.origin_hint LIKE 'cadencia%'
       )
     ORDER BY act.parada_em ASC
     LIMIT 20`,
    [organizationId, String(config.horas_sem_resposta)]
  );
  return r.rows;
}

/** Cria série de follow-ups para leads parados (cron). */
export async function processCadenciaForOrg(organizationId: string): Promise<number> {
  const config = await getCrmCadenciaConfig(organizationId);
  if (!config.ativo || config.etapas.length === 0) return 0;

  const cold = await findColdLeadsForCadencia(organizationId, config);
  if (cold.length === 0) return 0;

  const pool = getPool();
  let created = 0;

  for (const lead of cold) {
    const serieId = randomUUID();
    const paradaMs = new Date(lead.parada_em).getTime();
    const nome = lead.nome ?? "cliente";
    const objetivo = lead.objetivo ?? "seu interesse";
    const empresa = lead.nome_fantasia ?? "nossa equipe";
    let scheduled = 0;

    for (let i = 0; i < config.etapas.length; i++) {
      const etapa = config.etapas[i];
      const when = new Date(paradaMs + etapa.horas_apos_parada * 60 * 60 * 1000);
      if (when.getTime() < Date.now() + 2 * 60 * 1000) continue;

      const text = applyCadenciaTemplate(etapa.mensagem, { nome, objetivo, empresa });
      await pool.query(
        `INSERT INTO crm_followup_mensagens
           (organization_id, lead_id, telefone, message_text, agendado_para,
            origin_hint, serie_id, etapa, criado_por)
         VALUES ($1::uuid, $2, $3, $4, $5::timestamptz, $6, $7::uuid, $8, 'cadencia')`,
        [
          organizationId,
          lead.id,
          lead.whatsapp_digits,
          text,
          when,
          `cadencia:${etapa.horas_apos_parada}h`,
          serieId,
          i + 1,
        ]
      );
      scheduled++;
    }

    if (scheduled > 0) {
      await pool.query(
        `UPDATE leads SET crm_cadencia_serie_id = $3::uuid, updated_at = NOW()
         WHERE id = $1 AND organization_id = $2::uuid`,
        [lead.id, organizationId, serieId]
      );
      created += scheduled;
    }
  }

  return created;
}

export async function processCadenciaAllOrgs(): Promise<number> {
  await ensureTables();
  const pool = getPool();
  const r = await pool.query<{ id: string }>(`SELECT id FROM organizations`);
  let total = 0;
  for (const row of r.rows) {
    try {
      total += await processCadenciaForOrg(row.id);
    } catch {
      /* org isolada */
    }
  }
  return total;
}

/** Limpa série quando todas mensagens enviadas/canceladas. */
export async function refreshCadenciaSeriesState(organizationId: string): Promise<void> {
  await ensureTables();
  const pool = getPool();
  await pool.query(
    `UPDATE leads l
     SET crm_cadencia_serie_id = NULL, updated_at = NOW()
     WHERE l.organization_id = $1::uuid
       AND l.crm_cadencia_serie_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM crm_followup_mensagens f
         WHERE f.lead_id = l.id AND f.serie_id = l.crm_cadencia_serie_id
           AND f.status IN ('pendente', 'enviando')
       )`,
    [organizationId]
  );
}

export async function refreshCadenciaSeriesAllOrgs(): Promise<void> {
  await ensureTables();
  const pool = getPool();
  const r = await pool.query<{ id: string }>(`SELECT id FROM organizations`);
  for (const row of r.rows) {
    await refreshCadenciaSeriesState(row.id).catch(() => {});
  }
}
