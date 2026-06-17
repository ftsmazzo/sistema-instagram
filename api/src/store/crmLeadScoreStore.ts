import { ensureTables, getPool } from "../db/index.js";
import { computeLeadScore } from "../services/crmLeadScore.js";
import type { LeadActivitySnapshot } from "../services/crmInsights.js";

/** Atualiza scores de leads ativos a partir de snapshots de atividade. */
export async function refreshLeadScores(
  organizationId: string,
  snapshots: LeadActivitySnapshot[]
): Promise<number> {
  if (snapshots.length === 0) return 0;
  await ensureTables();
  const pool = getPool();
  let updated = 0;

  for (const snap of snapshots) {
    const { score, label, motivo } = computeLeadScore(snap);
    const r = await pool.query(
      `UPDATE leads
       SET crm_score = $3, crm_score_label = $4, crm_score_motivo = $5, crm_score_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND organization_id = $2::uuid
         AND (crm_score IS DISTINCT FROM $3 OR crm_score_label IS DISTINCT FROM $4)`,
      [snap.id, organizationId, score, label, motivo]
    );
    updated += r.rowCount ?? 0;
  }

  return updated;
}

export async function refreshLeadScoresAllOrgs(
  fetchSnapshots: (orgId: string) => Promise<LeadActivitySnapshot[]>
): Promise<number> {
  await ensureTables();
  const pool = getPool();
  const r = await pool.query<{ id: string }>(`SELECT id FROM organizations`);
  let total = 0;
  for (const row of r.rows) {
    try {
      const snapshots = await fetchSnapshots(row.id);
      total += await refreshLeadScores(row.id, snapshots);
    } catch {
      /* org isolada */
    }
  }
  return total;
}
