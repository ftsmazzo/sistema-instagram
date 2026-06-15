import { ensureTables, getPool, isDbConfigured } from "../db/index.js";
import { AGENT_LOCALE, AGENT_TIMEZONE } from "../services/agentConfigDefaults.js";
import {
  buildDefaultPromptWhatsapp,
  resolveWhatsappAgentDisplayName,
  WHATSAPP_DEFAULT_OBJETIVOS,
  type WhatsappObjetivo,
} from "../services/whatsappAgentDefaults.js";
import { normalizePhoneDigits } from "../util/phone.js";
import { clampDelayPrimeiraMsg } from "./whatsappInstance.js";

export type WhatsappAgentIssue = {
  code: string;
  message: string;
  severity: "error" | "warning";
};

export type WhatsappAgentLookup = {
  instance_name: string | null;
  phone: string | null;
  organization_id: string | null;
  source: "instance" | "phone" | "organization" | "none";
};

export type WhatsappAgentOrganization = {
  id: string;
  name: string;
  nome_fantasia: string;
  segmento: string;
  cidade: string;
  tom_voz: string;
  sobre: string;
  objetivo_qualificacao: string;
};

export type WhatsappAgentInstance = {
  id: string;
  instance_name: string;
  evolution_base_url: string;
  agent_ativo: boolean;
  status: string;
  delay_primeira_msg_minutos: number;
};

export type WhatsappAgentPrompts = {
  agent_nome: string;
  whatsapp: string;
  whatsapp_used_default: boolean;
};

export type WhatsappAgentEvolution = {
  base_url: string;
  instance_name: string;
  send_text_path: string;
};

export type WhatsappAgentLead = {
  id: number;
  nome: string | null;
  whatsapp: string | null;
  username_instagram: string | null;
  objetivo: string | null;
  status: string;
  id_post_origem: string | null;
  origem_interacao: string | null;
  url_interesse: string | null;
  handoff_at: string | null;
  whatsapp_boas_vindas_enviado: boolean;
};

export type WhatsappAgentPostContext = {
  id_post: string;
  caption_post: string | null;
  link_post: string | null;
  media_type: string | null;
};

export type WhatsappAgentInstagramContext = {
  ultimo_comentario: string | null;
  ultima_dm: string | null;
};

export type WhatsappAgentRuntime = {
  redis_key_prefix: string;
  timezone: string;
  locale: string;
  delay_primeira_msg_minutos: number;
};

export type WhatsappAgentConfigResult = {
  ok: boolean;
  ready: boolean;
  code: string;
  issues: WhatsappAgentIssue[];
  resolved_at: string;
  lookup: WhatsappAgentLookup;
  organization: WhatsappAgentOrganization | null;
  whatsapp_instance: WhatsappAgentInstance | null;
  evolution: WhatsappAgentEvolution | null;
  prompts: WhatsappAgentPrompts | null;
  objetivos: WhatsappObjetivo[];
  lead: WhatsappAgentLead | null;
  post_context: WhatsappAgentPostContext | null;
  instagram_context: WhatsappAgentInstagramContext | null;
  runtime: WhatsappAgentRuntime | null;
};

type OrgRow = {
  organization_id: string;
  org_name: string;
  nome_fantasia: string;
  segmento: string;
  cidade: string;
  tom_voz: string;
  sobre: string;
  objetivo_qualificacao: string;
};

type InstanceRow = {
  id: string;
  organization_id: string;
  instance_name: string;
  evolution_base_url: string;
  agent_ativo: boolean;
  agent_nome: string;
  agent_prompt: string;
  objetivos: unknown;
  status: string;
  delay_primeira_msg_minutos: number;
};

type LeadRow = {
  id: number;
  nome: string | null;
  whatsapp: string | null;
  username_instagram: string | null;
  objetivo: string | null;
  status: string;
  id_post_origem: string | null;
  origem_interacao: string | null;
  url_interesse: string | null;
  handoff_at: Date | null;
  whatsapp_boas_vindas_enviado: boolean;
  id_instagram: string | null;
};

