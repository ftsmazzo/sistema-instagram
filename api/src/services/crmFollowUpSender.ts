import type { FastifyBaseLogger } from "fastify";
import { canSendEvolutionAlert, resolveEvolutionBaseUrl, sendEvolutionText } from "./evolution.js";
import {
  claimDueCrmFollowUps,
  logWhatsappOutbound,
  markCrmFollowUpFailed,
  markCrmFollowUpSent,
} from "../store/crmFollowUpSchedule.js";
import { ensureTables, getPool } from "../db/index.js";

export async function processDueCrmFollowUps(log?: FastifyBaseLogger): Promise<number> {
  const due = await claimDueCrmFollowUps(15);
  if (due.length === 0) return 0;

  let sent = 0;
  for (const row of due) {
    const baseUrl = resolveEvolutionBaseUrl(row.evolution_base_url);
    if (!canSendEvolutionAlert(row.evolution_base_url)) {
      await markCrmFollowUpFailed(row.id, "Evolution não configurada na API.");
      continue;
    }

    try {
      await sendEvolutionText(row.instance_name, row.telefone, row.message_text, baseUrl);
      await logWhatsappOutbound({
        organizationId: row.organization_id,
        leadId: row.lead_id,
        telefone: row.telefone,
        messageText: row.message_text,
        instanceName: row.instance_name,
      });
      await markCrmFollowUpSent(row.id);

      await ensureTables();
      const pool = getPool();
      await pool.query(
        `UPDATE leads SET updated_at = NOW(),
                status = CASE WHEN status = 'novo' THEN 'em_conversa' ELSE status END
         WHERE id = $1 AND organization_id = $2::uuid`,
        [row.lead_id, row.organization_id]
      );

      sent++;
      log?.info({ followup_id: row.id, lead_id: row.lead_id }, "Follow-up WhatsApp enviado.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao enviar via Evolution.";
      await markCrmFollowUpFailed(row.id, msg);
      log?.error({ err, followup_id: row.id, lead_id: row.lead_id }, "Erro ao enviar follow-up WhatsApp.");
    }
  }

  return sent;
}
