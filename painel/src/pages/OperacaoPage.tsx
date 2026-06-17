import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type CadenciaPresetRes,
  type CrmCadenciaConfigRes,
  type CrmFollowUpMessageRes,
  type FollowUpItemRes,
  type FunnelStatsRes,
  type LeadCoachRes,
  type LeadListItemRes,
  type LeadTimelineDetailRes,
  type OperacaoHealthRes,
  type OperacaoWeeklyRes,
  type PipelineMetricsRes,
  type TimelineItemRes,
} from "../api/client";
import { LeadDetailPanel } from "../components/operacao/LeadDetailPanel";
import { OperacaoCadenciaSection } from "../components/operacao/OperacaoCadenciaSection";
import { PageShell } from "../components/layout/PageShell";
import { Drawer } from "../components/ui/Drawer";
import { Stat } from "../components/ui/Stat";
import { TabPanel, Tabs } from "../components/ui/Tabs";

const LEAD_STATUSES = [
  { id: "novo", label: "Novo" },
  { id: "em_conversa", label: "Em conversa" },
  { id: "qualificado", label: "Qualificado" },
  { id: "handoff", label: "Handoff" },
  { id: "convertido", label: "Convertido" },
  { id: "perdido", label: "Perdido" },
];

type ViewFilter = "todos" | "followup" | "quente";
type OperacaoTab = "leads" | "prioridades" | "cadencia" | "relatorio";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPct(v: number | null): string {
  if (v === null) return "\u2014";
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

function scoreClass(score: number | null | undefined): string {
  if (score == null) return "bg-slate-100 text-slate-500";
  if (score >= 65) return "bg-orange-100 text-orange-900";
  if (score >= 35) return "bg-amber-100 text-amber-900";
  return "bg-slate-100 text-slate-600";
}

function leadScoreValue(lead: LeadListItemRes, followUp?: FollowUpItemRes): number | null {
  return lead.crm_score ?? followUp?.crm_score ?? null;
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
  const [weekly, setWeekly] = useState<OperacaoWeeklyRes | null>(null);
  const [cadencia, setCadencia] = useState<CrmCadenciaConfigRes | null>(null);
  const [cadenciaSaving, setCadenciaSaving] = useState(false);
  const [cadenciaPresets, setCadenciaPresets] = useState<CadenciaPresetRes[]>([]);
  const [cadenciaSegmento, setCadenciaSegmento] = useState("");
  const [cadenciaPresetSugerido, setCadenciaPresetSugerido] = useState<string | null>(null);
  const [tab, setTab] = useState<OperacaoTab>("leads");

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
        const score = leadScoreValue(l, f);
        return (
          (score ?? 0) >= 65 ||
          f?.temperature === "quente" ||
          l.status === "qualificado" ||
          l.status === "handoff"
        );
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
      api.agentes.getOperacaoSemanal(),
      api.agentes.getCadenciaConfig(),
      api.agentes.getCadenciaPresets(),
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
    setWeekly(pick(6, null));
    const cadRes = pick(7, { ok: true, config: null as CrmCadenciaConfigRes | null, segmento: "", preset_sugerido: null });
    setCadencia(cadRes.config);
    setCadenciaSegmento(cadRes.segmento ?? "");
    setCadenciaPresetSugerido(cadRes.preset_sugerido ?? null);
    const presetsRes = pick(8, { ok: true, presets: [] as CadenciaPresetRes[] });
    setCadenciaPresets(presetsRes.presets);

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

  const closeDrawer = () => {
    setSelectedId(null);
    setTimeline([]);
    setLeadDetail(null);
    setCoach(null);
    setLeadScheduled([]);
  };

  const openLead = async (leadId: number) => {
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

  const handlePresetSchedule = (preset: number | "tomorrow9") => {
    if (preset === "tomorrow9") setWaScheduleDraft(schedulePresetTomorrow9());
    else setWaScheduleDraft(schedulePresetHours(preset));
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

  const saveCadencia = async () => {
    if (!cadencia) return;
    setCadenciaSaving(true);
    setError(null);
    try {
      const res = await api.agentes.saveCadenciaConfig(cadencia);
      setCadencia(res.config);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar cadência.");
    } finally {
      setCadenciaSaving(false);
    }
  };

  const applyCadenciaPreset = async (presetId: string) => {
    setCadenciaSaving(true);
    setError(null);
    try {
      const res = await api.agentes.applyCadenciaPreset(presetId);
      setCadencia(res.config);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao aplicar template.");
    } finally {
      setCadenciaSaving(false);
    }
  };

  const selectedLead = leads.find((l) => l.id === selectedId);

  return (
    <PageShell
      title="Operação"
      description="CRM de conversão — leads, prioridades, cadência e relatórios."
      wide
    >
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : (
        <>
          {error && <div className="alert-error mb-6">{error}</div>}

          {pipeline && (
            <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Leads ativos" value={pipeline.leads_ativos} accent />
              <Stat label="Follow-ups" value={pipeline.follow_ups_pendentes} sub="precisam ação" />
              <Stat label="Parados 72h+" value={pipeline.leads_parados_72h} sub="risco de esfriar" />
              <Stat
                label="Handoff → venda"
                value={formatPct(pipeline.taxa_handoff_para_convertido)}
                sub="taxa de conversão"
              />
            </div>
          )}

          <Tabs
            tabs={[
              { id: "leads", label: "Leads", badge: leads.length || undefined },
              { id: "prioridades", label: "Prioridades", badge: followUps.length || undefined },
              { id: "cadencia", label: "Cadência" },
              { id: "relatorio", label: "Relatório" },
            ]}
            activeId={tab}
            onChange={(id) => setTab(id as OperacaoTab)}
          />

          <TabPanel className="!mt-6">
            {tab === "leads" && (
              <section className="card !p-0 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                  <p className="text-sm text-slate-600">Clique no lead para abrir o painel lateral.</p>
                  <div className="flex flex-wrap gap-2">
                    {(["todos", "followup", "quente"] as ViewFilter[]).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setViewFilter(f)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          viewFilter === f ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {f === "todos" ? "Todos" : f === "followup" ? "Com follow-up" : "Quentes"}
                      </button>
                    ))}
                    <Link to="/whatsapp" className="self-center text-sm font-semibold text-brand-600 hover:underline">
                      WhatsApp →
                    </Link>
                  </div>
                </div>
                {visibleLeads.length === 0 ? (
                  <p className="px-5 py-8 text-sm text-slate-500">Nenhum lead neste filtro.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/80 text-slate-600">
                          <th className="px-5 py-3 font-medium">Score</th>
                          <th className="py-3 pr-4 font-medium">Nome</th>
                          <th className="py-3 pr-4 font-medium">Instagram</th>
                          <th className="py-3 pr-4 font-medium">Status</th>
                          <th className="py-3 pr-4 font-medium">Temp.</th>
                          <th className="py-3 pr-4 font-medium">Atualizado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleLeads.map((lead) => {
                          const fu = followUpByLead.get(lead.id);
                          const score = leadScoreValue(lead, fu);
                          return (
                            <tr
                              key={lead.id}
                              className={`cursor-pointer border-b border-slate-50 transition hover:bg-brand-50/40 ${
                                selectedId === lead.id ? "bg-brand-50/60" : ""
                              }`}
                              onClick={() => openLead(lead.id)}
                            >
                              <td className="px-5 py-3">
                                <span className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${scoreClass(score)}`}>
                                  {score ?? "—"}
                                </span>
                              </td>
                              <td className="py-3 pr-4 font-medium text-slate-900">{lead.nome ?? "—"}</td>
                              <td className="py-3 pr-4 text-slate-600">
                                {lead.username_instagram ? `@${lead.username_instagram}` : "—"}
                              </td>
                              <td className="py-3 pr-4">
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{statusLabel(lead.status)}</span>
                              </td>
                              <td className="py-3 pr-4">
                                {fu ? (
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tempClass(fu.temperature)}`}>
                                    {fu.temperature}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="py-3 pr-4 text-xs text-slate-500">{formatDateTime(lead.updated_at)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {tab === "prioridades" && (
              <div className="space-y-6">
                {followUps.length > 0 ? (
                  <section className="card border-amber-200/70 bg-amber-50/20">
                    <h2 className="mb-3 text-lg font-semibold text-slate-900">Ações prioritárias</h2>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-amber-200/50 text-slate-600">
                            <th className="py-2 pr-3 font-medium">Score</th>
                            <th className="py-2 pr-3 font-medium">Prioridade</th>
                            <th className="py-2 pr-3 font-medium">Lead</th>
                            <th className="py-2 pr-3 font-medium">Motivo</th>
                            <th className="py-2 font-medium">Ação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {followUps.map((f) => (
                            <tr
                              key={f.lead_id}
                              className="cursor-pointer border-b border-amber-100/60 hover:bg-white/70"
                              onClick={() => openLead(f.lead_id)}
                            >
                              <td className="py-2 pr-3">
                                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${scoreClass(f.crm_score)}`}>
                                  {f.crm_score ?? "—"}
                                </span>
                              </td>
                              <td className="py-2 pr-3">
                                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${priorityClass(f.priority)}`}>
                                  {priorityLabel(f.priority)}
                                </span>
                              </td>
                              <td className="py-2 pr-3">
                                <div className="font-medium">{f.nome ?? "—"}</div>
                                <div className="text-xs text-slate-500">
                                  {f.username_instagram ? `@${f.username_instagram}` : f.whatsapp ?? ""}
                                </div>
                              </td>
                              <td className="py-2 pr-3 text-xs max-w-[200px]">{f.motivo}</td>
                              <td className="py-2 text-xs text-brand-800">{f.acao_sugerida}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ) : (
                  <p className="text-sm text-slate-500">Nenhuma ação prioritária no momento.</p>
                )}

                {scheduledOrg.length > 0 && (
                  <section className="card border-emerald-200/70 bg-emerald-50/20">
                    <h2 className="mb-3 text-lg font-semibold text-slate-900">WhatsApp programados</h2>
                    <ul className="space-y-2">
                      {scheduledOrg.map((item) => (
                        <li
                          key={item.id}
                          className="flex cursor-pointer flex-wrap items-start justify-between gap-2 rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm hover:bg-emerald-50/50"
                          onClick={() => openLead(item.lead_id)}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-slate-900">
                              {item.lead_nome ?? "Lead"} · {formatDateTime(item.agendado_para)}
                              {item.origin_hint?.startsWith("cadencia") ? (
                                <span className="ml-2 rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-800">
                                  Cadência
                                </span>
                              ) : null}
                            </p>
                            <p className="truncate text-xs text-slate-600">{item.message_text}</p>
                          </div>
                          <button
                            type="button"
                            className="text-xs font-semibold text-red-600"
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
              </div>
            )}

            {tab === "cadencia" && cadencia && (
              <OperacaoCadenciaSection
                cadencia={cadencia}
                setCadencia={setCadencia}
                cadenciaPresets={cadenciaPresets}
                cadenciaSegmento={cadenciaSegmento}
                cadenciaPresetSugerido={cadenciaPresetSugerido}
                cadenciaSaving={cadenciaSaving}
                onSave={saveCadencia}
                onApplyPreset={applyCadenciaPreset}
              />
            )}

            {tab === "relatorio" && (
              <div className="space-y-8">
                {weekly && (
                  <section>
                    <h2 className="mb-4 text-lg font-semibold text-slate-900">Semana</h2>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                      <Stat label="Novos leads" value={weekly.novos_leads} />
                      <Stat label="Convertidos" value={weekly.convertidos} />
                      <Stat label="Handoffs" value={weekly.handoffs} />
                      <Stat label="Follow-ups env." value={weekly.followups_enviados} />
                      <Stat label="Cadência auto" value={weekly.cadencia_agendada} />
                      <Stat label="Comentários" value={weekly.comentarios} />
                    </div>
                  </section>
                )}
                {pipeline && (
                  <section>
                    <h2 className="mb-4 text-lg font-semibold text-slate-900">Pipeline</h2>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <Stat label="Coment. → Lead" value={formatPct(pipeline.taxa_comentario_para_lead)} />
                      <Stat label="Lead → WhatsApp" value={formatPct(pipeline.taxa_lead_para_whatsapp)} />
                      <Stat label="WA → Handoff" value={formatPct(pipeline.taxa_whatsapp_para_handoff)} />
                      <Stat label="WA agendados" value={pipeline.wa_followups_agendados} />
                    </div>
                  </section>
                )}
                {funnel && (
                  <section>
                    <h2 className="mb-4 text-lg font-semibold text-slate-900">Volume — {funnel.period_days} dias</h2>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                      <Stat label="Comentários" value={funnel.comentarios} />
                      <Stat label="Direct in" value={funnel.direct_inbound} />
                      <Stat label="Leads CRM" value={funnel.leads_total} />
                      <Stat label="WA in" value={funnel.whatsapp_inbound} />
                      <Stat label="Handoffs" value={funnel.handoffs} />
                      <Stat label="Qualificados" value={funnel.leads_por_status.qualificado ?? 0} />
                    </div>
                  </section>
                )}
                {health && (
                  <section className="card">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h2 className="text-lg font-semibold text-slate-900">Saúde do sistema</h2>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          health.ok ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                        }`}
                      >
                        {health.ok ? "Operacional" : "Atenção"}
                      </span>
                    </div>
                    {health.issues.length === 0 ? (
                      <p className="text-sm text-emerald-700">Agentes e Evolution OK.</p>
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
              </div>
            )}
          </TabPanel>
        </>
      )}

      <Drawer
        open={selectedId !== null}
        onClose={closeDrawer}
        title={leadDetail?.nome ?? selectedLead?.nome ?? "Lead"}
        subtitle={
          leadDetail?.username_instagram
            ? `@${leadDetail.username_instagram}`
            : leadDetail?.whatsapp ?? undefined
        }
      >
        <LeadDetailPanel
          loading={timelineLoading}
          leadDetail={leadDetail}
          timeline={timeline}
          followUp={selectedId != null ? followUpByLead.get(selectedId) : undefined}
          coach={coach}
          coachLoading={coachLoading}
          aiAvailable={Boolean(pipeline?.ai_disponivel)}
          notasDraft={notasDraft}
          statusDraft={statusDraft}
          followupDraft={followupDraft}
          waMessageDraft={waMessageDraft}
          waScheduleDraft={waScheduleDraft}
          schedulingWa={schedulingWa}
          savingLead={savingLead}
          leadScheduled={leadScheduled}
          onNotasChange={setNotasDraft}
          onStatusChange={setStatusDraft}
          onFollowupChange={setFollowupDraft}
          onWaMessageChange={setWaMessageDraft}
          onWaScheduleChange={setWaScheduleDraft}
          onSaveCrm={saveLeadCrm}
          onRequestCoach={requestAiCoach}
          onScheduleWa={scheduleWaFollowUp}
          onCancelScheduled={cancelScheduled}
          onCopyMessage={copyMessage}
          onPresetSchedule={handlePresetSchedule}
          formatDateTime={formatDateTime}
          canalLabel={canalLabel}
          tempClass={tempClass}
          riscoClass={riscoClass}
          followUpStatusLabel={followUpStatusLabel}
        />
      </Drawer>
    </PageShell>
  );
}
