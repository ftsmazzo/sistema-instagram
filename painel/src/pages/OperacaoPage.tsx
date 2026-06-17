import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type CrmFollowUpMessageRes,
  type FollowUpItemRes,
  type FunnelStatsRes,
  type LeadCoachRes,
  type LeadListItemRes,
  type LeadTimelineDetailRes,
  type OperacaoHealthRes,
  type PipelineMetricsRes,
  type TimelineItemRes,
} from "../api/client";
import { PageShell } from "../components/layout/PageShell";

const LEAD_STATUSES = [
  { id: "novo", label: "Novo" },
  { id: "em_conversa", label: "Em conversa" },
  { id: "qualificado", label: "Qualificado" },
  { id: "handoff", label: "Handoff" },
  { id: "convertido", label: "Convertido" },
  { id: "perdido", label: "Perdido" },
];

type ViewFilter = "todos" | "followup" | "quente";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPct(v: number | null): string {
  if (v === null) return "—";
  return `${v}%`;
}

function statusLabel(status: string): string {
  return LEAD_STATUSES.find((s) => s.id === status)?.label ?? status;
}

function canalLabel(canal: TimelineItemRes["canal"]): string {
  if (canal === "comentario") return "Comentário";
  if (canal === "direct") return "Direct";
  if (canal === "visita") return "Compromisso";
  return "WhatsApp";
}

function issueClass(severity: string): string {
  if (severity === "error") return "border-red-200 bg-red-50 text-red-900";
  if (severity === "warning") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function priorityClass(p: FollowUpItemRes["priority"]): string {
  if (p === "critical") return "bg-red-100 text-red-900";
  if (p === "high") return "bg-orange-100 text-orange-900";
  if (p === "medium") return "bg-amber-100 text-amber-900";
  return "bg-slate-100 text-slate-700";
}

function priorityLabel(p: FollowUpItemRes["priority"]): string {
  if (p === "critical") return "Urgente";
  if (p === "high") return "Alta";
  if (p === "medium") return "Média";
  return "Baixa";
}

function tempClass(t: string): string {
  if (t === "quente") return "bg-red-100 text-red-800";
  if (t === "morno") return "bg-amber-100 text-amber-900";
  return "bg-slate-100 text-slate-600";
}

function riscoClass(r: LeadCoachRes["risco_perda"]): string {
  if (r === "alto") return "text-red-700";
  if (r === "medio") return "text-amber-700";
  return "text-emerald-700";
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function schedulePresetHours(hours: number): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() + Math.max(hours * 60, 5));
  return toLocalInput(d);
}

function schedulePresetTomorrow9(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return toLocalInput(d);
}

function followUpStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pendente: "Agendado",
    enviando: "Enviando…",
    enviado: "Enviado",
    cancelado: "Cancelado",
    falhou: "Falhou",
  };
  return map[status] ?? status;
}

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card flex flex-col gap-1 border-slate-200/80 p-4">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <span className="font-display text-3xl font-bold text-slate-900">{value}</span>
      {sub ? <span className="text-xs text-slate-500">{sub}</span> : null}
    </div>
  );
}

