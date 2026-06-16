import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { isDbConfigured } from "../db/index.js";
import { resolveAgentConfig } from "../store/agentConfig.js";
import { resolveWhatsappAgentConfig } from "../store/whatsappAgentConfig.js";
import {
  completeWhatsappBatch,
  enqueueWhatsappInbound,
  getWhatsappQueueStatus,
  processReadyWhatsappBatches,
} from "../store/whatsappInboundQueue.js";
import { isRedisConfigured, pingRedis } from "../services/redis.js";
import { getInternalSecretConfigured, verifyInternalSecret } from "../util/internalAuth.js";
import { AGENT_GRAPH_API_BASE, AGENT_GRAPH_API_VERSION, AGENT_TIMEZONE } from "../services/agentConfigDefaults.js";

function readHeaderSecret(request: { headers: Record<string, string | string[] | undefined> }): string | undefined {
  const raw =
    request.headers["x-internal-secret"] ??
    request.headers["X-Internal-Secret"] ??
    request.headers["x-internal-agent-secret"];
  return Array.isArray(raw) ? raw[0] : raw;
}

export async function internalRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  app.addHook("preHandler", async (request, reply) => {
    if (!getInternalSecretConfigured()) {
      return reply.status(503).send({
        ok: false,
        code: "INTERNAL_SECRET_NOT_CONFIGURED",
        error: "Defina INTERNAL_AGENT_API_SECRET na API e envie o mesmo valor no header X-Internal-Secret.",
      });
    }
    if (!verifyInternalSecret(readHeaderSecret(request))) {
      return reply.status(401).send({
        ok: false,
        code: "UNAUTHORIZED",
        error: "Header X-Internal-Secret inválido ou ausente.",
      });
    }
  });

  /**
   * Saúde do módulo interno (n8n pode pingar antes do webhook).
   * Não exige parâmetros além do segredo.
   */
  app.get("/health", async (_request, reply) => {
    const redisConfigured = isRedisConfigured();
    const redisOk = redisConfigured ? await pingRedis() : false;
    return reply.send({
      ok: true,
      service: "maquina-vendas-internal",
      database: isDbConfigured(),
      redis: { configured: redisConfigured, ok: redisOk },
      graph_api_version: AGENT_GRAPH_API_VERSION,
      graph_api_base: AGENT_GRAPH_API_BASE,
      timezone: AGENT_TIMEZONE,
      at: new Date().toISOString(),
    });
  });

  /**
   * Resolve tenant, credenciais Graph e prompts para o workflow n8n.
   *
   * Query:
   *   - ig_user_id — ID da conta no webhook (body.entry[0].id)
   *   - instagram_account_id — id interno da conta (alternativa para testes)
   *
   * HTTP:
   *   - 200 — conta encontrada (ver `ready` e `issues`)
   *   - 404 — conta não encontrada
   *   - 400 — parâmetros inválidos
   */
  app.get("/agent-config", async (request, reply) => {
    const q = request.query as { ig_user_id?: string; instagram_account_id?: string };
    const igUserId = typeof q.ig_user_id === "string" ? q.ig_user_id.trim() : "";
    const accountId = typeof q.instagram_account_id === "string" ? q.instagram_account_id.trim() : "";

    if (!igUserId && !accountId) {
      return reply.status(400).send({
        ok: false,
        code: "MISSING_LOOKUP",
        error: "Informe ig_user_id ou instagram_account_id na query string.",
        example: "/api/internal/agent-config?ig_user_id=17841477360043221",
      });
    }

    const result = await resolveAgentConfig({
      igUserId: igUserId || null,
      instagramAccountId: accountId || null,
    });

    if (!result.ok && result.code === "ACCOUNT_NOT_FOUND") {
      return reply.status(404).send(result);
    }

    if (!result.ok && result.code === "DATABASE_NOT_CONFIGURED") {
      return reply.status(503).send(result);
    }

    return reply.send(result);
  });

  /**
   * Resolve tenant, instância Evolution, lead e contexto para o agente WhatsApp (n8n).
   *
   * Query (informe ao menos um):
   *   - instance — nome da instância Evolution (webhook)
   *   - phone ou telefone — WhatsApp do lead (com ou sem 55)
   *   - organization_id — id da organização (testes)
   */
  app.get("/whatsapp-agent-config", async (request, reply) => {
    const q = request.query as {
      instance?: string;
      phone?: string;
      telefone?: string;
      organization_id?: string;
    };
    const instanceName = typeof q.instance === "string" ? q.instance.trim() : "";
    const phone = (typeof q.phone === "string" ? q.phone : typeof q.telefone === "string" ? q.telefone : "").trim();
    const organizationId = typeof q.organization_id === "string" ? q.organization_id.trim() : "";

    if (!instanceName && !phone && !organizationId) {
      return reply.status(400).send({
        ok: false,
        code: "MISSING_LOOKUP",
        error: "Informe instance, phone/telefone ou organization_id.",
        example: "/api/internal/whatsapp-agent-config?instance=maquina-vendas&phone=5516999998888",
      });
    }

    const result = await resolveWhatsappAgentConfig({
      instanceName: instanceName || null,
      phone: phone || null,
      organizationId: organizationId || null,
    });

    if (!result.ok && result.code === "TENANT_NOT_FOUND") {
      return reply.status(404).send(result);
    }

    if (!result.ok && result.code === "DATABASE_NOT_CONFIGURED") {
      return reply.status(503).send(result);
    }

    return reply.send(result);
  });

  /**
   * Enfileira mensagem inbound WhatsApp (Passo 1 — fila + debounce Redis).
   * O n8n webhook chama isto em vez de ir direto ao agente.
   */
  app.post("/whatsapp/enqueue", async (request, reply) => {
    const body = (request.body ?? {}) as {
      instance?: string;
      instance_name?: string;
      phone?: string;
      telefone?: string;
      message_text?: string;
      message_id_ext?: string;
    };

    const instanceName = String(body.instance_name ?? body.instance ?? "").trim();
    const phone = String(body.phone ?? body.telefone ?? "").trim();
    const messageText = String(body.message_text ?? "").trim();
    const messageIdExt = String(body.message_id_ext ?? "").trim() || null;

    if (!instanceName && !phone && !messageText) {
      return reply.status(400).send({
        ok: false,
        code: "MISSING_BODY",
        message:
          "Envie JSON no body (Content-Type: application/json) com instance, phone e message_text.",
        example: {
          instance: "Agente",
          phone: "5516999998888",
          message_text: "Boa noite",
          message_id_ext: "msg-001",
        },
      });
    }

    const result = await enqueueWhatsappInbound({
      instanceName,
      phone,
      messageText,
      messageIdExt,
    });

    if (!result.ok) {
      const status =
        result.code === "DATABASE_NOT_CONFIGURED"
          ? 503
          : result.code === "INSTANCE_NOT_FOUND"
            ? 404
            : 400;
      return reply.status(status).send(result);
    }

    return reply.send(result);
  });

  /**
   * Processa batches prontos (debounce expirado) — n8n cron chama e roda o agente 1x por batch.
   */
  app.post("/whatsapp/process-ready", async (request, reply) => {
    const body = (request.body ?? {}) as { limit?: number };
    const limit = typeof body.limit === "number" ? body.limit : undefined;
    const result = await processReadyWhatsappBatches({ limit });
    if (!result.ok) {
      const status = result.code === "DATABASE_NOT_CONFIGURED" ? 503 : 400;
      return reply.status(status).send(result);
    }
    return reply.send(result);
  });

  /**
   * Marca batch como concluído após resposta enviada (libera lock Redis).
   */
  app.post("/whatsapp/queue-complete", async (request, reply) => {
    const body = (request.body ?? {}) as { batch_key?: string; queue_ids?: number[] };
    const result = await completeWhatsappBatch({
      batchKey: body.batch_key,
      queueIds: body.queue_ids,
    });
    if (!result.ok) {
      const status = result.code === "DATABASE_NOT_CONFIGURED" ? 503 : 400;
      return reply.status(status).send(result);
    }
    return reply.send(result);
  });

  /**
   * Diagnóstico da fila por instância + telefone.
   */
  app.get("/whatsapp/queue-status", async (request, reply) => {
    const q = request.query as { instance?: string; phone?: string; telefone?: string };
    const instanceName = (q.instance ?? "").trim();
    const phone = (q.phone ?? q.telefone ?? "").trim();

    if (!instanceName || !phone) {
      return reply.status(400).send({
        ok: false,
        code: "MISSING_LOOKUP",
        error: "Informe instance e phone/telefone.",
        example: "/api/internal/whatsapp/queue-status?instance=Agente&phone=5516999998888",
      });
    }

    const result = await getWhatsappQueueStatus({ instanceName, phone });
    if (!result.ok) {
      const status = result.code === "INSTANCE_NOT_FOUND" ? 404 : 400;
      return reply.status(status).send(result);
    }

    return reply.send(result);
  });
}
