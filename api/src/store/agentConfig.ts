import { isDbConfigured, ensureTables, getPool } from "../db/index.js";
import { loadConfig, emptyEmpresa, type EmpresaPerfil } from "./config.js";
import {
  AGENT_GRAPH_API_BASE,
  AGENT_GRAPH_API_VERSION,
  AGENT_LOCALE,
  AGENT_TIMEZONE,
  buildDefaultPromptComentarios,
  buildDefaultPromptDirect,
  mergePromptWithRefinements,
  resolveAgentDisplayName,
} from "../services/agentConfigDefaults.js";
import { parseAgendaConfig } from "../services/empresaConfigHelpers.js";
import { getWhatsappInstanceForOrg, clampDelayPrimeiraMsg } from "./whatsappInstance.js";
import { resolveFacebookPageCredentials } from "../util/metaPageId.js";
import {
  isFacebookGraphToken,
  isInstagramLoginToken,
  normalizeGraphAccessToken,
  resolveGraphApiBaseForToken,
} from "../util/graphToken.js";

export type AgentConfigIssue = {
  code: string;
  message: string;
  severity: "error" | "warning";
};

export type AgentConfigLookup = {
  ig_user_id: string | null;
  instagram_account_id: string | null;
  source: "workspace" | "legacy_app_config" | "none";
};

export type AgentConfigCredentials = {
  access_token: string | null;
  /** ID da Página Facebook (POST /{page_id}/messages). */
  page_id: string | null;
  token_source: "agent" | "publish" | "none";
  graph_api_version: string;
  /** Host principal do token do agente (facebook ou instagram). */
  graph_api_base: string;
  /** Sempre graph.facebook.com — private reply no Direct. */
  facebook_graph_base: string;
  /** Token EAA para POST /{page_id}/messages quando agente é IGAA. */
  messenger_access_token: string | null;
};

export type AgentConfigPrompts = {
  agent_nome: string;
  comentarios: string;
  direct: string;
  comentarios_used_default: boolean;
  direct_used_default: boolean;
};

export type AgentConfigRuntime = {
  redis_key_prefix: string;
  timezone: string;
  locale: string;
};

export type AgentConfigOrganization = {
  id: string;
  name: string;
  nome_fantasia: string;
  segmento: string;
  cidade: string;
  tom_voz: string;
  sobre: string;
  objetivo_qualificacao: string;
};

export type AgentConfigInstagramAccount = {
  id: string;
  nome: string;
  ig_user_id: string;
  agent_ativo: boolean;
};

export type AgentConfigWhatsapp = {
  instance_name: string;
  evolution_base_url: string;
  delay_primeira_msg_minutos: number;
  agent_ativo: boolean;
};

export type AgentConfigResult = {
  ok: boolean;
  ready: boolean;
  code: string;
  issues: AgentConfigIssue[];
  resolved_at: string;
  lookup: AgentConfigLookup;
  organization: AgentConfigOrganization | null;
  instagram_account: AgentConfigInstagramAccount | null;
  whatsapp: AgentConfigWhatsapp | null;
  credentials: AgentConfigCredentials;
  prompts: AgentConfigPrompts | null;
  runtime: AgentConfigRuntime | null;
};

type WorkspaceRow = {
  instagram_account_id: string;
  conta_nome: string;
  ig_user_id: string;
  facebook_page_id: string;
  access_token: string;
  agent_access_token: string;
  agent_ativo: boolean;
  agent_nome: string;
  agent_prompt_comentarios: string;
  agent_prompt_direct: string;
  organization_id: string;
  org_name: string;
  nome_fantasia: string;
  segmento: string;
  cidade: string;
  tom_voz: string;
  sobre: string;
  objetivo_qualificacao: string;
  handoff_whatsapp: string;
  link_produto_servico: string;
  agenda_config: unknown;
  criterios_qualificacao: string;
  agenda_local: string;
};

export type ResolveAgentConfigParams = {
  igUserId?: string | null;
  instagramAccountId?: string | null;
};

function normalizeIgUserId(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v || null;
}

function empresaFromRow(row: WorkspaceRow): EmpresaPerfil {
  return {
    nome: row.org_name ?? "",
    nome_fantasia: row.nome_fantasia ?? "",
    segmento: row.segmento ?? "",
    cidade: row.cidade ?? "",
    tom_voz: row.tom_voz ?? "",
    sobre: row.sobre ?? "",
    objetivo_qualificacao: row.objetivo_qualificacao ?? "",
    handoff_whatsapp: row.handoff_whatsapp ?? "",
    link_produto_servico: row.link_produto_servico ?? "",
    agenda_config: parseAgendaConfig(row.agenda_config),
    criterios_qualificacao: row.criterios_qualificacao ?? "",
    agenda_local: row.agenda_local ?? "",
  };
}

