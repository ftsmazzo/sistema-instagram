import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { isDbConfigured } from "../db/index.js";
import {
  createEvolutionInstance,
  findInstanceWebhook,
  getEvolutionConnectQr,
  getEvolutionEnv,
  getEvolutionInstanceStatus,
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
    const evolutionConfigured = isEvolutionConfigured();

    let connection: Awaited<ReturnType<typeof getEvolutionInstanceStatus>> | null = null;
    let webhookOk = false;

    if (evolutionConfigured && instance?.instance_name?.trim()) {
      const baseUrl = resolveEvolutionBaseUrl(instance.evolution_base_url);
      try {
        connection = await getEvolutionInstanceStatus(instance.instance_name, baseUrl);
        const wh = await findInstanceWebhook(instance.instance_name, baseUrl);
        const expected = getEvolutionEnv()?.webhookUrl ?? "";
        webhookOk = Boolean(wh?.enabled && wh.url && expected && wh.url === expected);
      } catch (err) {
        request.log.warn({ err }, "Falha ao consultar conexão Evolution (ignorado no GET /whatsapp).");
      }
    }

    return reply.send({
      instance,
      evolution_configured: evolutionConfigured,
      connection: connection
        ? {
            state: connection.state,
            profile_name: connection.profile_name,
            phone_number: connection.phone_number,
            profile_picture_url: connection.profile_picture_url,
            webhook_ok: webhookOk,
          }
        : null,
    });
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

    const existing = await getWhatsappInstanceForOrg(u.orgId);
    const instanceName = (body.instance_name ?? existing?.instance_name ?? "").trim();
    const evolutionBaseUrl =
      resolveEvolutionBaseUrl(body.evolution_base_url) ||
      resolveEvolutionBaseUrl(existing?.evolution_base_url);

    if (!instanceName) {
      return reply.status(400).send({ error: "Informe o nome da instância ou conecte o WhatsApp primeiro." });
    }
    if (!evolutionBaseUrl) {
      return reply.status(400).send({
        error:
          "Evolution não configurada no servidor. Defina EVOLUTION_BASE_URL na API.",
      });
    }

    const instance = await upsertWhatsappInstance(u.orgId, {
      instance_name: instanceName,
      evolution_base_url: evolutionBaseUrl,
      agent_ativo: body.agent_ativo,
      agent_nome: body.agent_nome,
      agent_prompt: body.agent_prompt,
      objetivos: body.objetivos,
      status: body.status ?? existing?.status,
      delay_primeira_msg_minutos: body.delay_primeira_msg_minutos,
    });

    return reply.send({ saved: true, instance });
  });

  /**
   * Conexão inteligente: cria instância na Evolution, sincroniza webhook e retorna QR.
   */
  app.post("/whatsapp/connect", async (request, reply) => {
    const u = request.user as { orgId: string };
    if (!isEvolutionConfigured()) {
      return reply.status(503).send({
        ok: false,
        error:
          "Evolution não configurada no servidor. Defina EVOLUTION_BASE_URL, EVOLUTION_GLOBAL_API_KEY e N8N_WEBHOOK_WHATSAPP_EVOLUTION.",
      });
    }

    const body = (request.body ?? {}) as { instance_name?: string };
    const instanceName = (body.instance_name ?? "").trim();
    if (!instanceName) {
      return reply.status(400).send({ ok: false, error: "Informe o nome da instância." });
    }
    if (!/^[a-zA-Z0-9_-]{2,64}$/.test(instanceName)) {
      return reply.status(400).send({
        ok: false,
        error: "Nome inválido. Use apenas letras, números, hífen e underscore (2–64 caracteres).",
      });
    }

    const env = getEvolutionEnv()!;
    const baseUrl = env.baseUrl;
    const existing = await getWhatsappInstanceForOrg(u.orgId);

    try {
      await upsertWhatsappInstance(u.orgId, {
        instance_name: instanceName,
        evolution_base_url: baseUrl,
        agent_ativo: existing?.agent_ativo ?? false,
        agent_nome: existing?.agent_nome ?? "",
        agent_prompt: existing?.agent_prompt ?? "",
        objetivos: existing?.objetivos,
        status: "connecting",
        delay_primeira_msg_minutos: existing?.delay_primeira_msg_minutos,
      });

      await createEvolutionInstance(instanceName, baseUrl);
      await setInstanceWebhook(instanceName, { baseUrl });

      const status = await getEvolutionInstanceStatus(instanceName, baseUrl);
      let qr = { qr_base64: null as string | null, qr_code: null as string | null, pairing_code: null as string | null };

      if (status.state !== "open") {
        qr = await getEvolutionConnectQr(instanceName, baseUrl);
      } else {
        await upsertWhatsappInstance(u.orgId, {
          instance_name: instanceName,
          evolution_base_url: baseUrl,
          status: "connected",
        });
      }

      return reply.send({
        ok: true,
        instance_name: instanceName,
        connection_state: status.state,
        profile_name: status.profile_name,
        phone_number: status.phone_number,
        profile_picture_url: status.profile_picture_url,
        qr_base64: qr.qr_base64,
        qr_code: qr.qr_code,
        pairing_code: qr.pairing_code,
        webhook_synced: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao iniciar conexão WhatsApp.";
      request.log.warn({ err, instance_name: instanceName }, "whatsapp/connect falhou");
      return reply.status(502).send({ ok: false, error: message });
    }
  });

  /** Atualiza QR (expira ~30s) ou consulta status da conexão. */
  app.get("/whatsapp/connection", async (request, reply) => {
    const u = request.user as { orgId: string };
    if (!isEvolutionConfigured()) {
      return reply.status(503).send({ ok: false, error: "Evolution não configurada no servidor." });
    }

    const instance = await getWhatsappInstanceForOrg(u.orgId);
    if (!instance?.instance_name?.trim()) {
      return reply.send({
        ok: true,
        configured: false,
        instance_name: null,
        connection_state: "close",
      });
    }

    const baseUrl = resolveEvolutionBaseUrl(instance.evolution_base_url);
    const q = request.query as { refresh_qr?: string };

    try {
      const status = await getEvolutionInstanceStatus(instance.instance_name, baseUrl);
      let qr = { qr_base64: null as string | null, qr_code: null as string | null, pairing_code: null as string | null };

      if (status.state !== "open" && (q.refresh_qr === "1" || status.state === "connecting")) {
        qr = await getEvolutionConnectQr(instance.instance_name, baseUrl);
      }

      const dbStatus =
        status.state === "open" ? "connected" : status.state === "connecting" ? "connecting" : "disconnected";

      if (dbStatus !== instance.status) {
        await upsertWhatsappInstance(u.orgId, {
          instance_name: instance.instance_name,
          evolution_base_url: baseUrl,
          status: dbStatus,
        });
      }

      const wh = await findInstanceWebhook(instance.instance_name, baseUrl);
      const expected = getEvolutionEnv()?.webhookUrl ?? "";

      return reply.send({
        ok: true,
        configured: true,
        instance_name: instance.instance_name,
        connection_state: status.state,
        profile_name: status.profile_name,
        phone_number: status.phone_number,
        profile_picture_url: status.profile_picture_url,
        webhook_ok: Boolean(wh?.enabled && wh.url && expected && wh.url === expected),
        qr_base64: qr.qr_base64,
        qr_code: qr.qr_code,
        pairing_code: qr.pairing_code,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao consultar conexão.";
      return reply.status(502).send({ ok: false, error: message });
    }
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
      let current = null;
      try {
        current = await findInstanceWebhook(instance.instance_name, baseUrl);
      } catch (findErr) {
        request.log.warn({ err: findErr }, "Webhook aplicado; falha ao ler webhook/find (ignorado).");
      }
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
      request.log.warn(
        { err, instance_name: instance.instance_name, evolution_base_url: baseUrl },
        "sync-webhook Evolution falhou"
      );
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
