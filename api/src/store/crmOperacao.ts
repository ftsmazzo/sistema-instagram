import { ensureTables, getPool } from "../db/index.js";
import { isInstagramLoginToken } from "../util/graphToken.js";
import {
  getEvolutionInstanceStatus,
  isEvolutionConfigured,
  resolveEvolutionBaseUrl,
} from "../services/evolution.js";
import { getWhatsappInstanceForOrg } from "./whatsappInstance.js";

export type FunnelStats = {
  period_days: number;
  comentarios: number;
  direct_inbound: number;
  direct_outbound: number;
  whatsapp_inbound: number;
  whatsapp_outbound: number;
  leads_total: number;
  leads_com_whatsapp: number;
  leads_por_status: Record<string, number>;
  handoffs: number;
};

export type TimelineItem = {
  canal: "comentario" | "direct" | "whatsapp";
  direction: "inbound" | "outbound";
  text: string;
  at: string;
  ref: string | null;
};

export type OperacaoIssue = {
  code: string;
  message: string;
  severity: "error" | "warning" | "info";
};

export type OperacaoHealth = {
  ok: boolean;
  issues: OperacaoIssue[];
  instagram: {
    contas: number;
    agentes_ativos: number;
    com_token_agente_igaa: number;
  };
  whatsapp: {
    evolution_configured: boolean;
    agent_ativo: boolean;
    instance_name: string | null;
    connection_state: string | null;
  };
};

function clampDays(days: number | undefined): number {
  const n = Number(days);
  if (!Number.isFinite(n)) return 30;
  return Math.min(90, Math.max(1, Math.round(n)));
}

export async function getFunnelStats(organizationId: string, days?: number): Promise<FunnelStats> {
  await ensureTables();
  const pool = getPool();
  const periodDays = clampDays(days);
  const since = new Date();
  since.setDate(since.getDate() - periodDays);

  const [comR, dirInR, dirOutR, waInR, waOutR, leadsR, waLeadsR, statusR, handoffR] =
    await Promise.all([
      pool.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM comentarios
         WHERE organization_id = $1::uuid
           AND COALESCE(data_comentario, created_at) >= $2`,
        [organizationId, since]
      ),
      pool.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM direct
         WHERE organization_id = $1::uuid
           AND enviado_pelo_negocio = false
           AND COALESCE(data_direct, created_at) >= $2`,
        [organizationId, since]
      ),
      pool.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM direct
         WHERE organization_id = $1::uuid
           AND enviado_pelo_negocio = true
           AND COALESCE(data_direct, created_at) >= $2`,
        [organizationId, since]
      ),
      pool.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM whatsapp_messages
         WHERE organization_id = $1::uuid
           AND direction = 'inbound'
           AND created_at >= $2`,
        [organizationId, since]
      ),
      pool.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM whatsapp_messages
         WHERE organization_id = $1::uuid
           AND direction = 'outbound'
           AND created_at >= $2`,
        [organizationId, since]
      ),
      pool.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM leads WHERE organization_id = $1::uuid`,
        [organizationId]
      ),
      pool.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM leads
         WHERE organization_id = $1::uuid
           AND COALESCE(whatsapp_digits, '') <> ''`,
        [organizationId]
      ),
      pool.query<{ status: string; n: string }>(
        `SELECT COALESCE(status, 'novo') AS status, COUNT(*)::text AS n
         FROM leads WHERE organization_id = $1::uuid
         GROUP BY status`,
        [organizationId]
      ),
      pool.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM leads
         WHERE organization_id = $1::uuid
           AND (status = 'handoff' OR handoff_at IS NOT NULL)`,
        [organizationId]
      ),
    ]);

  const leads_por_status: Record<string, number> = {};
  for (const row of statusR.rows) {
    leads_por_status[row.status] = Number(row.n);
  }

  return {
    period_days: periodDays,
    comentarios: Number(comR.rows[0]?.n ?? 0),
    direct_inbound: Number(dirInR.rows[0]?.n ?? 0),
    direct_outbound: Number(dirOutR.rows[0]?.n ?? 0),
    whatsapp_inbound: Number(waInR.rows[0]?.n ?? 0),
    whatsapp_outbound: Number(waOutR.rows[0]?.n ?? 0),
    leads_total: Number(leadsR.rows[0]?.n ?? 0),
    leads_com_whatsapp: Number(waLeadsR.rows[0]?.n ?? 0),
    leads_por_status,
    handoffs: Number(handoffR.rows[0]?.n ?? 0),
  };
}

