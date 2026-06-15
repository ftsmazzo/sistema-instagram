import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { isDbConfigured } from "../db/index.js";
import { resolveAgentConfig } from "../store/agentConfig.js";
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
}
