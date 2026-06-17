import { ensureTables, getPool } from "../db/index.js";

export type LeadListItem = {
  id: number;
  nome: string | null;
  whatsapp: string | null;
  username_instagram: string | null;
  objetivo: string | null;
  status: string;
  id_post_origem: string | null;
  origem_interacao: string | null;
  url_interesse: string | null;
  handoff_at: string | null;
  handoff_motivo: string | null;
  whatsapp_boas_vindas_enviado: boolean;
  whatsapp_primeira_ia_enviada: boolean;
  whatsapp_ia_agendada_em: string | null;
  whatsapp_boas_vindas_em: string | null;
  created_at: string;
  updated_at: string;
  crm_notas: string | null;
  proximo_followup_em: string | null;
  crm_score: number | null;
  crm_score_label: string | null;
  crm_score_motivo: string | null;
  crm_score_at: string | null;
};

export type ListLeadsParams = {
  organizationId: string;
  limit?: number;
  offset?: number;
  status?: string | null;
  withWhatsappOnly?: boolean;
};

export async function listLeads(params: ListLeadsParams): Promise<{ leads: LeadListItem[]; total: number }> {
  await ensureTables();
  const pool = getPool();
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);

  const conditions = ["organization_id = $1::uuid"];
  const values: unknown[] = [params.organizationId];
  let idx = 2;

  if (params.status?.trim()) {
    conditions.push(`status = $${idx++}`);
    values.push(params.status.trim());
  }
  if (params.withWhatsappOnly) {
    conditions.push(`(whatsapp IS NOT NULL AND whatsapp <> '')`);
  }

  const where = conditions.join(" AND ");

  const countR = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM leads WHERE ${where}`,
    values
  );
  const total = Number(countR.rows[0]?.n ?? 0);

  values.push(limit, offset);
  const r = await pool.query(
    `SELECT id, nome, whatsapp, username_instagram, objetivo, status,
            id_post_origem, origem_interacao, url_interesse,
            handoff_at, handoff_motivo, whatsapp_boas_vindas_enviado,
            whatsapp_primeira_ia_enviada, whatsapp_ia_agendada_em, whatsapp_boas_vindas_em,
            crm_notas, proximo_followup_em, crm_score, crm_score_label, crm_score_motivo, crm_score_at,
            created_at, updated_at
     FROM leads WHERE ${where}
     ORDER BY crm_score DESC NULLS LAST, updated_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    values
  );

  const leads: LeadListItem[] = r.rows.map((row) => ({
    id: row.id,
    nome: row.nome,
    whatsapp: row.whatsapp,
    username_instagram: row.username_instagram,
    objetivo: row.objetivo,
    status: row.status ?? "novo",
    id_post_origem: row.id_post_origem,
    origem_interacao: row.origem_interacao,
    url_interesse: row.url_interesse,
    handoff_at: row.handoff_at ? new Date(row.handoff_at).toISOString() : null,
    handoff_motivo: row.handoff_motivo,
    whatsapp_boas_vindas_enviado: Boolean(row.whatsapp_boas_vindas_enviado),
    whatsapp_primeira_ia_enviada: Boolean(row.whatsapp_primeira_ia_enviada),
    whatsapp_ia_agendada_em: row.whatsapp_ia_agendada_em
      ? new Date(row.whatsapp_ia_agendada_em).toISOString()
      : null,
    whatsapp_boas_vindas_em: row.whatsapp_boas_vindas_em
      ? new Date(row.whatsapp_boas_vindas_em).toISOString()
      : null,
    crm_notas: row.crm_notas ?? null,
    proximo_followup_em: row.proximo_followup_em
      ? new Date(row.proximo_followup_em).toISOString()
      : null,
    crm_score: row.crm_score != null ? Number(row.crm_score) : null,
    crm_score_label: row.crm_score_label ?? null,
    crm_score_motivo: row.crm_score_motivo ?? null,
    crm_score_at: row.crm_score_at ? new Date(row.crm_score_at).toISOString() : null,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  }));

  return { leads, total };
}

