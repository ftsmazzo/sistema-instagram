import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { isDbConfigured } from "../db/index.js";
import {
  createEvolutionInstance,
  deleteEvolutionInstance,
  findInstanceWebhook,
  getEvolutionConnectQr,
  getEvolutionEnv,
  getEvolutionInstanceStatus,
  isEvolutionConfigured,
  logoutEvolutionInstance,
  resolveEvolutionBaseUrl,
  setInstanceWebhook,
} from "../services/evolution.js";
import { listLeads } from "../store/leads.js";
import { getFunnelStats, getLeadTimeline, getOperacaoHealth } from "../store/crmOperacao.js";
import {
  backfillLeadWhatsappDigits,
  getWhatsappInstanceForOrg,
  removeWhatsappInstanceForOrg,
  upsertWhatsappInstance,
  WhatsappInstanceNameTakenError,
} from "../store/whatsappInstance.js";
import type { WhatsappObjetivo } from "../services/whatsappAgentDefaults.js";
import { parseAgendaConfig } from "../services/empresaConfigHelpers.js";
import type { EmpresaPerfil } from "../store/config.js";
import { loadWorkspaceConfigStore, saveWorkspaceConfig } from "../store/workspace.js";

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

  /** KPIs do funil (comentários → Direct → WhatsApp → handoff). */
  app.get("/funnel", async (request, reply) => {
    const u = request.user as { orgId: string };
    const q = request.query as { days?: string };
    const days = q.days ? Number(q.days) : 30;
    const stats = await getFunnelStats(u.orgId, days);
    return reply.send({ ok: true, ...stats });
  });

  /** Saúde operacional (tokens, agentes, Evolution). */
  app.get("/operacao/health", async (request, reply) => {
    const u = request.user as { orgId: string };
    const health = await getOperacaoHealth(u.orgId);
    return reply.send(health);
  });

  /** Timeline unificada de um lead (comentário + Direct + WhatsApp). */
  app.get<{ Params: { id: string } }>("/leads/:id/timeline", async (request, reply) => {
    const u = request.user as { orgId: string };
    const leadId = Number(request.params.id);
    if (!Number.isFinite(leadId) || leadId < 1) {
      return reply.status(400).send({ error: "ID de lead inválido." });
    }
    const result = await getLeadTimeline(u.orgId, leadId);
    if (!result) return reply.status(404).send({ error: "Lead não encontrado." });
    return reply.send({ ok: true, ...result });
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

    const empresaCfg = (await loadWorkspaceConfigStore(u.orgId)).empresa;
    return reply.send({
      instance,
      handoff_whatsapp: empresaCfg.handoff_whatsapp ?? "",
      link_produto_servico: empresaCfg.link_produto_servico ?? "",
      agenda_config: empresaCfg.agenda_config,
      criterios_qualificacao: empresaCfg.criterios_qualificacao ?? "",
      agenda_local: empresaCfg.agenda_local ?? "",
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
      handoff_whatsapp?: string;
      link_produto_servico?: string;
      agenda_config?: {
        dias_semana?: number[];
        horario_inicio?: string;
        horario_fim?: string;
        duracao_minutos?: number;
      };
      criterios_qualificacao?: string;
      agenda_local?: string;
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

    try {
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

      if (body.handoff_whatsapp !== undefined) {
        await saveWorkspaceConfig(u.orgId, {
          empresa: { handoff_whatsapp: body.handoff_whatsapp },
        });
      }
      const empresaPatch: Partial<EmpresaPerfil> = {};
      if (body.link_produto_servico !== undefined) empresaPatch.link_produto_servico = body.link_produto_servico;
      if (body.agenda_config !== undefined) empresaPatch.agenda_config = parseAgendaConfig(body.agenda_config);
      if (body.criterios_qualificacao !== undefined) empresaPatch.criterios_qualificacao = body.criterios_qualificacao;
      if (body.agenda_local !== undefined) empresaPatch.agenda_local = body.agenda_local;
      if (Object.keys(empresaPatch).length > 0) {
        await saveWorkspaceConfig(u.orgId, { empresa: empresaPatch });
      }

      return reply.send({ saved: true, instance });
    } catch (err) {
      if (err instanceof WhatsappInstanceNameTakenError) {
        return reply.status(409).send({ error: err.message, code: err.code });
      }
      throw err;
    }
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
      if (err instanceof WhatsappInstanceNameTakenError) {
        return reply.status(409).send({ ok: false, error: err.message, code: err.code });
      }
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

  /** Desconecta WhatsApp (logout na Evolution) sem apagar a instância. */
  app.post("/whatsapp/disconnect", async (request, reply) => {
    const u = request.user as { orgId: string };
    if (!isEvolutionConfigured()) {
      return reply.status(503).send({ ok: false, error: "Evolution não configurada no servidor." });
    }

    const instance = await getWhatsappInstanceForOrg(u.orgId);
    if (!instance?.instance_name?.trim()) {
      return reply.status(400).send({ ok: false, error: "Nenhuma instância WhatsApp configurada." });
    }

    const baseUrl = resolveEvolutionBaseUrl(instance.evolution_base_url);
    try {
      await logoutEvolutionInstance(instance.instance_name, baseUrl);
      await upsertWhatsappInstance(u.orgId, {
        instance_name: instance.instance_name,
        evolution_base_url: baseUrl,
        agent_ativo: instance.agent_ativo,
        agent_nome: instance.agent_nome,
        agent_prompt: instance.agent_prompt,
        objetivos: instance.objetivos,
        status: "disconnected",
        delay_primeira_msg_minutos: instance.delay_primeira_msg_minutos,
      });

      return reply.send({
        ok: true,
        instance_name: instance.instance_name,
        connection_state: "close" as const,
        message: "WhatsApp desconectado. Use Reconectar para gerar novo QR.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao desconectar WhatsApp.";
      request.log.warn({ err, instance_name: instance.instance_name }, "whatsapp/disconnect falhou");
      return reply.status(502).send({ ok: false, error: message });
    }
  });

  /** Exclui instância (Evolution + banco) para permitir cadastrar outra. */
  app.delete("/whatsapp/instance", async (request, reply) => {
    const u = request.user as { orgId: string };
    const instance = await getWhatsappInstanceForOrg(u.orgId);
    if (!instance?.instance_name?.trim()) {
      return reply.status(400).send({ ok: false, error: "Nenhuma instância WhatsApp para excluir." });
    }

    const baseUrl = resolveEvolutionBaseUrl(instance.evolution_base_url);
    const name = instance.instance_name;

    try {
      if (isEvolutionConfigured()) {
        await deleteEvolutionInstance(name, baseUrl);
      }
      await removeWhatsappInstanceForOrg(u.orgId);
      return reply.send({
        ok: true,
        deleted: true,
        instance_name: name,
        message: "Instância removida. Você pode criar uma nova com outro nome.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao excluir instância.";
      request.log.warn({ err, instance_name: name }, "whatsapp/instance DELETE falhou");
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