const FACEBOOK_GRAPH_API_BASE = `https://graph.facebook.com/${AGENT_GRAPH_API_VERSION}`;

function buildCredentials(agentTok: string, publishTok: string, issues: AgentConfigIssue[]): AgentConfigCredentials {
  const agent = normalizeGraphAccessToken(agentTok);
  const publish = normalizeGraphAccessToken(publishTok);
  const graphBaseFor = (tok: string) => resolveGraphApiBaseForToken(tok, AGENT_GRAPH_API_VERSION);

  // Agente (comentários/Direct) → agent_access_token; Postador/sync → access_token.
  if (agent) {
    if (!publish) {
      issues.push({
        code: "PUBLISH_TOKEN_MISSING",
        message: "Token de publicação vazio — Postador/sync de posts pode falhar.",
        severity: "warning",
      });
    } else if (agent !== publish) {
      issues.push({
        code: "TOKENS_SPLIT",
        message: "Dois tokens: IGAA no agente (comentários/Direct IG) + EAA na publicação (posts e private reply).",
        severity: "warning",
      });
    }
    return withMessengerFields({
      access_token: agent,
      page_id: null,
      token_source: "agent",
      graph_api_version: AGENT_GRAPH_API_VERSION,
      graph_api_base: graphBaseFor(agent),
    });
  }
  if (publish) {
    issues.push({
      code: "AGENT_TOKEN_MISSING",
      message: "Token do agente vazio — usando token de publicação também no agente (não ideal).",
      severity: "warning",
    });
    return withMessengerFields({
      access_token: publish,
      page_id: null,
      token_source: "publish",
      graph_api_version: AGENT_GRAPH_API_VERSION,
      graph_api_base: graphBaseFor(publish),
    });
  }
  issues.push({
    code: "NO_ACCESS_TOKEN",
    message: "Nenhum token Instagram configurado para esta conta (agente nem publicação).",
    severity: "error",
  });
  return {
    access_token: null,
    page_id: null,
    token_source: "none",
    graph_api_version: AGENT_GRAPH_API_VERSION,
    graph_api_base: AGENT_GRAPH_API_BASE,
    facebook_graph_base: FACEBOOK_GRAPH_API_BASE,
    messenger_access_token: null,
  };
}


async function enrichCredentialsWithPageId(
  result: AgentConfigResult,
  facebookPageId: string,
  igUserId?: string
): Promise<AgentConfigResult> {
  if (!result.credentials.access_token) return result;
  const stored = facebookPageId.trim();
  const issues = [...result.issues];
  const ig = igUserId?.trim() || result.lookup.ig_user_id?.trim() || undefined;
  const token = result.credentials.access_token;

  let pageId: string | null = stored || null;
  let accessToken = token;

  if (isInstagramLoginToken(token)) {
    issues.push({
      code: "INSTAGRAM_LOGIN_TOKEN",
      message:
        "Token IGAA/IGQV (Instagram Login) — comentários usam graph.instagram.com. Private reply no Direct pode exigir token de Página (EAA…).",
      severity: "warning",
    });
    if (!pageId) {
      issues.push({
        code: "PAGE_ID_MISSING",
        message: "ID da Página Facebook não configurado — necessário para private reply após comentário.",
        severity: "warning",
      });
    }
  } else {
    const pageCreds = await resolveFacebookPageCredentials(token, {
      graphBase: result.credentials.graph_api_base,
      igUserId: ig,
    });

    pageId = pageCreds?.pageId ?? pageId;
    accessToken = pageCreds?.pageAccessToken ?? accessToken;

    if (!pageId) {
      issues.push({
        code: "PAGE_ID_MISSING",
        message:
          "ID da Página Facebook não encontrado — use token de Página (EAA…) ou User token com pages_show_list.",
        severity: "warning",
      });
    } else if (stored && pageId !== stored) {
      issues.push({
        code: "PAGE_ID_RESOLVED",
        message: `Page ID corrigido via Graph API (${pageId}).`,
        severity: "warning",
      });
    }

    if (pageCreds?.pageAccessToken && pageCreds.pageAccessToken !== token) {
      issues.push({
        code: "PAGE_TOKEN_RESOLVED",
        message: "Token de Página obtido via /me/accounts para envio de Direct.",
        severity: "warning",
      });
    }
  }

  return {
    ...result,
    issues,
    credentials: { ...result.credentials, page_id: pageId, access_token: accessToken },
  };
}

