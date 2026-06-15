import { ensureTables, getPool } from "../db/index.js";
import { normalizePhoneDigits } from "../util/phone.js";
import type { WhatsappObjetivo } from "../services/whatsappAgentDefaults.js";

export type WhatsappInstanceRecord = {
  id: string;
  organization_id: string;
  instance_name: string;
  evolution_base_url: string;
  agent_ativo: boolean;
  agent_nome: string;
  agent_prompt: string;
  objetivos: WhatsappObjetivo[];
  status: string;
  delay_primeira_msg_minutos: number;
  created_at: string;
  updated_at: string;
};

export type UpsertWhatsappInstanceInput = {
  instance_name: string;
  evolution_base_url: string;
  agent_ativo?: boolean;
  agent_nome?: string;
  agent_prompt?: string;
  objetivos?: WhatsappObjetivo[];
  status?: string;
  delay_primeira_msg_minutos?: number;
};

export function clampDelayPrimeiraMsg(minutes: number | undefined | null): number {
  const n = Number(minutes);
  if (!Number.isFinite(n)) return 20;
  return Math.min(Math.max(Math.round(n), 0), 1440);
}

function rowToRecord(row: {
  id: string;
  organization_id: string;
  instance_name: string;
  evolution_base_url: string;
  agent_ativo: boolean;
  agent_nome: string;
  agent_prompt: string;
  objetivos: unknown;
  status: string;
  delay_primeira_msg_minutos: number;
  created_at: Date;
  updated_at: Date;
}): WhatsappInstanceRecord {
  const objetivos = Array.isArray(row.objetivos)
    ? (row.objetivos.filter((v) => typeof v === "string") as WhatsappObjetivo[])
    : [];
  return {
    id: row.id,
    organization_id: row.organization_id,
    instance_name: row.instance_name,
    evolution_base_url: row.evolution_base_url,
    agent_ativo: row.agent_ativo,
    agent_nome: row.agent_nome ?? "",
    agent_prompt: row.agent_prompt ?? "",
    objetivos,
    status: row.status,
    delay_primeira_msg_minutos: clampDelayPrimeiraMsg(row.delay_primeira_msg_minutos),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export async function getWhatsappInstanceForOrg(orgId: string): Promise<WhatsappInstanceRecord | null> {
  await ensureTables();
  const pool = getPool();
  const r = await pool.query(
    `SELECT id, organization_id, instance_name, evolution_base_url, agent_ativo,
            COALESCE(agent_nome, '') AS agent_nome, COALESCE(agent_prompt, '') AS agent_prompt,
            objetivos, status, COALESCE(delay_primeira_msg_minutos, 20) AS delay_primeira_msg_minutos,
            created_at, updated_at
     FROM whatsapp_instances WHERE organization_id = $1::uuid
     ORDER BY updated_at DESC LIMIT 1`,
    [orgId]
  );
  const row = r.rows[0];
  return row ? rowToRecord(row) : null;
}

export async function upsertWhatsappInstance(
  orgId: string,
  input: UpsertWhatsappInstanceInput
): Promise<WhatsappInstanceRecord> {
  await ensureTables();
  const pool = getPool();
  const instanceName = input.instance_name.trim();
  if (!instanceName) throw new Error("instance_name obrigatório");

  const delay = clampDelayPrimeiraMsg(input.delay_primeira_msg_minutos);

  const r = await pool.query(
    `INSERT INTO whatsapp_instances (
       organization_id, instance_name, evolution_base_url, agent_ativo,
       agent_nome, agent_prompt, objetivos, status, delay_primeira_msg_minutos, updated_at
     ) VALUES (
       $1::uuid, $2, $3, COALESCE($4, false), COALESCE($5, ''), COALESCE($6, ''),
       COALESCE($7::jsonb, '["link_produto","agendar_visita","handoff_humano"]'::jsonb),
       COALESCE($8, 'pending'), $9, NOW()
     )
     ON CONFLICT (organization_id, instance_name) DO UPDATE SET
       evolution_base_url = EXCLUDED.evolution_base_url,
       agent_ativo = COALESCE($4, whatsapp_instances.agent_ativo),
       agent_nome = COALESCE(NULLIF($5, ''), whatsapp_instances.agent_nome),
       agent_prompt = COALESCE($6, whatsapp_instances.agent_prompt),
       objetivos = COALESCE($7::jsonb, whatsapp_instances.objetivos),
       status = COALESCE($8, whatsapp_instances.status),
       delay_primeira_msg_minutos = $9,
       updated_at = NOW()
     RETURNING id, organization_id, instance_name, evolution_base_url, agent_ativo,
               agent_nome, agent_prompt, objetivos, status, delay_primeira_msg_minutos,
               created_at, updated_at`,
    [
      orgId,
      instanceName,
      input.evolution_base_url.trim(),
      input.agent_ativo ?? null,
      input.agent_nome ?? "",
      input.agent_prompt ?? "",
      input.objetivos ? JSON.stringify(input.objetivos) : null,
      input.status ?? null,
      delay,
    ]
  );
  return rowToRecord(r.rows[0]);
}

/** Sincroniza whatsapp_digits nos leads existentes (idempotente). */
export async function backfillLeadWhatsappDigits(orgId: string): Promise<number> {
  await ensureTables();
  const pool = getPool();
  const r = await pool.query(
    `UPDATE leads SET whatsapp_digits = regexp_replace(COALESCE(whatsapp, ''), '\\D', '', 'g'), updated_at = NOW()
     WHERE organization_id = $1::uuid AND whatsapp IS NOT NULL AND whatsapp <> ''
       AND (whatsapp_digits IS NULL OR whatsapp_digits = '')`,
    [orgId]
  );
  return r.rowCount ?? 0;
}

export async function syncLeadWhatsappDigits(leadId: number, whatsapp: string | null): Promise<void> {
  const digits = normalizePhoneDigits(whatsapp);
  await ensureTables();
  const pool = getPool();
  await pool.query(
    `UPDATE leads SET whatsapp_digits = $2, updated_at = NOW() WHERE id = $1`,
    [leadId, digits]
  );
}
