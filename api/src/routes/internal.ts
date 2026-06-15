import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { isDbConfigured } from "../db/index.js";
import { resolveAgentConfig } from "../store/agentConfig.js";
import { resolveWhatsappAgentConfig } from "../store/whatsappAgentConfig.js";
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
    return reply.send({
      ok: true,
      service: "maquina-vendas-internal",
      database: isDbConfigured(),
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
}