type AgentConfigCredentialsCore = Omit<
  AgentConfigCredentials,
  "facebook_graph_base" | "messenger_access_token"
>;

function withMessengerFields(creds: AgentConfigCredentialsCore): AgentConfigCredentials {
  return {
    ...creds,
    facebook_graph_base: FACEBOOK_GRAPH_API_BASE,
    messenger_access_token: creds.access_token,
  };
}

/** Quando agente é IGAA, private reply usa token EAA de publicação. */
function attachMessengerCredentials(
  result: AgentConfigResult,
  agentRaw: string,
  publishRaw: string
): AgentConfigResult {
  const issues = [...result.issues];
  const creds = result.credentials;
  if (!creds.access_token) {
    return {
      ...result,
      credentials: { ...creds, facebook_graph_base: FACEBOOK_GRAPH_API_BASE, messenger_access_token: null },
    };
  }

  const agent = normalizeGraphAccessToken(agentRaw);
  const publish = normalizeGraphAccessToken(publishRaw);
  let messenger_access_token = creds.access_token;

  if (isInstagramLoginToken(agent) && isFacebookGraphToken(publish)) {
    messenger_access_token = publish;
    issues.push({
      code: "MESSENGER_TOKEN_FROM_PUBLISH",
      message:
        "Token Instagram (IGAA) no agente — comentários em graph.instagram.com; private reply usa token EAA de publicação.",
      severity: "warning",
    });
  }

  return {
    ...result,
    issues,
    credentials: {
      ...creds,
      facebook_graph_base: FACEBOOK_GRAPH_API_BASE,
      messenger_access_token,
    },
  };
}

function buildPrompts(
  row: WorkspaceRow,
  empresa: EmpresaPerfil,
  issues: AgentConfigIssue[]
): AgentConfigPrompts {
  const agentNome = resolveAgentDisplayName(row.agent_nome, empresa);
  const rawCom = (row.agent_prompt_comentarios ?? "").trim();
  const rawDir = (row.agent_prompt_direct ?? "").trim();
  const comentarios_used_default = !rawCom;
  const direct_used_default = !rawDir;
  if (comentarios_used_default) {
    issues.push({
      code: "PROMPT_COMENTARIOS_DEFAULT",
      message: "Prompt de comentários vazio — aplicado template padrão da organização.",
      severity: "warning",
    });
  }
  if (direct_used_default) {
    issues.push({
      code: "PROMPT_DIRECT_DEFAULT",
      message: "Prompt de Direct vazio — aplicado template padrão da organização.",
      severity: "warning",
    });
  }
  return {
    agent_nome: agentNome,
    comentarios: mergePromptWithRefinements(buildDefaultPromptComentarios(empresa, agentNome), rawCom),
    direct: mergePromptWithRefinements(buildDefaultPromptDirect(empresa, agentNome), rawDir),
    comentarios_used_default,
    direct_used_default,
  };
}

async function attachWhatsappConfig(result: AgentConfigResult, organizationId: string): Promise<AgentConfigResult> {
  const wa = await getWhatsappInstanceForOrg(organizationId);
  if (!wa) return { ...result, whatsapp: null };
  return {
    ...result,
    whatsapp: {
      instance_name: wa.instance_name,
      evolution_base_url: wa.evolution_base_url,
      delay_primeira_msg_minutos: clampDelayPrimeiraMsg(wa.delay_primeira_msg_minutos),
      agent_ativo: wa.agent_ativo,
    },
  };
}

