import type { FastifyInstance } from "fastify";
import { getPool, isDbConfigured } from "../db/index.js";
import { publishToInstagram, publishCarouselToInstagram } from "./instagram.js";
import { updateAgendadoStatus } from "../store/agendados.js";
import { appendCronograma } from "../store/cronograma.js";
import { upsertPostagemFromPostador } from "../store/crmPostagens.js";
import { processDueCrmFollowUps } from "./crmFollowUpSender.js";
import { processCadenciaAllOrgs, refreshCadenciaSeriesAllOrgs } from "../store/crmCadencia.js";
import { processConsultorAlerts } from "./crmConsultorAlerts.js";
import { refreshLeadScoresAllOrgs } from "../store/crmLeadScoreStore.js";
import { getLeadActivitySnapshots } from "../store/crmOperacao.js";

export function startCronJob(fastify: FastifyInstance) {
  if (!isDbConfigured()) {
    fastify.log.info("Cron job não iniciado: sem banco de dados configurado.");
    return;
  }

  fastify.log.info("Cron job de agendamentos iniciado (verificação a cada 1 minuto).");

  setInterval(async () => {
    try {
      const sentFollowUps = await processDueCrmFollowUps(fastify.log);
      if (sentFollowUps > 0) {
        fastify.log.info({ count: sentFollowUps }, "Follow-ups WhatsApp CRM enviados.");
      }
    } catch (err) {
      fastify.log.error({ err }, "Erro no job de follow-ups WhatsApp.");
    }

    try {
      await refreshCadenciaSeriesAllOrgs();
      const cadencia = await processCadenciaAllOrgs();
      if (cadencia > 0) {
        fastify.log.info({ count: cadencia }, "Mensagens de cadência CRM agendadas.");
      }
    } catch (err) {
      fastify.log.error({ err }, "Erro no job de cadência CRM.");
    }

    try {
      const alerts = await processConsultorAlerts(fastify.log);
      if (alerts > 0) {
        fastify.log.info({ count: alerts }, "Alertas CRM enviados ao consultor.");
      }
    } catch (err) {
      fastify.log.error({ err }, "Erro no job de alertas consultor.");
    }

    try {
      const scored = await refreshLeadScoresAllOrgs(getLeadActivitySnapshots);
      if (scored > 0) {
        fastify.log.info({ count: scored }, "Scores CRM de leads atualizados.");
      }
    } catch (err) {
      fastify.log.error({ err }, "Erro no job de score CRM.");
    }

    try {
      const pool = getPool();
      
      const res = await pool.query(`
        SELECT a.id, a.caption, a.media_url, a.media_urls, a.media_type, a.conta_id,
               c.access_token, c.ig_user_id, c.organization_id
        FROM postador_agendados a
        JOIN instagram_accounts c ON a.conta_id = c.id
        WHERE a.status = 'pendente' 
          AND a.data_agendamento IS NOT NULL 
          AND a.data_agendamento <= now()
      `);

      for (const row of res.rows) {
        fastify.log.info({ agendado_id: row.id }, "Publicando post agendado...");
        await updateAgendadoStatus(row.id, "processing");

        try {
          const isCarousel = row.media_type === "CAROUSEL";
          let result;
          
          if (isCarousel) {
            const urls = typeof row.media_urls === "string" ? JSON.parse(row.media_urls) : row.media_urls;
            result = await publishCarouselToInstagram(row.caption, urls, row.access_token, row.ig_user_id);
          } else {
            result = await publishToInstagram(row.caption, row.media_url, row.media_type, row.access_token, row.ig_user_id);
          }

          const dataPost = new Date().toISOString();
          
          await appendCronograma({
            caption: row.caption,
            media_url: isCarousel ? null : row.media_url,
            media_type: row.media_type,
            id_container: result.id_container,
            link_post: result.link_post,
            data_post: dataPost,
            organization_id: row.organization_id,
          });

          const mediaUrlsArr = typeof row.media_urls === "string" ? JSON.parse(row.media_urls) : row.media_urls;

          await upsertPostagemFromPostador({
            organizationId: row.organization_id,
            instagramAccountId: row.conta_id,
            idPost: result.id_media,
            caption: row.caption,
            mediaType: row.media_type,
            mediaUrl: isCarousel ? (mediaUrlsArr?.[0] ?? null) : row.media_url,
            linkPost: result.link_post,
            dataPost: dataPost,
          });

          await updateAgendadoStatus(row.id, "published");
          fastify.log.info({ agendado_id: row.id, link: result.link_post }, "Post agendado publicado com sucesso!");
        } catch (err) {
          fastify.log.error({ err, agendado_id: row.id }, "Erro ao publicar post agendado.");
          await updateAgendadoStatus(row.id, "failed");
        }
      }
    } catch (err) {
      fastify.log.error({ err }, "Erro no job de agendamentos.");
    }
  }, 60000); // Roda a cada 60 segundos
}