export async function getLeadTimeline(
  organizationId: string,
  leadId: number
): Promise<{ lead: { id: number; nome: string | null; id_instagram: string; whatsapp: string | null }; timeline: TimelineItem[] } | null> {
  await ensureTables();
  const pool = getPool();

  const leadR = await pool.query<{
    id: number;
    nome: string | null;
    id_instagram: string;
    whatsapp: string | null;
    whatsapp_digits: string | null;
  }>(
    `SELECT id, nome, id_instagram, whatsapp, whatsapp_digits
     FROM leads WHERE id = $1 AND organization_id = $2::uuid LIMIT 1`,
    [leadId, organizationId]
  );
  const lead = leadR.rows[0];
  if (!lead) return null;

  const igId = lead.id_instagram;
  const phone = lead.whatsapp_digits ?? "";

  const [comR, dirR, waR] = await Promise.all([
    pool.query<{ at: Date; text: string | null; ref: string }>(
      `SELECT COALESCE(data_comentario, created_at) AS at, comment_text AS text, id_comentario AS ref
       FROM comentarios
       WHERE organization_id = $1::uuid AND id_insta_lead = $2`,
      [organizationId, igId]
    ),
    pool.query<{ at: Date; text: string | null; ref: string; outbound: boolean }>(
      `SELECT COALESCE(data_direct, created_at) AS at, direct_text AS text, id_direct AS ref,
              enviado_pelo_negocio AS outbound
       FROM direct
       WHERE organization_id = $1::uuid AND id_insta_lead = $2`,
      [organizationId, igId]
    ),
    pool.query<{ at: Date; text: string | null; ref: string | null; direction: string }>(
      `SELECT created_at AS at, message_text AS text, message_id_ext AS ref, direction
       FROM whatsapp_messages
       WHERE organization_id = $1::uuid
         AND (lead_id = $2 OR ($3 <> '' AND telefone = $3))`,
      [organizationId, leadId, phone]
    ),
  ]);

  const items: TimelineItem[] = [];

  for (const row of comR.rows) {
    items.push({
      canal: "comentario",
      direction: "inbound",
      text: (row.text ?? "").trim(),
      at: new Date(row.at).toISOString(),
      ref: row.ref,
    });
  }
  for (const row of dirR.rows) {
    items.push({
      canal: "direct",
      direction: row.outbound ? "outbound" : "inbound",
      text: (row.text ?? "").trim(),
      at: new Date(row.at).toISOString(),
      ref: row.ref,
    });
  }
  for (const row of waR.rows) {
    items.push({
      canal: "whatsapp",
      direction: row.direction === "outbound" ? "outbound" : "inbound",
      text: (row.text ?? "").trim(),
      at: new Date(row.at).toISOString(),
      ref: row.ref,
    });
  }

  items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return {
    lead: {
      id: lead.id,
      nome: lead.nome,
      id_instagram: lead.id_instagram,
      whatsapp: lead.whatsapp,
    },
    timeline: items.filter((i) => i.text.length > 0),
  };
}