function assembleFromWorkspaceRow(row: WorkspaceRow, lookup: AgentConfigLookup): AgentConfigResult {
  const issues: AgentConfigIssue[] = [];
  const empresa = empresaFromRow(row);
  const credentials = buildCredentials(row.agent_access_token, row.access_token, issues);
  const prompts = buildPrompts(row, empresa, issues);

  if (!row.agent_ativo) {
    issues.push({
      code: "AGENT_DISABLED",
      message: "Agente desativado para esta conta no painel (agent_ativo = false).",
      severity: "error",
    });
  }

  const ready = row.agent_ativo && credentials.access_token !== null;
  const code = ready ? "READY" : row.agent_ativo ? "NOT_READY" : "AGENT_DISABLED";

  return {
    ok: true,
    ready,
    code,
    issues,
    resolved_at: new Date().toISOString(),
    lookup,
    organization: {
      id: row.organization_id,
      name: row.org_name,
      nome_fantasia: row.nome_fantasia ?? "",
      segmento: row.segmento ?? "",
      cidade: row.cidade ?? "",
      tom_voz: row.tom_voz ?? "",
      sobre: row.sobre ?? "",
      objetivo_qualificacao: row.objetivo_qualificacao ?? "",
    },
    instagram_account: {
      id: row.instagram_account_id,
      nome: row.conta_nome,
      ig_user_id: row.ig_user_id,
      agent_ativo: row.agent_ativo,
    },
    whatsapp: null,
    credentials,
    prompts,
    runtime: {
      redis_key_prefix: `agent:${row.ig_user_id}:`,
      timezone: AGENT_TIMEZONE,
      locale: AGENT_LOCALE,
    },
  };
}

async function fetchWorkspaceRow(params: ResolveAgentConfigParams): Promise<WorkspaceRow | null> {
  await ensureTables();
  const pool = getPool();
  const igUserId = normalizeIgUserId(params.igUserId);
  const accountId = params.instagramAccountId?.trim() || null;

  if (accountId) {
    const r = await pool.query<WorkspaceRow>(
      `SELECT
         ia.id AS instagram_account_id,
         ia.nome AS conta_nome,
         ia.ig_user_id,
         COALESCE(ia.facebook_page_id, '') AS facebook_page_id,
         COALESCE(ia.access_token, '') AS access_token,
         COALESCE(ia.agent_access_token, '') AS agent_access_token,
         COALESCE(ia.agent_ativo, false) AS agent_ativo,
         COALESCE(ia.agent_nome, '') AS agent_nome,
         COALESCE(ia.agent_prompt_comentarios, '') AS agent_prompt_comentarios,
         COALESCE(ia.agent_prompt_direct, '') AS agent_prompt_direct,
         o.id AS organization_id,
         o.name AS org_name,
         COALESCE(o.nome_fantasia, '') AS nome_fantasia,
         COALESCE(o.segmento, '') AS segmento,
         COALESCE(o.cidade, '') AS cidade,
         COALESCE(o.tom_voz, '') AS tom_voz,
         COALESCE(o.sobre, '') AS sobre,
         COALESCE(o.objetivo_qualificacao, '') AS objetivo_qualificacao,
         COALESCE(o.handoff_whatsapp, '') AS handoff_whatsapp,
         COALESCE(o.link_produto_servico, '') AS link_produto_servico,
         COALESCE(o.agenda_config, '{"dias_semana":[1,2,3,4,5],"horario_inicio":"09:00","horario_fim":"18:00","duracao_minutos":60}'::jsonb) AS agenda_config,
         COALESCE(o.criterios_qualificacao, '') AS criterios_qualificacao,
         COALESCE(o.agenda_local, '') AS agenda_local
       FROM instagram_accounts ia
       INNER JOIN organizations o ON o.id = ia.organization_id
       WHERE ia.id = $1
       LIMIT 1`,
      [accountId]
    );
    return r.rows[0] ?? null;
  }

  if (!igUserId) return null;

  const r = await pool.query<WorkspaceRow>(
    `SELECT
       ia.id AS instagram_account_id,
       ia.nome AS conta_nome,
       ia.ig_user_id,
       COALESCE(ia.facebook_page_id, '') AS facebook_page_id,
       COALESCE(ia.access_token, '') AS access_token,
       COALESCE(ia.agent_access_token, '') AS agent_access_token,
       COALESCE(ia.agent_ativo, false) AS agent_ativo,
       COALESCE(ia.agent_nome, '') AS agent_nome,
       COALESCE(ia.agent_prompt_comentarios, '') AS agent_prompt_comentarios,
       COALESCE(ia.agent_prompt_direct, '') AS agent_prompt_direct,
       o.id AS organization_id,
       o.name AS org_name,
       COALESCE(o.nome_fantasia, '') AS nome_fantasia,
       COALESCE(o.segmento, '') AS segmento,
       COALESCE(o.cidade, '') AS cidade,
       COALESCE(o.tom_voz, '') AS tom_voz,
       COALESCE(o.sobre, '') AS sobre,
       COALESCE(o.objetivo_qualificacao, '') AS objetivo_qualificacao,
       COALESCE(o.handoff_whatsapp, '') AS handoff_whatsapp,
       COALESCE(o.link_produto_servico, '') AS link_produto_servico,
       COALESCE(o.agenda_config, '{"dias_semana":[1,2,3,4,5],"horario_inicio":"09:00","horario_fim":"18:00","duracao_minutos":60}'::jsonb) AS agenda_config,
       COALESCE(o.criterios_qualificacao, '') AS criterios_qualificacao,
       COALESCE(o.agenda_local, '') AS agenda_local
     FROM instagram_accounts ia
     INNER JOIN organizations o ON o.id = ia.organization_id
     WHERE ia.ig_user_id = $1
     LIMIT 1`,
    [igUserId]
  );
  return r.rows[0] ?? null;
}