export function OperacaoPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [funnel, setFunnel] = useState<FunnelStatsRes | null>(null);
  const [pipeline, setPipeline] = useState<PipelineMetricsRes | null>(null);
  const [health, setHealth] = useState<OperacaoHealthRes | null>(null);
  const [followUps, setFollowUps] = useState<FollowUpItemRes[]>([]);
  const [scheduledOrg, setScheduledOrg] = useState<CrmFollowUpMessageRes[]>([]);
  const [leadScheduled, setLeadScheduled] = useState<CrmFollowUpMessageRes[]>([]);
  const [leads, setLeads] = useState<LeadListItemRes[]>([]);
  const [viewFilter, setViewFilter] = useState<ViewFilter>("todos");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [leadDetail, setLeadDetail] = useState<LeadTimelineDetailRes | null>(null);
  const [timeline, setTimeline] = useState<TimelineItemRes[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [coach, setCoach] = useState<LeadCoachRes | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [notasDraft, setNotasDraft] = useState("");
  const [statusDraft, setStatusDraft] = useState("");
  const [followupDraft, setFollowupDraft] = useState("");
  const [savingLead, setSavingLead] = useState(false);
  const [waMessageDraft, setWaMessageDraft] = useState("");
  const [waScheduleDraft, setWaScheduleDraft] = useState("");
  const [schedulingWa, setSchedulingWa] = useState(false);

  const followUpByLead = useMemo(() => {
    const map = new Map<number, FollowUpItemRes>();
    for (const f of followUps) map.set(f.lead_id, f);
    return map;
  }, [followUps]);

  const visibleLeads = useMemo(() => {
    if (viewFilter === "followup") {
      const ids = new Set(followUps.map((f) => f.lead_id));
      return leads.filter((l) => ids.has(l.id));
    }
    if (viewFilter === "quente") {
      return leads.filter((l) => {
        const f = followUpByLead.get(l.id);
        return f?.temperature === "quente" || l.status === "qualificado" || l.status === "handoff";
      });
    }
    return leads;
  }, [leads, viewFilter, followUps, followUpByLead]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const warnings: string[] = [];

    const settled = await Promise.allSettled([
      api.agentes.getFunnel(30),
      api.agentes.getOperacaoPipeline(30),
      api.agentes.getOperacaoHealth(),
      api.agentes.getFollowUps(),
      api.agentes.getScheduledFollowUps(),
      api.agentes.getLeads({ limit: 50 }),
    ]);

    const pick = <T,>(idx: number, fallback: T): T => {
      const r = settled[idx];
      if (r.status === "fulfilled") return r.value as T;
      const reason = r.reason instanceof Error ? r.reason.message : "Erro desconhecido";
      warnings.push(reason);
      return fallback;
    };

    setFunnel(pick(0, null));
    setPipeline(pick(1, null));
    setHealth(pick(2, null));
    const fu = pick(3, { items: [] as FollowUpItemRes[] });
    setFollowUps(fu.items);
    const sch = pick(4, { items: [] as CrmFollowUpMessageRes[] });
    setScheduledOrg(sch.items);
    const l = pick(5, { leads: [] as LeadListItemRes[] });
    setLeads(l.leads);

    if (warnings.length > 0) {
      const all404 = warnings.every((w) => /404|não encontrada|not found/i.test(w));
      if (all404) {
        setError(
          "API desatualizada ou URL incorreta (404). Redeploy do serviço API no EasyPanel e confira VITE_API_URL no build do painel."
        );
      } else if (settled.every((r) => r.status === "rejected")) {
        setError(warnings[0] ?? "Erro ao carregar operação.");
      } else {
        setError(`Alguns dados não carregaram: ${warnings[0]}`);
      }
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openTimeline = async (leadId: number) => {
    if (selectedId === leadId) {
      setSelectedId(null);
      setTimeline([]);
      setLeadDetail(null);
      setCoach(null);
      setLeadScheduled([]);
      return;
    }
    setSelectedId(leadId);
    setTimelineLoading(true);
    setCoach(null);
    setWaMessageDraft("");
    setWaScheduleDraft(schedulePresetHours(2));
    try {
      const res = await api.agentes.getLeadTimeline(leadId);
      const sch = await api.agentes.getLeadScheduledFollowUps(leadId);
      setLeadDetail(res.lead);
      setTimeline(res.timeline);
      setLeadScheduled(sch.items);
      setNotasDraft(res.lead.crm_notas ?? "");
      setStatusDraft(res.lead.status);
      setFollowupDraft(
        res.lead.proximo_followup_em
          ? new Date(res.lead.proximo_followup_em).toISOString().slice(0, 16)
          : ""
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar conversa.");
      setTimeline([]);
      setLeadDetail(null);
    } finally {
      setTimelineLoading(false);
    }
  };

  const saveLeadCrm = async () => {
    if (!selectedId) return;
    setSavingLead(true);
    setError(null);
    try {
      const res = await api.agentes.updateLead(selectedId, {
        status: statusDraft,
        crm_notas: notasDraft,
        proximo_followup_em: followupDraft ? new Date(followupDraft).toISOString() : null,
      });
      setLeads((prev) => prev.map((l) => (l.id === selectedId ? res.lead : l)));
      if (leadDetail) {
        setLeadDetail({
          ...leadDetail,
          status: res.lead.status,
          crm_notas: res.lead.crm_notas,
          proximo_followup_em: res.lead.proximo_followup_em,
        });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar lead.");
    } finally {
      setSavingLead(false);
    }
  };

  const requestAiCoach = async () => {
    if (!selectedId) return;
    setCoachLoading(true);
    setError(null);
    try {
      const res = await api.agentes.getLeadAiCoach(selectedId);
      setCoach(res.coach);
      if (res.coach.mensagem_sugerida && !waMessageDraft.trim()) {
        setWaMessageDraft(res.coach.mensagem_sugerida);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao gerar sugestão de IA.");
    } finally {
      setCoachLoading(false);
    }
  };

  const scheduleWaFollowUp = async (originHint = "manual", messageOverride?: string) => {
    if (!selectedId) return;
    const text = (messageOverride ?? waMessageDraft).trim();
    if (!text) {
      setError("Escreva a mensagem de follow-up.");
      return;
    }
    if (!waScheduleDraft) {
      setError("Escolha data e hora para envio.");
      return;
    }
    setSchedulingWa(true);
    setError(null);
    try {
      const res = await api.agentes.scheduleLeadFollowUp(selectedId, {
        message_text: text,
        agendado_para: new Date(waScheduleDraft).toISOString(),
        origin_hint: originHint,
      });
      setLeadScheduled((prev) => [res.item, ...prev]);
      setScheduledOrg((prev) => [res.item, ...prev]);
      setWaMessageDraft("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao agendar WhatsApp.");
    } finally {
      setSchedulingWa(false);
    }
  };

  const cancelScheduled = async (followupId: number) => {
    setError(null);
    try {
      await api.agentes.cancelScheduledFollowUp(followupId);
      setLeadScheduled((prev) => prev.filter((x) => x.id !== followupId));
      setScheduledOrg((prev) => prev.filter((x) => x.id !== followupId));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao cancelar agendamento.");
    }
  };

  const copyMessage = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

  return (
    <PageShell
      title="Operação"
      description="CRM de conversão — follow-ups, pipeline e sugestões para fechar vendas (não postagem)."
      wide
    >
      {loading ? (
        <p className="text-sm text-slate-600">Carregando…</p>
      ) : (
        <div className="space-y-8">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
          )}

          {pipeline && (
            <section>
              <h2 className="mb-4 text-lg font-semibold text-slate-900">Pipeline de conversão</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
                <KpiCard label="Coment. → Lead" value={formatPct(pipeline.taxa_comentario_para_lead)} sub="captura no CRM" />
                <KpiCard label="Lead → WhatsApp" value={formatPct(pipeline.taxa_lead_para_whatsapp)} sub="handoff de canal" />
                <KpiCard label="WA → Handoff" value={formatPct(pipeline.taxa_whatsapp_para_handoff)} sub="humano acionado" />
                <KpiCard label="Handoff → Venda" value={formatPct(pipeline.taxa_handoff_para_convertido)} sub="convertidos" />
                <KpiCard label="Leads ativos" value={pipeline.leads_ativos} />
                <KpiCard label="Parados 72h+" value={pipeline.leads_parados_72h} sub="risco de esfriar" />
                <KpiCard label="Follow-ups" value={pipeline.follow_ups_pendentes} sub="ações sugeridas" />
                <KpiCard label="WA agendados" value={pipeline.wa_followups_agendados} sub="envio programado" />
              </div>
            </section>
          )}

          {scheduledOrg.length > 0 && (
            <section className="card border-emerald-200/80 bg-emerald-50/30">
              <h2 className="mb-3 text-lg font-semibold text-slate-900">WhatsApp programados</h2>
              <p className="mb-3 text-sm text-slate-600">
                Mensagens de retomada de venda — enviadas automaticamente pela Evolution (cron a cada 1 min).
              </p>
              <ul className="space-y-2">
                {scheduledOrg.slice(0, 10).map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm cursor-pointer hover:bg-emerald-50/50"
                    onClick={() => openTimeline(item.lead_id)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">
                        {item.lead_nome ?? "Lead"} · {formatDateTime(item.agendado_para)}
                      </p>
                      <p className="text-xs text-slate-600 truncate">{item.message_text}</p>
                    </div>
                    <button
                      type="button"
                      className="text-xs font-semibold text-red-600 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        cancelScheduled(item.id);
                      }}
                    >
                      Cancelar
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {followUps.length > 0 && (
            <section className="card border-amber-200/80 bg-amber-50/30">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Ações prioritárias</h2>
                  <p className="text-sm text-slate-600">
                    Leads que precisam de atenção humana para não perder a venda.
                    {pipeline?.ai_disponivel ? " Use IA no detalhe do lead para mensagem pronta." : " Configure OPENAI_API_KEY na API para sugestões com IA."}
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-amber-200/60 text-slate-600">
                      <th className="py-2 pr-3 font-medium">Prioridade</th>
                      <th className="py-2 pr-3 font-medium">Lead</th>
                      <th className="py-2 pr-3 font-medium">Etapa</th>
                      <th className="py-2 pr-3 font-medium">Motivo</th>
                      <th className="py-2 font-medium">Ação sugerida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {followUps.slice(0, 8).map((f) => (
                      <tr
                        key={f.lead_id}
                        className="border-b border-amber-100/80 cursor-pointer hover:bg-white/60"
                        onClick={() => openTimeline(f.lead_id)}
                      >
                        <td className="py-2 pr-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${priorityClass(f.priority)}`}>
                            {priorityLabel(f.priority)}
                          </span>
                        </td>
                        <td className="py-2 pr-3">
                          <div className="font-medium text-slate-900">{f.nome ?? "—"}</div>
                          <div className="text-xs text-slate-500">
                            {f.username_instagram ? `@${f.username_instagram}` : f.whatsapp ?? "—"}
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-xs">{f.funil_etapa}</td>
                        <td className="py-2 pr-3 text-xs text-slate-700 max-w-[200px]">{f.motivo}</td>
                        <td className="py-2 text-xs text-indigo-800">{f.acao_sugerida}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {health && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">Saúde do sistema</h2>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    health.ok ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                  }`}
                >
                  {health.ok ? "Operacional" : "Atenção necessária"}
                </span>
              </div>
              {health.issues.length === 0 ? (
                <p className="text-sm text-emerald-700">Agentes e Evolution OK — foco em converter leads.</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {health.issues.map((issue) => (
                    <li key={issue.code + issue.message} className={`rounded-lg border px-3 py-2 text-sm ${issueClass(issue.severity)}`}>
                      {issue.message}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {funnel && (
            <section>
              <h2 className="mb-4 text-lg font-semibold text-slate-900">Volume — últimos {funnel.period_days} dias</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                <KpiCard label="Comentários" value={funnel.comentarios} />
                <KpiCard label="Direct (lead)" value={funnel.direct_inbound} sub={`${funnel.direct_outbound} respostas bot`} />
                <KpiCard label="Leads CRM" value={funnel.leads_total} sub={`${funnel.leads_com_whatsapp} com WhatsApp`} />
                <KpiCard label="WA inbound" value={funnel.whatsapp_inbound} sub={`${funnel.whatsapp_outbound} outbound`} />
                <KpiCard label="Handoffs" value={funnel.handoffs} />
                <KpiCard
                  label="Qualificados"
                  value={funnel.leads_por_status.qualificado ?? 0}
                  sub={`${funnel.leads_por_status.convertido ?? 0} convertidos`}
                />
              </div>
            </section>
          )}

          <section className="card">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Leads — gestão comercial</h2>
                <p className="text-sm text-gray-600">Abra o lead para conversa, notas, status e coach de vendas.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["todos", "followup", "quente"] as ViewFilter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setViewFilter(f)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      viewFilter === f ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {f === "todos" ? "Todos" : f === "followup" ? "Com follow-up" : "Quentes"}
                  </button>
                ))}
                <Link to="/whatsapp" className="text-sm font-semibold text-indigo-600 hover:underline self-center">
                  WhatsApp →
                </Link>
              </div>
            </div>

            {visibleLeads.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum lead neste filtro.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-600">
                      <th className="py-2 pr-4 font-medium">Nome</th>
                      <th className="py-2 pr-4 font-medium">Instagram</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 pr-4 font-medium">Alerta</th>
                      <th className="py-2 pr-4 font-medium">Atualizado</th>
                      <th className="py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLeads.map((lead) => {
                      const fu = followUpByLead.get(lead.id);
                      return (
                        <Fragment key={lead.id}>
                          <tr
                            className={`border-b border-gray-100 cursor-pointer hover:bg-slate-50 ${
                              selectedId === lead.id ? "bg-indigo-50/50" : ""
                            }`}
                            onClick={() => openTimeline(lead.id)}
                          >
                            <td className="py-2 pr-4">{lead.nome ?? "—"}</td>
                            <td className="py-2 pr-4">
                              {lead.username_instagram ? `@${lead.username_instagram}` : "—"}
                            </td>
                            <td className="py-2 pr-4">
                              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{statusLabel(lead.status)}</span>
                            </td>
                            <td className="py-2 pr-4">
                              {fu ? (
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${priorityClass(fu.priority)}`}>
                                  {priorityLabel(fu.priority)}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </td>
                            <td className="py-2 pr-4 text-xs text-gray-500">{formatDateTime(lead.updated_at)}</td>
                            <td className="py-2 text-xs font-medium text-indigo-600">
                              {selectedId === lead.id ? "Fechar" : "Abrir"}
                            </td>
                          </tr>
                          {selectedId === lead.id && (
                            <tr>
                              <td colSpan={6} className="bg-slate-50 px-4 py-4">
                                {timelineLoading ? (
                                  <p className="text-sm text-slate-500">Carregando…</p>
                                ) : (
                                  <div className="grid gap-6 lg:grid-cols-2">
                                    <div className="space-y-4">
                                      {leadDetail && (
                                        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm space-y-2">
                                          <p><span className="text-slate-500">Objetivo:</span> {leadDetail.objetivo ?? "—"}</p>
                                          <p><span className="text-slate-500">Origem:</span> {leadDetail.origem_interacao ?? "—"}</p>
                                          {leadDetail.url_interesse && (
                                            <p>
                                              <span className="text-slate-500">Interesse:</span>{" "}
                                              <a href={leadDetail.url_interesse} target="_blank" rel="noreferrer" className="text-indigo-600 underline">
                                                link
                                              </a>
                                            </p>
                                          )}
                                          {leadDetail.handoff_motivo && (
                                            <p><span className="text-slate-500">Handoff:</span> {leadDetail.handoff_motivo}</p>
                                          )}
                                          {followUpByLead.get(lead.id) && (
                                            <p className="text-amber-800 text-xs border-t border-slate-100 pt-2">
                                              {followUpByLead.get(lead.id)!.acao_sugerida}
                                            </p>
                                          )}
                                        </div>
                                      )}

                                      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
                                        <h3 className="font-semibold text-emerald-950">Agendar WhatsApp (retomar venda)</h3>
                                        {!leadDetail?.whatsapp ? (
                                          <p className="text-xs text-amber-800">Lead sem WhatsApp — capture o número antes de agendar.</p>
                                        ) : (
                                          <>
                                            <label className="block text-xs text-slate-600">
                                              Mensagem
                                              <textarea
                                                className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-sm min-h-[90px] bg-white"
                                                value={waMessageDraft}
                                                onChange={(e) => setWaMessageDraft(e.target.value)}
                                                onClick={(e) => e.stopPropagation()}
                                                placeholder="Olá! Vi que você demonstrou interesse…"
                                              />
                                            </label>
                                            <label className="block text-xs text-slate-600">
                                              Enviar em
                                              <input
                                                type="datetime-local"
                                                className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-sm bg-white"
                                                value={waScheduleDraft}
                                                onChange={(e) => setWaScheduleDraft(e.target.value)}
                                                onClick={(e) => e.stopPropagation()}
                                              />
                                            </label>
                                            <div className="flex flex-wrap gap-2">
                                              <button
                                                type="button"
                                                className="rounded-full bg-white border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-900"
                                                onClick={(e) => { e.stopPropagation(); setWaScheduleDraft(schedulePresetHours(2)); }}
                                              >
                                                +2h
                                              </button>
                                              <button
                                                type="button"
                                                className="rounded-full bg-white border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-900"
                                                onClick={(e) => { e.stopPropagation(); setWaScheduleDraft(schedulePresetHours(24)); }}
                                              >
                                                +24h
                                              </button>
                                              <button
                                                type="button"
                                                className="rounded-full bg-white border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-900"
                                                onClick={(e) => { e.stopPropagation(); setWaScheduleDraft(schedulePresetTomorrow9()); }}
                                              >
                                                Amanhã 9h
                                              </button>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                              <button
                                                type="button"
                                                disabled={schedulingWa}
                                                onClick={(e) => { e.stopPropagation(); scheduleWaFollowUp("manual"); }}
                                                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                                              >
                                                {schedulingWa ? "Agendando…" : "Programar envio"}
                                              </button>
                                              {coach?.mensagem_sugerida && (
                                                <button
                                                  type="button"
                                                  disabled={schedulingWa}
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setWaMessageDraft(coach.mensagem_sugerida);
                                                    scheduleWaFollowUp("ai_coach", coach.mensagem_sugerida);
                                                  }}
                                                  className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-900 disabled:opacity-50"
                                                >
                                                  Agendar msg da IA
                                                </button>
                                              )}
                                            </div>
                                            {leadScheduled.filter((x) => x.status === "pendente").length > 0 && (
                                              <ul className="border-t border-emerald-100 pt-2 space-y-1">
                                                {leadScheduled
                                                  .filter((x) => x.status === "pendente" || x.status === "falhou")
                                                  .slice(0, 5)
                                                  .map((item) => (
                                                    <li key={item.id} className="flex justify-between gap-2 text-xs">
                                                      <span className="text-slate-700">
                                                        {followUpStatusLabel(item.status)} · {formatDateTime(item.agendado_para)}
                                                      </span>
                                                      {item.status === "pendente" && (
                                                        <button
                                                          type="button"
                                                          className="text-red-600 font-semibold"
                                                          onClick={(e) => { e.stopPropagation(); cancelScheduled(item.id); }}
                                                        >
                                                          Cancelar
                                                        </button>
                                                      )}
                                                    </li>
                                                  ))}
                                              </ul>
                                            )}
                                          </>
                                        )}
                                      </div>

                                      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                                        <h3 className="font-semibold text-slate-900">Gestão do lead</h3>
                                        <label className="block text-xs text-slate-600">
                                          Status
                                          <select
                                            className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                                            value={statusDraft}
                                            onChange={(e) => setStatusDraft(e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            {LEAD_STATUSES.map((s) => (
                                              <option key={s.id} value={s.id}>{s.label}</option>
                                            ))}
                                          </select>
                                        </label>
                                        <label className="block text-xs text-slate-600">
                                          Próximo follow-up
                                          <input
                                            type="datetime-local"
                                            className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                                            value={followupDraft}
                                            onChange={(e) => setFollowupDraft(e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                          />
                                        </label>
                                        <label className="block text-xs text-slate-600">
                                          Notas do consultor
                                          <textarea
                                            className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-sm min-h-[80px]"
                                            value={notasDraft}
                                            onChange={(e) => setNotasDraft(e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                            placeholder="Objeções, orçamento discutido, próximo passo…"
                                          />
                                        </label>
                                        <div className="flex flex-wrap gap-2">
                                          <button
                                            type="button"
                                            disabled={savingLead}
                                            onClick={(e) => { e.stopPropagation(); saveLeadCrm(); }}
                                            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                                          >
                                            {savingLead ? "Salvando…" : "Salvar CRM"}
                                          </button>
                                          <button
                                            type="button"
                                            disabled={coachLoading || !pipeline?.ai_disponivel}
                                            onClick={(e) => { e.stopPropagation(); requestAiCoach(); }}
                                            className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-900 disabled:opacity-50"
                                          >
                                            {coachLoading ? "Gerando…" : "Sugestão IA (vendas)"}
                                          </button>
                                        </div>
                                      </div>

                                      {coach && (
                                        <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-4 text-sm space-y-2">
                                          <div className="flex flex-wrap gap-2 items-center">
                                            <span className="font-semibold text-violet-950">Coach de conversão</span>
                                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tempClass(coach.temperatura)}`}>
                                              {coach.temperatura}
                                            </span>
                                            <span className={`text-xs font-medium ${riscoClass(coach.risco_perda)}`}>
                                              Risco: {coach.risco_perda}
                                            </span>
                                          </div>
                                          <p className="text-slate-700">{coach.resumo}</p>
                                          <p><span className="font-medium text-slate-800">Próxima ação:</span> {coach.proxima_acao}</p>
                                          {coach.oportunidade && (
                                            <p className="text-emerald-800 text-xs">{coach.oportunidade}</p>
                                          )}
                                          {coach.mensagem_sugerida && (
                                            <div className="rounded bg-white border border-violet-100 p-3">
                                              <p className="text-xs text-slate-500 mb-1">Mensagem sugerida (WhatsApp/Direct)</p>
                                              <p className="whitespace-pre-wrap text-slate-800">{coach.mensagem_sugerida}</p>
                                              <button
                                                type="button"
                                                className="mt-2 text-xs font-semibold text-indigo-600"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setWaMessageDraft(coach.mensagem_sugerida);
                                                  copyMessage(coach.mensagem_sugerida);
                                                }}
                                              >
                                                Usar na agenda · Copiar
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>

                                    <div>
                                      <h3 className="mb-2 text-sm font-semibold text-slate-700">Histórico de conversa</h3>
                                      {timeline.length === 0 ? (
                                        <p className="text-sm text-slate-500">Sem mensagens registradas.</p>
                                      ) : (
                                        <ol className="space-y-3 max-h-[420px] overflow-y-auto">
                                          {timeline.map((item, idx) => (
                                            <li
                                              key={`${item.ref}-${idx}`}
                                              className={`flex gap-3 text-sm ${
                                                item.direction === "outbound" ? "justify-end" : "justify-start"
                                              }`}
                                            >
                                              <div
                                                className={`max-w-[85%] rounded-lg px-3 py-2 ${
                                                  item.direction === "outbound"
                                                    ? item.canal === "visita"
                                                      ? "bg-amber-600 text-white"
                                                      : "bg-indigo-600 text-white"
                                                    : "bg-white border border-slate-200 text-slate-800"
                                                }`}
                                              >
                                                <p className="text-[10px] font-semibold uppercase opacity-80 mb-1">
                                                  {canalLabel(item.canal)} · {formatDateTime(item.at)}
                                                </p>
                                                <p className="whitespace-pre-wrap break-words">{item.text}</p>
                                              </div>
                                            </li>
                                          ))}
                                        </ol>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </PageShell>
  );
}