export type ResolveWhatsappAgentConfigParams = {
  instanceName?: string | null;
  phone?: string | null;
  organizationId?: string | null;
};

function parseObjetivos(raw: unknown): WhatsappObjetivo[] {
  if (!Array.isArray(raw)) return [...WHATSAPP_DEFAULT_OBJETIVOS];
  const allowed = new Set<string>(WHATSAPP_DEFAULT_OBJETIVOS);
  const out = raw.filter((v): v is WhatsappObjetivo => typeof v === "string" && allowed.has(v));
  return out.length > 0 ? out : [...WHATSAPP_DEFAULT_OBJETIVOS];
}

function orgFromRow(row: OrgRow): WhatsappAgentOrganization {
  return {
    id: row.organization_id,
    name: row.org_name,
    nome_fantasia: row.nome_fantasia ?? "",
    segmento: row.segmento ?? "",
    cidade: row.cidade ?? "",
    tom_voz: row.tom_voz ?? "",
    sobre: row.sobre ?? "",
    objetivo_qualificacao: row.objetivo_qualificacao ?? "",
  };
}

function empresaFromOrg(org: WhatsappAgentOrganization) {
  return {
    nome: org.name,
    nome_fantasia: org.nome_fantasia,
    segmento: org.segmento,
    cidade: org.cidade,
    tom_voz: org.tom_voz,
    sobre: org.sobre,
    objetivo_qualificacao: org.objetivo_qualificacao,
  };
}

async function fetchOrg(orgId: string): Promise<OrgRow | null> {
  await ensureTables();
  const pool = getPool();
  const r = await pool.query<OrgRow>(
    `SELECT o.id AS organization_id, o.name AS org_name,
            COALESCE(o.nome_fantasia, '') AS nome_fantasia,
            COALESCE(o.segmento, '') AS segmento,
            COALESCE(o.cidade, '') AS cidade,
            COALESCE(o.tom_voz, '') AS tom_voz,
            COALESCE(o.sobre, '') AS sobre,
            COALESCE(o.objetivo_qualificacao, '') AS objetivo_qualificacao
     FROM organizations o WHERE o.id = $1::uuid LIMIT 1`,
    [orgId]
  );
  return r.rows[0] ?? null;
}

async function fetchInstanceByName(instanceName: string): Promise<InstanceRow | null> {
  await ensureTables();
  const pool = getPool();
  const r = await pool.query<InstanceRow>(
    `SELECT id, organization_id, instance_name, evolution_base_url,
            agent_ativo, COALESCE(agent_nome, '') AS agent_nome,
            COALESCE(agent_prompt, '') AS agent_prompt, objetivos, status,
            COALESCE(delay_primeira_msg_minutos, 20) AS delay_primeira_msg_minutos
     FROM whatsapp_instances WHERE instance_name = $1 LIMIT 1`,
    [instanceName]
  );
  return r.rows[0] ?? null;
}

async function fetchInstanceByOrg(orgId: string): Promise<InstanceRow | null> {
  await ensureTables();
  const pool = getPool();
  const r = await pool.query<InstanceRow>(
    `SELECT id, organization_id, instance_name, evolution_base_url,
            agent_ativo, COALESCE(agent_nome, '') AS agent_nome,
            COALESCE(agent_prompt, '') AS agent_prompt, objetivos, status,
            COALESCE(delay_primeira_msg_minutos, 20) AS delay_primeira_msg_minutos
     FROM whatsapp_instances WHERE organization_id = $1::uuid
     ORDER BY updated_at DESC LIMIT 1`,
    [orgId]
  );
  return r.rows[0] ?? null;
}