/** Fallback legado: app_config sem workspace (migração gradual). */
async function resolveFromLegacyAppConfig(igUserId: string): Promise<AgentConfigResult | null> {
  const config = await loadConfig();
  const conta = config.contas_instagram.find((c) => c.ig_user_id?.trim() === igUserId);
  if (!conta) return null;

  const issues: AgentConfigIssue[] = [
    {
      code: "LEGACY_APP_CONFIG",
      message:
        "Conta resolvida via app_config legado (sem organization_id). Cadastre a conta no workspace para multi-tenant completo.",
      severity: "warning",
    },
  ];

  const empresa = config.empresa ?? emptyEmpresa();
  const agentAtivo = Boolean(conta.agent_ativo);
  const credentials = buildCredentials(conta.agent_access_token ?? "", conta.access_token ?? "", issues);
  const prompts = buildPrompts(
    {
      instagram_account_id: conta.id,
      conta_nome: conta.nome,
      ig_user_id: conta.ig_user_id,
      facebook_page_id: conta.facebook_page_id ?? "",
      access_token: conta.access_token ?? "",
      agent_access_token: conta.agent_access_token ?? "",
      agent_ativo: agentAtivo,
      agent_nome: conta.agent_nome ?? "",
      agent_prompt_comentarios: conta.agent_prompt_comentarios ?? "",
      agent_prompt_direct: conta.agent_prompt_direct ?? "",
      organization_id: "legacy",
      org_name: empresa.nome || "Empresa",
      nome_fantasia: empresa.nome_fantasia ?? "",
      segmento: empresa.segmento ?? "",
      cidade: empresa.cidade ?? "",
      tom_voz: empresa.tom_voz ?? "",
      sobre: empresa.sobre ?? "",
      objetivo_qualificacao: empresa.objetivo_qualificacao ?? "",
      handoff_whatsapp: empresa.handoff_whatsapp ?? "",
      link_produto_servico: empresa.link_produto_servico ?? "",
      agenda_config: empresa.agenda_config,
      criterios_qualificacao: empresa.criterios_qualificacao ?? "",
      agenda_local: empresa.agenda_local ?? "",
    },
    empresa,
    issues
  );

  if (!agentAtivo) {
    issues.push({
      code: "AGENT_DISABLED",
      message: "Agente desativado para esta conta (agent_ativo = false).",
      severity: "error",
    });
  }

  const ready = agentAtivo && credentials.access_token !== null;

  return {
    ok: true,
    ready,
    code: ready ? "READY" : agentAtivo ? "NOT_READY" : "AGENT_DISABLED",
    issues,
    resolved_at: new Date().toISOString(),
    lookup: {
      ig_user_id: igUserId,
      instagram_account_id: conta.id,
      source: "legacy_app_config",
    },
    organization: {
      id: "legacy",
      name: empresa.nome,
      nome_fantasia: empresa.nome_fantasia ?? "",
      segmento: empresa.segmento ?? "",
      cidade: empresa.cidade ?? "",
      tom_voz: empresa.tom_voz ?? "",
      sobre: empresa.sobre ?? "",
      objetivo_qualificacao: empresa.objetivo_qualificacao ?? "",
    },
    instagram_account: {
      id: conta.id,
      nome: conta.nome,
      ig_user_id: conta.ig_user_id,
      agent_ativo: agentAtivo,
    },
    whatsapp: null,
    credentials,
    prompts,
    runtime: {
      redis_key_prefix: `agent:${igUserId}:`,
      timezone: AGENT_TIMEZONE,
      locale: AGENT_LOCALE,
    },
  };
}

