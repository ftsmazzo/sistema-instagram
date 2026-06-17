import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { isDbConfigured } from "../db/index.js";
import { loadWorkspaceConfigStore, saveWorkspaceConfig } from "../store/workspace.js";
import { emptyEmpresa, type ContaInstagramInput, type EmpresaPerfil } from "../store/config.js";
import { toContaInstagramPublic } from "../util/instagramPublic.js";
import { buildMetaAuthorizeUrl, getMetaOAuthEnv, signMetaOAuthState } from "../services/metaOAuth.js";
import { buildMetaReadinessReport } from "../services/metaAppReadiness.js";

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
  app.get("/integrations/meta/oauth-url", async (request, reply) => {
    const env = getMetaOAuthEnv();
    if (!env) {
      return reply.status(503).send({
        error: "OAuth Meta não configurado. Defina META_APP_ID, META_APP_SECRET e META_OAUTH_REDIRECT_URI na API.",
      });
    }
    const u = request.user as { sub: string; orgId: string };
    const state = signMetaOAuthState(u.orgId, u.sub, env.stateSecret);
    const url = buildMetaAuthorizeUrl(env, state);
    return reply.send({ url });
  });

  /** Diagnóstico: por que clientes veem «Login indisponível» e o que falta no app Meta. */
  app.get("/integrations/meta/readiness", async (_request, reply) => {
    const report = await buildMetaReadinessReport();
    return reply.send(report);
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
