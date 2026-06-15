import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { isDbConfigured } from "../db/index.js";
import { listLeads } from "../store/leads.js";
import {
  backfillLeadWhatsappDigits,
  getWhatsappInstanceForOrg,
  upsertWhatsappInstance,
} from "../store/whatsappInstance.js";
import type { WhatsappObjetivo } from "../services/whatsappAgentDefaults.js";

export async function agentesRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
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

  /** Lista leads do workspace (CRM). */
  app.get("/leads", async (request, reply) => {
    const u = request.user as { orgId: string };
    const q = request.query as {
      limit?: string;
      offset?: string;
      status?: string;
      with_whatsapp?: string;
    };

    await backfillLeadWhatsappDigits(u.orgId);

    const result = await listLeads({
      organizationId: u.orgId,
      limit: q.limit ? Number(q.limit) : 50,
      offset: q.offset ? Number(q.offset) : 0,
      status: q.status ?? null,
      withWhatsappOnly: q.with_whatsapp === "1" || q.with_whatsapp === "true",
    });

    return reply.send(result);
  });

  /** Configuração da instância WhatsApp / Evolution do workspace. */
  app.get("/whatsapp", async (request, reply) => {
    const u = request.user as { orgId: string };
    const instance = await getWhatsappInstanceForOrg(u.orgId);
    return reply.send({ instance });
  });

  app.put("/whatsapp", async (request, reply) => {
    const u = request.user as { orgId: string };
    const body = request.body as {
      instance_name?: string;
      evolution_base_url?: string;
      agent_ativo?: boolean;
      agent_nome?: string;
      agent_prompt?: string;
      objetivos?: WhatsappObjetivo[];
      status?: string;
    };

    const instanceName = (body.instance_name ?? "").trim();
    const evolutionBaseUrl = (body.evolution_base_url ?? "").trim();
    if (!instanceName) {
      return reply.status(400).send({ error: "instance_name é obrigatório." });
    }
    if (!evolutionBaseUrl) {
      return reply.status(400).send({ error: "evolution_base_url é obrigatório." });
    }

    const instance = await upsertWhatsappInstance(u.orgId, {
      instance_name: instanceName,
      evolution_base_url: evolutionBaseUrl,
      agent_ativo: body.agent_ativo,
      agent_nome: body.agent_nome,
      agent_prompt: body.agent_prompt,
      objetivos: body.objetivos,
      status: body.status,
    });

    return reply.send({ saved: true, instance });
  });

  /** Resumo de config dos agentes (Instagram + WhatsApp). */
  app.get("/config", async (request, reply) => {
    const u = request.user as { orgId: string };
    const instance = await getWhatsappInstanceForOrg(u.orgId);
    return reply.send({
      whatsapp: {
        ativo: Boolean(instance?.agent_ativo),
        instance_name: instance?.instance_name ?? null,
        evolution_base_url: instance?.evolution_base_url ?? null,
        objetivos: instance?.objetivos ?? [],
      },
    });
  });
}
