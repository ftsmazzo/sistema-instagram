import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { isDbConfigured } from "../db/index.js";
import { loadWorkspaceConfigStore, saveWorkspaceConfig } from "../store/workspace.js";
import { emptyEmpresa, type ContaInstagramInput, type EmpresaPerfil } from "../store/config.js";
import { toContaInstagramPublic } from "../util/instagramPublic.js";

export async function meWorkspaceRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
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

  /** URL do Facebook Login para conectar páginas Instagram ao app Meta da FabriaIA. */
  app.get("/integrations/meta/oauth-url", async (_request, reply) => {
    return reply.status(410).send({
      error:
        "Conexão OAuth Meta foi desativada no painel. Use Administração → Adicionar conta (token + ig_user_id).",
    });
  });

  app.get("/integrations/meta/readiness", async (_request, reply) => {
    return reply.status(410).send({
      error: "Diagnóstico OAuth Meta desativado. Cadastre contas em Administração → Adicionar conta.",
    });
  });

  app.get("/workspace", async (request, reply) => {
    const u = request.user as { orgId: string };
    const config = await loadWorkspaceConfigStore(u.orgId);
    const contas = config.contas_instagram.map(toContaInstagramPublic);
    return reply.send({
      empresa: config.empresa ?? emptyEmpresa(),
      contas_instagram: contas,
      instagram_default_id: config.instagram_default_id ?? null,
      instagram: contas[0]
        ? { connected: Boolean(contas[0].has_token), ig_user_id: contas[0].ig_user_id }
        : { connected: false },
    });
  });

  app.put("/workspace", async (request, reply) => {
    const u = request.user as { orgId: string };
    const body = request.body as {
      empresa?: Partial<EmpresaPerfil>;
      contas_instagram?: ContaInstagramInput[];
      instagram_default_id?: string | null;
    };
    const update: Parameters<typeof saveWorkspaceConfig>[1] = {};
    if (body.empresa && typeof body.empresa === "object") {
      update.empresa = body.empresa;
    }
    if (body.instagram_default_id !== undefined) {
      update.instagram_default_id = body.instagram_default_id ?? null;
    }
    if (body.contas_instagram) {
      update.contas_instagram = body.contas_instagram;
    }
    try {
      const saved = await saveWorkspaceConfig(u.orgId, update);
      const contas = saved.contas_instagram.map(toContaInstagramPublic);
      return reply.send({
        saved: true,
        received: {
          empresa: saved.empresa,
          contas_instagram: contas,
          instagram_default_id: saved.instagram_default_id,
          instagram: contas[0]
            ? { connected: Boolean(contas[0].has_token), ig_user_id: contas[0].ig_user_id }
            : { connected: false },
        },
      });
    } catch (err) {
      app.log.error({ err }, "me workspace put");
      const msg = err instanceof Error ? err.message : "Erro ao salvar.";
      return reply.status(400).send({ error: msg });
    }
  });
}