const LEAD_STATUSES = new Set([
  "novo",
  "em_conversa",
  "qualificado",
  "handoff",
  "convertido",
  "perdido",
]);

export type UpdateLeadCrmInput = {
  organizationId: string;
  leadId: number;
  status?: string | null;
  crm_notas?: string | null;
  proximo_followup_em?: string | null;
};

export async function updateLeadCrm(input: UpdateLeadCrmInput): Promise<LeadListItem | null> {
  await ensureTables();
  const pool = getPool();

  const sets: string[] = ["updated_at = NOW()"];
  const values: unknown[] = [input.leadId, input.organizationId];
  let idx = 3;
  let changed = false;

  if (input.status !== undefined && input.status !== null) {
    const st = input.status.trim();
    if (!LEAD_STATUSES.has(st)) {
      throw new Error(`Status inválido: ${st}`);
    }
    sets.push(`status = $${idx++}`);
    values.push(st);
    changed = true;
  }
  if (input.crm_notas !== undefined) {
    sets.push(`crm_notas = $${idx++}`);
    values.push(input.crm_notas?.trim() || null);
    changed = true;
  }
  if (input.proximo_followup_em !== undefined) {
    if (input.proximo_followup_em === null || input.proximo_followup_em === "") {
      sets.push(`proximo_followup_em = NULL`);
    } else {
      const d = new Date(input.proximo_followup_em);
      if (!Number.isFinite(d.getTime())) throw new Error("Data de follow-up inválida.");
      sets.push(`proximo_followup_em = $${idx++}`);
      values.push(d);
    }
    changed = true;
  }

  if (!changed) return null;

  const r = await pool.query(
    `UPDATE leads SET ${sets.join(", ")}
     WHERE id = $1 AND organization_id = $2::uuid
     RETURNING id, nome, whatsapp, username_instagram, objetivo, status,
               id_post_origem, origem_interacao, url_interesse,
               handoff_at, handoff_motivo, whatsapp_boas_vindas_enviado,
               whatsapp_primeira_ia_enviada, whatsapp_ia_agendada_em, whatsapp_boas_vindas_em,
               crm_notas, proximo_followup_em, crm_score, crm_score_label, crm_score_motivo, crm_score_at,
               created_at, updated_at`,
    values
  );
  const row = r.rows[0];
  if (!row) return null;

  return {
    id: row.id,
    nome: row.nome,
    whatsapp: row.whatsapp,
    username_instagram: row.username_instagram,
    objetivo: row.objetivo,
    status: row.status ?? "novo",
    id_post_origem: row.id_post_origem,
    origem_interacao: row.origem_interacao,
    url_interesse: row.url_interesse,
    handoff_at: row.handoff_at ? new Date(row.handoff_at).toISOString() : null,
    handoff_motivo: row.handoff_motivo,
    whatsapp_boas_vindas_enviado: Boolean(row.whatsapp_boas_vindas_enviado),
    whatsapp_primeira_ia_enviada: Boolean(row.whatsapp_primeira_ia_enviada),
    whatsapp_ia_agendada_em: row.whatsapp_ia_agendada_em
      ? new Date(row.whatsapp_ia_agendada_em).toISOString()
      : null,
    whatsapp_boas_vindas_em: row.whatsapp_boas_vindas_em
      ? new Date(row.whatsapp_boas_vindas_em).toISOString()
      : null,
    crm_notas: row.crm_notas ?? null,
    proximo_followup_em: row.proximo_followup_em
      ? new Date(row.proximo_followup_em).toISOString()
      : null,
    crm_score: row.crm_score != null ? Number(row.crm_score) : null,
    crm_score_label: row.crm_score_label ?? null,
    crm_score_motivo: row.crm_score_motivo ?? null,
    crm_score_at: row.crm_score_at ? new Date(row.crm_score_at).toISOString() : null,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  };
}
