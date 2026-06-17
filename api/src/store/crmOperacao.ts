import {
  evaluateFollowUp,
  pct,
  sortFollowUps,
  type FollowUpItem,
  type LeadActivitySnapshot,
} from "../services/crmInsights.js";
import { ensureTables, getPool } from "../db/index.js";
import { isInstagramLoginToken } from "../util/graphToken.js";
import {
  getEvolutionInstanceStatus,
  isEvolutionConfigured,
  resolveEvolutionBaseUrl,
} from "../services/evolution.js";
import { getWhatsappInstanceForOrg } from "./whatsappInstance.js";
import { countPendingCrmFollowUps } from "./crmFollowUpSchedule.js";

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
  canal: "comentario" | "direct" | "whatsapp" | "visita";
  direction: "inbound" | "outbound";
  text: string;
  at: string;
  ref: string | null;
};

export type PipelineMetrics = {
  period_days: number;
  taxa_comentario_para_lead: number | null;
  taxa_lead_para_whatsapp: number | null;
  taxa_whatsapp_para_handoff: number | null;
  taxa_handoff_para_convertido: number | null;
  leads_ativos: number;
  leads_parados_72h: number;
  follow_ups_pendentes: number;
  wa_followups_agendados: number;
};

export type LeadTimelineDetail = {
  id: number;
  nome: string | null;
  id_instagram: string;
  whatsapp: string | null;
  username_instagram: string | null;
  status: string;
  objetivo: string | null;
  origem_interacao: string | null;
  url_interesse: string | null;
  handoff_motivo: string | null;
  crm_notas: string | null;
  proximo_followup_em: string | null;
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
): Promise<{ lead: LeadTimelineDetail; timeline: TimelineItem[] } | null> {
  await ensureTables();
  const pool = getPool();

  const leadR = await pool.query<{
    id: number;
    nome: string | null;
    id_instagram: string;
    whatsapp: string | null;
    whatsapp_digits: string | null;
    username_instagram: string | null;
    status: string;
    objetivo: string | null;
    origem_interacao: string | null;
    url_interesse: string | null;
    handoff_motivo: string | null;
    crm_notas: string | null;
    proximo_followup_em: Date | null;
  }>(
    `SELECT id, nome, id_instagram, whatsapp, whatsapp_digits, username_instagram,
            status, objetivo, origem_interacao, url_interesse, handoff_motivo,
            crm_notas, proximo_followup_em
     FROM leads WHERE id = $1 AND organization_id = $2::uuid LIMIT 1`,
    [leadId, organizationId]
  );
  const lead = leadR.rows[0];
  if (!lead) return null;

  const igId = lead.id_instagram;
  const phone = lead.whatsapp_digits ?? "";

  const [comR, dirR, waR, visR] = await Promise.all([
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
    pool.query<{ at: Date; text: string | null; ref: string; status: string }>(
      `SELECT COALESCE(data_visita, created_at) AS at,
              COALESCE(observacoes, 'Compromisso agendado') AS text,
              id::text AS ref, status
       FROM visitas
       WHERE organization_id = $1::uuid AND lead_id = $2`,
      [organizationId, leadId]
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
  for (const row of visR.rows) {
    const statusNote = row.status !== "agendada" ? ` (${row.status})` : "";
    items.push({
      canal: "visita",
      direction: "outbound",
      text: `${(row.text ?? "Compromisso").trim()}${statusNote}`,
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
      username_instagram: lead.username_instagram,
      status: lead.status ?? "novo",
      objetivo: lead.objetivo,
      origem_interacao: lead.origem_interacao,
      url_interesse: lead.url_interesse,
      handoff_motivo: lead.handoff_motivo,
      crm_notas: lead.crm_notas,
      proximo_followup_em: lead.proximo_followup_em
        ? new Date(lead.proximo_followup_em).toISOString()
        : null,
    },
    timeline: items.filter((i) => i.text.length > 0),
  };
}

async function fetchLeadActivitySnapshots(organizationId: string): Promise<LeadActivitySnapshot[]> {
  await ensureTables();
  const pool = getPool();

  const r = await pool.query<{
    id: number;
    nome: string | null;
    username_instagram: string | null;
    whatsapp: string | null;
    status: string;
    objetivo: string | null;
    handoff_at: Date | null;
    handoff_motivo: string | null;
    whatsapp_boas_vindas_enviado: boolean;
    whatsapp_primeira_ia_enviada: boolean;
    whatsapp_ia_agendada_em: Date | null;
    proximo_followup_em: Date | null;
    id_instagram: string;
    last_inbound_at: Date | null;
    last_outbound_at: Date | null;
    last_any_at: Date | null;
    has_direct: boolean;
    has_whatsapp_msgs: boolean;
    visita_proxima: Date | null;
    pending_wa_followup_at: Date | null;
  }>(
    `SELECT l.id, l.nome, l.username_instagram, l.whatsapp, l.status, l.objetivo,
            l.handoff_at, l.handoff_motivo, l.whatsapp_boas_vindas_enviado,
            l.whatsapp_primeira_ia_enviada, l.whatsapp_ia_agendada_em, l.proximo_followup_em,
            l.id_instagram,
            act.last_inbound_at, act.last_outbound_at, act.last_any_at,
            act.has_direct, act.has_whatsapp_msgs,
            (SELECT MIN(v.data_visita) FROM visitas v
             WHERE v.lead_id = l.id AND v.organization_id = l.organization_id
               AND v.status = 'agendada' AND v.data_visita >= NOW()) AS visita_proxima,
            (SELECT MIN(f.agendado_para) FROM crm_followup_mensagens f
             WHERE f.lead_id = l.id AND f.organization_id = l.organization_id
               AND f.status = 'pendente' AND f.agendado_para > NOW()) AS pending_wa_followup_at
     FROM leads l
     LEFT JOIN LATERAL (
       SELECT
         MAX(CASE WHEN ev.dir = 'in' THEN ev.at END) AS last_inbound_at,
         MAX(CASE WHEN ev.dir = 'out' THEN ev.at END) AS last_outbound_at,
         MAX(ev.at) AS last_any_at,
         BOOL_OR(ev.src = 'direct') AS has_direct,
         BOOL_OR(ev.src = 'wa') AS has_whatsapp_msgs
       FROM (
         SELECT COALESCE(c.data_comentario, c.created_at) AS at, 'in'::text AS dir, 'comentario'::text AS src
         FROM comentarios c
         WHERE c.organization_id = l.organization_id AND c.id_insta_lead = l.id_instagram
         UNION ALL
         SELECT COALESCE(d.data_direct, d.created_at),
                CASE WHEN d.enviado_pelo_negocio THEN 'out' ELSE 'in' END,
                'direct'
         FROM direct d
         WHERE d.organization_id = l.organization_id AND d.id_insta_lead = l.id_instagram
         UNION ALL
         SELECT wm.created_at,
                CASE WHEN wm.direction = 'outbound' THEN 'out' ELSE 'in' END,
                'wa'
         FROM whatsapp_messages wm
         WHERE wm.organization_id = l.organization_id
           AND (wm.lead_id = l.id OR (COALESCE(l.whatsapp_digits, '') <> '' AND wm.telefone = l.whatsapp_digits))
       ) ev
     ) act ON true
     WHERE l.organization_id = $1::uuid
       AND l.status NOT IN ('convertido', 'perdido')
     ORDER BY COALESCE(act.last_any_at, l.updated_at) DESC NULLS LAST
     LIMIT 300`,
    [organizationId]
  );

  return r.rows.map((row) => ({
    id: row.id,
    nome: row.nome,
    username_instagram: row.username_instagram,
    whatsapp: row.whatsapp,
    status: row.status ?? "novo",
    objetivo: row.objetivo,
    handoff_at: row.handoff_at ? new Date(row.handoff_at).toISOString() : null,
    handoff_motivo: row.handoff_motivo,
    whatsapp_boas_vindas_enviado: Boolean(row.whatsapp_boas_vindas_enviado),
    whatsapp_primeira_ia_enviada: Boolean(row.whatsapp_primeira_ia_enviada),
    whatsapp_ia_agendada_em: row.whatsapp_ia_agendada_em
      ? new Date(row.whatsapp_ia_agendada_em).toISOString()
      : null,
    proximo_followup_em: row.proximo_followup_em
      ? new Date(row.proximo_followup_em).toISOString()
      : null,
    last_inbound_at: row.last_inbound_at ? new Date(row.last_inbound_at).toISOString() : null,
    last_outbound_at: row.last_outbound_at ? new Date(row.last_outbound_at).toISOString() : null,
    last_any_at: row.last_any_at ? new Date(row.last_any_at).toISOString() : null,
    has_direct: Boolean(row.has_direct),
    has_whatsapp_msgs: Boolean(row.has_whatsapp_msgs),
    visita_proxima: row.visita_proxima ? new Date(row.visita_proxima).toISOString() : null,
    pending_wa_followup_at: row.pending_wa_followup_at
      ? new Date(row.pending_wa_followup_at).toISOString()
      : null,
  }));
}

export async function getFollowUpQueue(organizationId: string): Promise<FollowUpItem[]> {
  const snapshots = await fetchLeadActivitySnapshots(organizationId);
  const items: FollowUpItem[] = [];
  for (const snap of snapshots) {
    const hit = evaluateFollowUp(snap);
    if (hit) items.push(hit);
  }
  return sortFollowUps(items);
}

export async function getPipelineMetrics(
  organizationId: string,
  days?: number
): Promise<PipelineMetrics> {
  const funnel = await getFunnelStats(organizationId, days);
  const snapshots = await fetchLeadActivitySnapshots(organizationId);
  const followUps = snapshots
    .map((s) => evaluateFollowUp(s))
    .filter((x): x is FollowUpItem => x !== null);

  const now = Date.now();
  const parados72h = snapshots.filter((s) => {
    if (!s.last_inbound_at) return false;
    const h = (now - new Date(s.last_inbound_at).getTime()) / (1000 * 60 * 60);
    return h >= 72;
  }).length;

  const convertidos = funnel.leads_por_status.convertido ?? 0;
  const waAgendados = await countPendingCrmFollowUps(organizationId);

  return {
    period_days: funnel.period_days,
    taxa_comentario_para_lead:
      funnel.comentarios > 0 ? pct(funnel.leads_total, funnel.comentarios) : null,
    taxa_lead_para_whatsapp:
      funnel.leads_total > 0 ? pct(funnel.leads_com_whatsapp, funnel.leads_total) : null,
    taxa_whatsapp_para_handoff:
      funnel.leads_com_whatsapp > 0 ? pct(funnel.handoffs, funnel.leads_com_whatsapp) : null,
    taxa_handoff_para_convertido:
      funnel.handoffs > 0 ? pct(convertidos, funnel.handoffs) : null,
    leads_ativos: snapshots.length,
    leads_parados_72h: parados72h,
    follow_ups_pendentes: followUps.length,
    wa_followups_agendados: waAgendados,
  };
}

export type OperacaoWeekly = {
  period_days: number;
  novos_leads: number;
  convertidos: number;
  handoffs: number;
  followups_enviados: number;
  cadencia_agendada: number;
  comentarios: number;
};

export async function getOperacaoWeekly(organizationId: string): Promise<OperacaoWeekly> {
  await ensureTables();
  const pool = getPool();
  const since = new Date();
  since.setDate(since.getDate() - 7);

  const [leadsR, convR, handR, fuR, cadR, comR] = await Promise.all([
    pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM leads
       WHERE organization_id = $1::uuid AND created_at >= $2`,
      [organizationId, since]
    ),
    pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM leads
       WHERE organization_id = $1::uuid AND status = 'convertido'
         AND updated_at >= $2`,
      [organizationId, since]
    ),
    pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM leads
       WHERE organization_id = $1::uuid AND handoff_at >= $2`,
      [organizationId, since]
    ),
    pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM crm_followup_mensagens
       WHERE organization_id = $1::uuid AND status = 'enviado' AND sent_at >= $2`,
      [organizationId, since]
    ),
    pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM crm_followup_mensagens
       WHERE organization_id = $1::uuid AND origin_hint LIKE 'cadencia%'
         AND created_at >= $2`,
      [organizationId, since]
    ),
    pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM comentarios
       WHERE organization_id = $1::uuid
         AND COALESCE(data_comentario, created_at) >= $2`,
      [organizationId, since]
    ),
  ]);

  return {
    period_days: 7,
    novos_leads: Number(leadsR.rows[0]?.n ?? 0),
    convertidos: Number(convR.rows[0]?.n ?? 0),
    handoffs: Number(handR.rows[0]?.n ?? 0),
    followups_enviados: Number(fuR.rows[0]?.n ?? 0),
    cadencia_agendada: Number(cadR.rows[0]?.n ?? 0),
    comentarios: Number(comR.rows[0]?.n ?? 0),
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