async function fetchLeadByPhone(orgId: string, phoneDigits: string): Promise<LeadRow | null> {
  await ensureTables();
  const pool = getPool();
  const r = await pool.query<LeadRow>(
    `SELECT id, nome, whatsapp, username_instagram, objetivo, status,
            id_post_origem, origem_interacao, url_interesse, handoff_at,
            whatsapp_boas_vindas_enviado, id_instagram
     FROM leads
     WHERE organization_id = $1::uuid
       AND (whatsapp_digits = $2 OR regexp_replace(COALESCE(whatsapp, ''), '\\D', '', 'g') = $2)
     ORDER BY updated_at DESC LIMIT 1`,
    [orgId, phoneDigits]
  );
  return r.rows[0] ?? null;
}

async function fetchPostContext(orgId: string, idPost: string): Promise<WhatsappAgentPostContext | null> {
  await ensureTables();
  const pool = getPool();
  const r = await pool.query<{ id_post: string; caption_post: string | null; link_post: string | null; media_type: string | null }>(
    `SELECT id_post, caption_post, link_post, media_type
     FROM postagens WHERE organization_id = $1::uuid AND id_post = $2 LIMIT 1`,
    [orgId, idPost]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id_post: row.id_post,
    caption_post: row.caption_post,
    link_post: row.link_post,
    media_type: row.media_type,
  };
}

async function fetchInstagramContext(orgId: string, idInstaLead: string | null): Promise<WhatsappAgentInstagramContext | null> {
  if (!idInstaLead) return null;
  await ensureTables();
  const pool = getPool();
  const [com, dm] = await Promise.all([
    pool.query<{ comment_text: string | null }>(
      `SELECT comment_text FROM comentarios
       WHERE organization_id = $1::uuid AND id_insta_lead = $2
       ORDER BY data_comentario DESC NULLS LAST LIMIT 1`,
      [orgId, idInstaLead]
    ),
    pool.query<{ direct_text: string | null }>(
      `SELECT direct_text FROM direct
       WHERE organization_id = $1::uuid AND id_insta_lead = $2 AND COALESCE(enviado_pelo_negocio, false) = false
       ORDER BY data_direct DESC NULLS LAST LIMIT 1`,
      [orgId, idInstaLead]
    ),
  ]);
  return {
    ultimo_comentario: com.rows[0]?.comment_text ?? null,
    ultima_dm: dm.rows[0]?.direct_text ?? null,
  };
}