export function notFoundAgentConfig(params: ResolveAgentConfigParams): AgentConfigResult {
  const igUserId = normalizeIgUserId(params.igUserId);
  const accountId = params.instagramAccountId?.trim() || null;
  return {
    ok: false,
    ready: false,
    code: "ACCOUNT_NOT_FOUND",
    issues: [
      {
        code: "ACCOUNT_NOT_FOUND",
        message: accountId
          ? `Nenhuma conta Instagram com id interno "${accountId}".`
          : `Nenhuma conta Instagram com ig_user_id "${igUserId ?? ""}".`,
        severity: "error",
      },
    ],
    resolved_at: new Date().toISOString(),
    lookup: {
      ig_user_id: igUserId,
      instagram_account_id: accountId,
      source: "none",
    },
    organization: null,
    instagram_account: null,
    whatsapp: null,
    credentials: {
      access_token: null,
      page_id: null,
      token_source: "none",
      graph_api_version: AGENT_GRAPH_API_VERSION,
      graph_api_base: AGENT_GRAPH_API_BASE,
      facebook_graph_base: FACEBOOK_GRAPH_API_BASE,
      messenger_access_token: null,
    },
    prompts: null,
    runtime: null,
  };
}

export async function resolveAgentConfig(params: ResolveAgentConfigParams): Promise<AgentConfigResult> {
  if (!isDbConfigured()) {
    return {
      ok: false,
      ready: false,
      code: "DATABASE_NOT_CONFIGURED",
      issues: [
        {
          code: "DATABASE_NOT_CONFIGURED",
          message: "DATABASE_URL não configurada na API — impossível resolver tenant.",
          severity: "error",
        },
      ],
      resolved_at: new Date().toISOString(),
      lookup: {
        ig_user_id: normalizeIgUserId(params.igUserId),
        instagram_account_id: params.instagramAccountId?.trim() || null,
        source: "none",
      },
      organization: null,
      instagram_account: null,
      whatsapp: null,
      credentials: {
        access_token: null,
        page_id: null,
        token_source: "none",
        graph_api_version: AGENT_GRAPH_API_VERSION,
        graph_api_base: AGENT_GRAPH_API_BASE,
      facebook_graph_base: FACEBOOK_GRAPH_API_BASE,
      messenger_access_token: null,
      },
      prompts: null,
      runtime: null,
    };
  }

  const igUserId = normalizeIgUserId(params.igUserId);
  const accountId = params.instagramAccountId?.trim() || null;

  if (!igUserId && !accountId) {
    return {
      ok: false,
      ready: false,
      code: "MISSING_LOOKUP",
      issues: [
        {
          code: "MISSING_LOOKUP",
          message: "Informe ig_user_id (webhook entry[0].id) ou instagram_account_id.",
          severity: "error",
        },
      ],
      resolved_at: new Date().toISOString(),
      lookup: { ig_user_id: null, instagram_account_id: null, source: "none" },
      organization: null,
      instagram_account: null,
      whatsapp: null,
      credentials: {
        access_token: null,
        page_id: null,
        token_source: "none",
        graph_api_version: AGENT_GRAPH_API_VERSION,
        graph_api_base: AGENT_GRAPH_API_BASE,
      facebook_graph_base: FACEBOOK_GRAPH_API_BASE,
      messenger_access_token: null,
      },
      prompts: null,
      runtime: null,
    };
  }

  const row = await fetchWorkspaceRow({ igUserId, instagramAccountId: accountId });
  if (row) {
    const base = assembleFromWorkspaceRow(row, {
      ig_user_id: row.ig_user_id,
      instagram_account_id: row.instagram_account_id,
      source: "workspace",
    });
    const withPage = await enrichCredentialsWithPageId(base, row.facebook_page_id, row.ig_user_id);
    const withMessenger = attachMessengerCredentials(withPage, row.agent_access_token, row.access_token);
    return attachWhatsappConfig(withMessenger, row.organization_id);
  }

  if (igUserId) {
    const legacy = await resolveFromLegacyAppConfig(igUserId);
    if (legacy) {
      const conta = (await loadConfig()).contas_instagram.find((c) => c.ig_user_id?.trim() === igUserId);
      const withPage = await enrichCredentialsWithPageId(legacy, conta?.facebook_page_id ?? "", igUserId);
      const agentTok = conta?.agent_access_token ?? "";
      const pubTok = conta?.access_token ?? "";
      const withMessenger = attachMessengerCredentials(withPage, agentTok, pubTok);
      const orgId = withMessenger.organization?.id;
      if (orgId && orgId !== "legacy") return attachWhatsappConfig(withMessenger, orgId);
      return withMessenger;
    }
  }

  return notFoundAgentConfig({ igUserId, instagramAccountId: accountId });
}
