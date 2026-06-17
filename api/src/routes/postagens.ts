import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { isDbConfigured } from "../db/index.js";
import { listPostagens, syncPostagensFromInstagram } from "../store/crmPostagens.js";

export async function postagensRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  app.addHook("preHandler", async (request, reply) => {
    if (!isDbConfigured()) {
      return reply.status(503).send({ error: "Banco não configurado." });
    }
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: "Não autorizado. Faça login." });
    }
  });

  /** Lista posts sincronizados (CRM) do workspace. */
  app.get("/", async (request, reply) => {
    const u = request.user as { orgId: string };
    const q = request.query as {
      limit?: string;
      offset?: string;
      instagram_account_id?: string;
    };

    const result = await listPostagens({
      organizationId: u.orgId,
      limit: q.limit ? Number(q.limit) : 50,
      offset: q.offset ? Number(q.offset) : 0,
      instagramAccountId: q.instagram_account_id ?? null,
    });

    return reply.send(result);
  });

  /** Sincroniza posts da conta Instagram via Graph API → tabela postagens. */
  app.post("/sync", async (request, reply) => {
    const u = request.user as { orgId: string };
    const body = (request.body ?? {}) as {
      instagram_account_id?: string;
      limit?: number;
    };

    try {
      const result = await syncPostagensFromInstagram({
        organizationId: u.orgId,
        instagramAccountId: body.instagram_account_id ?? null,
        limit: body.limit ?? 50,
      });
      return reply.send({ ok: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao sincronizar posts.";
      request.log.warn({ err }, "sync postagens falhou");
      return reply.status(400).send({ ok: false, error: message });
    }
  });
}