function assembleConfig(args: {
  lookup: WhatsappAgentLookup;
  org: OrgRow;
  instance: InstanceRow | null;
  phoneDigits: string | null;
  lead: LeadRow | null;
  postContext: WhatsappAgentPostContext | null;
  instagramContext: WhatsappAgentInstagramContext | null;
}): WhatsappAgentConfigResult {
  const issues: WhatsappAgentIssue[] = [];
  const organization = orgFromRow(args.org);
  const empresa = empresaFromOrg(organization);

  let instance = args.instance;
  if (!instance) {
    issues.push({
      code: "WHATSAPP_INSTANCE_NOT_CONFIGURED",
      message: "Nenhuma instância WhatsApp/Evolution configurada para esta organização.",
      severity: "error",
    });
  } else if (!instance.evolution_base_url.trim()) {
    issues.push({
      code: "EVOLUTION_URL_MISSING",
      message: "URL base da Evolution não configurada no painel.",
      severity: "error",
    });
  }

  if (!instance?.agent_ativo) {
    issues.push({
      code: "WHATSAPP_AGENT_DISABLED",
      message: "Agente WhatsApp desativado para esta organização.",
      severity: "error",
    });
  }

  if (args.phoneDigits && !args.lead) {
    issues.push({
      code: "LEAD_NOT_FOUND",
      message: "Telefone ainda não vinculado a um lead no CRM — o agente pode iniciar conversa fria.",
      severity: "warning",
    });
  }

  const agentNome = resolveWhatsappAgentDisplayName(instance?.agent_nome, empresa);
  const rawPrompt = (instance?.agent_prompt ?? "").trim();
  const whatsapp_used_default = !rawPrompt;
  if (whatsapp_used_default) {
    issues.push({
      code: "PROMPT_WHATSAPP_DEFAULT",
      message: "Prompt WhatsApp vazio — aplicado template padrão da organização.",
      severity: "warning",
    });
  }

  const objetivos = parseObjetivos(instance?.objetivos);
  const baseUrl = (instance?.evolution_base_url ?? "").replace(/\/$/, "");
  const instanceName = instance?.instance_name ?? "";

  const ready = Boolean(
    instance?.agent_ativo && baseUrl && instanceName && args.lookup.source !== "none"
  );

  let code = "READY";
  if (!ready) {
    if (!instance?.agent_ativo) code = "WHATSAPP_AGENT_DISABLED";
    else if (!baseUrl || !instanceName) code = "NOT_CONFIGURED";
    else code = "NOT_READY";
  }

  return {
    ok: true,
    ready,
    code,
    issues,
    resolved_at: new Date().toISOString(),
    lookup: args.lookup,
    organization,
    whatsapp_instance: instance
      ? {
          id: instance.id,
          instance_name: instance.instance_name,
          evolution_base_url: instance.evolution_base_url,
          agent_ativo: instance.agent_ativo,
          status: instance.status,
          delay_primeira_msg_minutos: clampDelayPrimeiraMsg(instance.delay_primeira_msg_minutos),
        }
      : null,
    evolution: instance && baseUrl
      ? {
          base_url: baseUrl,
          instance_name: instanceName,
          send_text_path: `${baseUrl}/message/sendText/${instanceName}`,
        }
      : null,
    prompts: {
      agent_nome: agentNome,
      whatsapp: rawPrompt || buildDefaultPromptWhatsapp(empresa, agentNome),
      whatsapp_used_default,
    },
    objetivos,
    lead: args.lead
      ? {
          id: args.lead.id,
          nome: args.lead.nome,
          whatsapp: args.lead.whatsapp,
          username_instagram: args.lead.username_instagram,
          objetivo: args.lead.objetivo,
          status: args.lead.status,
          id_post_origem: args.lead.id_post_origem,
          origem_interacao: args.lead.origem_interacao,
          url_interesse: args.lead.url_interesse,
          handoff_at: args.lead.handoff_at?.toISOString() ?? null,
          whatsapp_boas_vindas_enviado: args.lead.whatsapp_boas_vindas_enviado,
        }
      : null,
    post_context: args.postContext,
    instagram_context: args.instagramContext,
    runtime: {
      redis_key_prefix: `wa:${args.org.organization_id}:${args.phoneDigits ?? "unknown"}:`,
      timezone: AGENT_TIMEZONE,
      locale: AGENT_LOCALE,
      delay_primeira_msg_minutos: clampDelayPrimeiraMsg(instance?.delay_primeira_msg_minutos),
    },
  };
}

