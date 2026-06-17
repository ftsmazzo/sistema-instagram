import { Fragment, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type FunnelStatsRes,
  type LeadListItemRes,
  type OperacaoHealthRes,
  type TimelineItemRes,
} from "../api/client";
import { PageShell } from "../components/layout/PageShell";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    novo: "Novo",
    em_conversa: "Em conversa",
    qualificado: "Qualificado",
    handoff: "Handoff",
    convertido: "Convertido",
    perdido: "Perdido",
  };
  return map[status] ?? status;
}

function canalLabel(canal: TimelineItemRes["canal"]): string {
  if (canal === "comentario") return "Comentário";
  if (canal === "direct") return "Direct";
  return "WhatsApp";
}

function issueClass(severity: string): string {
  if (severity === "error") return "border-red-200 bg-red-50 text-red-900";
  if (severity === "warning") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function KpiCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
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
  const [health, setHealth] = useState<OperacaoHealthRes | null>(null);
  const [leads, setLeads] = useState<LeadListItemRes[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [timeline, setTimeline] = useState<TimelineItemRes[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [f, h, l] = await Promise.all([
        api.agentes.getFunnel(30),
        api.agentes.getOperacaoHealth(),
        api.agentes.getLeads({ limit: 30 }),
      ]);
      setFunnel(f);
      setHealth(h);
      setLeads(l.leads);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar operação.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openTimeline = async (leadId: number) => {
    if (selectedId === leadId) {
      setSelectedId(null);
      setTimeline([]);
      return;
    }
    setSelectedId(leadId);
    setTimelineLoading(true);
    try {
      const res = await api.agentes.getLeadTimeline(leadId);
      setTimeline(res.timeline);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar conversa.");
      setTimeline([]);
    } finally {
      setTimelineLoading(false);
    }
  };

  return (
    <PageShell
      title="Operação"
      description="Funil de conversão, saúde dos agentes e histórico de conversas por lead."
      wide
    >
      {loading ? (
        <p className="text-sm text-slate-600">Carregando…</p>
      ) : (
        <div className="space-y-8">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
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
                <p className="text-sm text-emerald-700">Tudo configurado — Instagram IGAA, Evolution e agentes OK.</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {health.issues.map((issue) => (
                    <li key={issue.code + issue.message} className={`rounded-lg border px-3 py-2 text-sm ${issueClass(issue.severity)}`}>
                      {issue.message}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-slate-500">
                Instagram: {health.instagram.agentes_ativos} agente(s) ativo(s), {health.instagram.com_token_agente_igaa}{" "}
                com IGAA · WhatsApp: {health.whatsapp.connection_state ?? "—"}
                {health.whatsapp.instance_name ? ` (${health.whatsapp.instance_name})` : ""}
              </p>
            </section>
          )}

          {funnel && (
            <section>
              <h2 className="mb-4 text-lg font-semibold text-slate-900">Funil — últimos {funnel.period_days} dias</h2>
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
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-violet-800">Comentário</span>
                <span aria-hidden>→</span>
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-800">Direct</span>
                <span aria-hidden>→</span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">WhatsApp</span>
                <span aria-hidden>→</span>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">Handoff / conversão</span>
              </div>
            </section>
          )}

          <section className="card">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Leads e conversas</h2>
                <p className="text-sm text-gray-600">Clique em um lead para ver o histórico unificado.</p>
              </div>
              <Link to="/whatsapp" className="text-sm font-semibold text-indigo-600 hover:underline">
                Configurar WhatsApp →
              </Link>
            </div>

            {leads.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum lead ainda. Interaja via Instagram para popular o CRM.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-600">
                      <th className="py-2 pr-4 font-medium">Nome</th>
                      <th className="py-2 pr-4 font-medium">Instagram</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 pr-4 font-medium">Atualizado</th>
                      <th className="py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead) => (
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
                          <td className="py-2 pr-4 text-xs text-gray-500">{formatDateTime(lead.updated_at)}</td>
                          <td className="py-2 text-xs font-medium text-indigo-600">
                            {selectedId === lead.id ? "Fechar" : "Ver conversa"}
                          </td>
                        </tr>
                        {selectedId === lead.id && (
                          <tr>
                            <td colSpan={5} className="bg-slate-50 px-4 py-4">
                              {timelineLoading ? (
                                <p className="text-sm text-slate-500">Carregando histórico…</p>
                              ) : timeline.length === 0 ? (
                                <p className="text-sm text-slate-500">Sem mensagens registradas para este lead.</p>
                              ) : (
                                <ol className="space-y-3 max-h-80 overflow-y-auto">
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
                                            ? "bg-indigo-600 text-white"
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
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
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
