import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type CronogramaItem, type AgendadoItem } from "../api/client";
import { PageShell } from "../components/layout/PageShell";
import { Stat } from "../components/ui/Stat";

function formatDate(d: string) {
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadgeClass(status: string | undefined): string {
  const s = (status ?? "pendente").toLowerCase();
  if (s === "published" || s === "publicado") return "bg-emerald-100 text-emerald-800";
  if (s === "failed" || s === "erro") return "bg-red-100 text-red-800";
  if (s === "scheduled" || s === "agendado") return "bg-brand-100 text-brand-800";
  return "bg-slate-100 text-slate-700";
}

export function CronogramaPage() {
  const [cronograma, setCronograma] = useState<CronogramaItem[]>([]);
  const [agendados, setAgendados] = useState<AgendadoItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([api.postador.getCronograma(), api.postador.getAgendados()])
      .then(([resC, resA]) => {
        setCronograma(resC.cronograma ?? []);
        setAgendados((resA.agendados ?? []).filter((a) => a.status !== "published"));
      })
      .catch(() => {
        if (!silent) {
          setCronograma([]);
          setAgendados([]);
        }
      })
      .finally(() => {
        if (!silent) setLoading(false);
      });
  };

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 5000);
    return () => clearInterval(t);
  }, []);

  const cancelAgendado = (id: string) => {
    if (!window.confirm("Excluir este agendamento?")) return;
    api.postador
      .deleteAgendado(id)
      .then(() => load())
      .catch((e) => alert(`Erro ao cancelar: ${e instanceof Error ? e.message : "desconhecido"}`));
  };

  const removeHistorico = (id: string) => {
    if (!window.confirm("Remover esta publicação do histórico?")) return;
    api.postador
      .deleteCronograma(id)
      .then(() => load())
      .catch((e) => alert(`Erro ao remover: ${e instanceof Error ? e.message : "desconhecido"}`));
  };

  return (
    <PageShell title="Agenda" description="Posts agendados e histórico de publicações." wide>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:max-w-md">
          <Stat label="Próximos posts" value={agendados.length} accent />
          <Stat label="Publicados" value={cronograma.length} sub="no histórico" />
        </div>
        <Link to="/postador" className="btn-primary inline-flex shrink-0">
          Criar post
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-900">
            Próximos posts
          </h2>
          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : agendados.length === 0 ? (
            <div className="card border-dashed border-slate-300 bg-slate-50/50 p-6 text-center text-sm text-slate-600">
              <p>Nenhum post agendado.</p>
              <Link to="/postador" className="mt-3 inline-block font-semibold text-brand-600 hover:underline">
                Criar o primeiro post →
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {agendados.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-2 rounded-xl border border-brand-200/70 bg-brand-50/30 p-4 shadow-sm transition-all hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-brand-800">
                      {item.data_agendamento ? formatDate(item.data_agendamento) : "Sem data (rascunho)"}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(item.status)}`}
                    >
                      {item.status || "pendente"}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-3 text-sm font-medium text-slate-800" title={item.caption}>
                    {item.caption}
                  </p>
                  <div className="mt-2 flex items-center justify-between border-t border-brand-100 pt-3">
                    <span className="text-xs font-medium text-slate-500">{item.media_type}</span>
                    <button
                      type="button"
                      onClick={() => cancelAgendado(item.id)}
                      className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100"
                    >
                      Cancelar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-4 border-b border-slate-100 pb-2 text-lg font-semibold text-slate-900">
            Histórico de publicações
          </h2>
          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : cronograma.length === 0 ? (
            <div className="card border-dashed border-slate-300 bg-slate-50/50 p-6 text-center text-sm text-slate-600">
              Nenhuma publicação registrada ainda.
            </div>
          ) : (
            <ul className="space-y-3">
              {cronograma.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-medium text-slate-500">{formatDate(item.data_post)}</span>
                    {item.link_post && (
                      <a
                        href={item.link_post}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100"
                      >
                        Ver no Instagram
                      </a>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-800" title={item.caption}>
                    {item.caption}
                  </p>
                  <div className="mt-2 flex justify-end border-t border-slate-50 pt-2">
                    <button
                      type="button"
                      onClick={() => removeHistorico(item.id)}
                      className="text-[10px] font-bold uppercase tracking-wider text-slate-400 transition-colors hover:text-red-500"
                    >
                      Remover do histórico
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PageShell>
  );
}
