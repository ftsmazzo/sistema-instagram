import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { isDbConfigured } from "../db/index.js";
import {
  findInstanceWebhook,
  getEvolutionEnv,
  isEvolutionConfigured,
  resolveEvolutionBaseUrl,
  setInstanceWebhook,
} from "../services/evolution.js";
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
      delay_primeira_msg_minutos?: number;
    };

    const instanceName = (body.instance_name ?? "").trim();
    const evolutionBaseUrl =
      resolveEvolutionBaseUrl(body.evolution_base_url) ||
      resolveEvolutionBaseUrl((await getWhatsappInstanceForOrg(u.orgId))?.evolution_base_url);
    if (!instanceName) {
      return reply.status(400).send({ error: "instance_name é obrigatório." });
    }
    if (!evolutionBaseUrl) {
      return reply.status(400).send({
        error:
          "evolution_base_url é obrigatório (ou defina EVOLUTION_BASE_URL na API para Evolution central).",
      });
    }

    const instance = await upsertWhatsappInstance(u.orgId, {
      instance_name: instanceName,
      evolution_base_url: evolutionBaseUrl,
      agent_ativo: body.agent_ativo,
      agent_nome: body.agent_nome,
      agent_prompt: body.agent_prompt,
      objetivos: body.objetivos,
      status: body.status,
      delay_primeira_msg_minutos: body.delay_primeira_msg_minutos,
    });

    return reply.send({ saved: true, instance });
  });

  /**
   * Configura webhook da instância na Evolution Central → n8n (whatsapp-evolution).
   * Requer EVOLUTION_BASE_URL, EVOLUTION_GLOBAL_API_KEY e N8N_WEBHOOK_WHATSAPP_EVOLUTION na API.
   */
  app.post("/whatsapp/sync-webhook", async (request, reply) => {
    const u = request.user as { orgId: string };
    if (!isEvolutionConfigured()) {
      return reply.status(503).send({
        ok: false,
        error:
          "Evolution central não configurada na API. Defina EVOLUTION_BASE_URL, EVOLUTION_GLOBAL_API_KEY e N8N_WEBHOOK_WHATSAPP_EVOLUTION.",
      });
    }

    const instance = await getWhatsappInstanceForOrg(u.orgId);
    if (!instance?.instance_name?.trim()) {
      return reply.status(400).send({
        ok: false,
        error: "Salve antes o nome da instância WhatsApp (campo Nome da instância).",
      });
    }

    const baseUrl = resolveEvolutionBaseUrl(instance.evolution_base_url);
    const env = getEvolutionEnv()!;

    try {
      const applied = await setInstanceWebhook(instance.instance_name, { baseUrl });
      const current = await findInstanceWebhook(instance.instance_name, baseUrl);
      return reply.send({
        ok: true,
        instance_name: instance.instance_name,
        evolution_base_url: baseUrl,
        webhook_url_expected: env.webhookUrl,
        applied,
        current,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao configurar webhook na Evolution.";
      return reply.status(502).send({ ok: false, error: message });
    }
  });

  /** Lê webhook atual da instância na Evolution (diagnóstico). */
  app.get("/whatsapp/webhook", async (request, reply) => {
    const u = request.user as { orgId: string };
    if (!isEvolutionConfigured()) {
      return reply.status(503).send({
        ok: false,
        error: "Evolution central não configurada na API.",
      });
    }

    const instance = await getWhatsappInstanceForOrg(u.orgId);
    if (!instance?.instance_name?.trim()) {
      return reply.status(400).send({ ok: false, error: "Nenhuma instância WhatsApp configurada." });
    }

    const baseUrl = resolveEvolutionBaseUrl(instance.evolution_base_url);
    try {
      const current = await findInstanceWebhook(instance.instance_name, baseUrl);
      return reply.send({
        ok: true,
        instance_name: instance.instance_name,
        evolution_base_url: baseUrl,
        webhook_url_expected: getEvolutionEnv()?.webhookUrl ?? null,
        current,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao consultar webhook na Evolution.";
      return reply.status(502).send({ ok: false, error: message });
    }
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