export async function getOperacaoHealth(organizationId: string): Promise<OperacaoHealth> {
  await ensureTables();
  const pool = getPool();
  const issues: OperacaoIssue[] = [];

  const contasR = await pool.query<{
    id: string;
    nome: string;
    agent_ativo: boolean;
    agent_access_token: string;
    access_token: string;
  }>(
    `SELECT id, nome, COALESCE(agent_ativo, false) AS agent_ativo,
            COALESCE(agent_access_token, '') AS agent_access_token,
            COALESCE(access_token, '') AS access_token
     FROM instagram_accounts WHERE organization_id = $1::uuid`,
    [organizationId]
  );

  const contas = contasR.rows;
  let agentesAtivos = 0;
  let comIgaa = 0;

  if (contas.length === 0) {
    issues.push({
      code: "NO_INSTAGRAM_ACCOUNT",
      message: "Nenhuma conta Instagram cadastrada — configure em Agentes Instagram.",
      severity: "error",
    });
  }

  for (const c of contas) {
    if (c.agent_ativo) {
      agentesAtivos++;
      const agentTok = c.agent_access_token.trim();
      if (!agentTok) {
        issues.push({
          code: "AGENT_TOKEN_MISSING",
          message: `Conta "${c.nome}": agente ativo sem token IGAA.`,
          severity: "error",
        });
      } else if (!isInstagramLoginToken(agentTok)) {
        issues.push({
          code: "AGENT_TOKEN_NOT_IGAA",
          message: `Conta "${c.nome}": token do agente deve ser IGAA/IGQV.`,
          severity: "error",
        });
      } else {
        comIgaa++;
      }
    }
    if (!c.access_token.trim()) {
      issues.push({
        code: "PUBLISH_TOKEN_MISSING",
        message: `Conta "${c.nome}": token de publicação (EAA) ausente — sync de posts pode falhar.`,
        severity: "warning",
      });
    }
  }

  const wa = await getWhatsappInstanceForOrg(organizationId);
  const evolutionConfigured = isEvolutionConfigured();
  let connectionState: string | null = null;

  if (!evolutionConfigured) {
    issues.push({
      code: "EVOLUTION_NOT_CONFIGURED",
      message: "Evolution não configurada na API (EVOLUTION_BASE_URL).",
      severity: "warning",
    });
  }

  if (!wa?.instance_name?.trim()) {
    issues.push({
      code: "WHATSAPP_NOT_CONNECTED",
      message: "WhatsApp não conectado — escaneie o QR em WhatsApp & leads.",
      severity: "warning",
    });
  } else if (evolutionConfigured) {
    try {
      const st = await getEvolutionInstanceStatus(
        wa.instance_name,
        resolveEvolutionBaseUrl(wa.evolution_base_url)
      );
      connectionState = st.state;
      if (st.state !== "open") {
        issues.push({
          code: "WHATSAPP_DISCONNECTED",
          message: `Instância "${wa.instance_name}" desconectada (${st.state}).`,
          severity: "error",
        });
      }
    } catch {
      issues.push({
        code: "WHATSAPP_STATUS_UNKNOWN",
        message: "Não foi possível consultar status da Evolution.",
        severity: "warning",
      });
    }
  }

  if (wa?.agent_ativo && !wa.instance_name?.trim()) {
    issues.push({
      code: "WA_AGENT_NO_INSTANCE",
      message: "Agente WhatsApp ativo sem instância Evolution.",
      severity: "error",
    });
  }

  const orgR = await pool.query<{ handoff_whatsapp: string }>(
    `SELECT COALESCE(handoff_whatsapp, '') AS handoff_whatsapp FROM organizations WHERE id = $1::uuid`,
    [organizationId]
  );
  if (wa?.agent_ativo && !orgR.rows[0]?.handoff_whatsapp?.trim()) {
    issues.push({
      code: "HANDOFF_PHONE_MISSING",
      message: "WhatsApp do consultor (handoff) não configurado em Empresa.",
      severity: "info",
    });
  }

  const hasError = issues.some((i) => i.severity === "error");

  return {
    ok: !hasError,
    issues,
    instagram: {
      contas: contas.length,
      agentes_ativos: agentesAtivos,
      com_token_agente_igaa: comIgaa,
    },
    whatsapp: {
      evolution_configured: evolutionConfigured,
      agent_ativo: Boolean(wa?.agent_ativo),
      instance_name: wa?.instance_name ?? null,
      connection_state: connectionState,
    },
  };
}