export async function resolveWhatsappAgentConfig(
  params: ResolveWhatsappAgentConfigParams
): Promise<WhatsappAgentConfigResult> {
  if (!isDbConfigured()) {
    return {
      ok: false,
      ready: false,
      code: "DATABASE_NOT_CONFIGURED",
      issues: [
        {
          code: "DATABASE_NOT_CONFIGURED",
          message: "DATABASE_URL não configurada na API.",
          severity: "error",
        },
      ],
      resolved_at: new Date().toISOString(),
      lookup: { instance_name: null, phone: null, organization_id: null, source: "none" },
      organization: null,
      whatsapp_instance: null,
      evolution: null,
      prompts: null,
      objetivos: [...WHATSAPP_DEFAULT_OBJETIVOS],
      lead: null,
      post_context: null,
      instagram_context: null,
      runtime: null,
    };
  }

  const instanceName = params.instanceName?.trim() || null;
  const phoneDigits = normalizePhoneDigits(params.phone);
  const organizationId = params.organizationId?.trim() || null;

  if (!instanceName && !phoneDigits && !organizationId) {
    return {
      ok: false,
      ready: false,
      code: "MISSING_LOOKUP",
      issues: [
        {
          code: "MISSING_LOOKUP",
          message: "Informe instance (Evolution), phone ou organization_id.",
          severity: "error",
        },
      ],
      resolved_at: new Date().toISOString(),
      lookup: { instance_name: null, phone: phoneDigits, organization_id: organizationId, source: "none" },
      organization: null,
      whatsapp_instance: null,
      evolution: null,
      prompts: null,
      objetivos: [...WHATSAPP_DEFAULT_OBJETIVOS],
      lead: null,
      post_context: null,
      instagram_context: null,
      runtime: null,
    };
  }

  let orgId: string | null = organizationId;
  let instance: InstanceRow | null = null;
  let lookupSource: WhatsappAgentLookup["source"] = "none";

  if (instanceName) {
    instance = await fetchInstanceByName(instanceName);
    if (instance) {
      orgId = instance.organization_id;
      lookupSource = "instance";
    }
  }

  if (!orgId && phoneDigits) {
    await ensureTables();
    const pool = getPool();
    const r = await pool.query<{ organization_id: string }>(
      `SELECT organization_id FROM leads
       WHERE whatsapp_digits = $1 OR regexp_replace(COALESCE(whatsapp, ''), '\\D', '', 'g') = $1
       ORDER BY updated_at DESC LIMIT 1`,
      [phoneDigits]
    );
    if (r.rows[0]) {
      orgId = r.rows[0].organization_id;
      lookupSource = "phone";
    }
  }

  if (orgId && !instance) {
    instance = await fetchInstanceByOrg(orgId);
    if (lookupSource === "none" && organizationId) lookupSource = "organization";
  }

  if (!orgId) {
    return {
      ok: false,
      ready: false,
      code: "TENANT_NOT_FOUND",
      issues: [
        {
          code: "TENANT_NOT_FOUND",
          message: "Não foi possível resolver a organização pelo instance/telefone informado.",
          severity: "error",
        },
      ],
      resolved_at: new Date().toISOString(),
      lookup: {
        instance_name: instanceName,
        phone: phoneDigits,
        organization_id: null,
        source: "none",
      },
      organization: null,
      whatsapp_instance: null,
      evolution: null,
      prompts: null,
      objetivos: [...WHATSAPP_DEFAULT_OBJETIVOS],
      lead: null,
      post_context: null,
      instagram_context: null,
      runtime: null,
    };
  }

  const org = await fetchOrg(orgId);
  if (!org) {
    return {
      ok: false,
      ready: false,
      code: "ORGANIZATION_NOT_FOUND",
      issues: [{ code: "ORGANIZATION_NOT_FOUND", message: "Organização não encontrada.", severity: "error" }],
      resolved_at: new Date().toISOString(),
      lookup: {
        instance_name: instanceName,
        phone: phoneDigits,
        organization_id: orgId,
        source: lookupSource,
      },
      organization: null,
      whatsapp_instance: null,
      evolution: null,
      prompts: null,
      objetivos: [...WHATSAPP_DEFAULT_OBJETIVOS],
      lead: null,
      post_context: null,
      instagram_context: null,
      runtime: null,
    };
  }

  const lead = phoneDigits ? await fetchLeadByPhone(orgId, phoneDigits) : null;
  const postContext =
    lead?.id_post_origem ? await fetchPostContext(orgId, lead.id_post_origem) : null;
  const instagramContext = lead?.id_instagram
    ? await fetchInstagramContext(orgId, lead.id_instagram)
    : null;

  return assembleConfig({
    lookup: {
      instance_name: instanceName ?? instance?.instance_name ?? null,
      phone: phoneDigits,
      organization_id: orgId,
      source: lookupSource === "none" && organizationId ? "organization" : lookupSource,
    },
    org,
    instance,
    phoneDigits,
    lead,
    postContext,
    instagramContext,
  });
}
