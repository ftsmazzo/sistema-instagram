import { useEffect, useState } from "react";
import { api, type CronogramaItem, type AgendadoItem } from "../api/client";
import { PageShell } from "../components/layout/PageShell";

export function CronogramaPage() {
  const [cronograma, setCronograma] = useState<CronogramaItem[]>([]);
  const [agendados, setAgendados] = useState<AgendadoItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([
      api.postador.getCronograma(),
      api.postador.getAgendados()
    ])
      .then(([resC, resA]) => {
        setCronograma(resC.cronograma ?? []);
        // Exibir os que não estão 'published'
        setAgendados((resA.agendados ?? []).filter(a => a.status !== 'published'));
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

  const formatDate = (d: string) => new Date(d).toLocaleString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
  });

  return (
    <PageShell
      title="Calendário e Histórico"
      description="Gerencie os posts agendados e visualize o histórico de publicações realizadas."
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Futuros / Agendados */}
        <div>
          <h2 className="text-lg font-semibold text-slate-800 mb-4 border-b pb-2">Próximos Posts</h2>
          {loading ? (
            <p className="text-sm text-slate-500">Carregando…</p>
          ) : agendados.length === 0 ? (
            <div className="card border-dashed border-slate-300 bg-slate-50/50 text-center text-sm text-slate-600 p-6">
              Nenhum post agendado.
            </div>
          ) : (
            <ul className="space-y-3">
              {agendados.map((item) => (
                <li key={item.id} className="flex flex-col gap-2 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 shadow-sm relative transition-all hover:shadow-md">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-100 px-2.5 py-1 rounded-full shadow-sm">
                      {item.data_agendamento ? formatDate(item.data_agendamento) : "Sem data (Rascunho)"}
                    </span>
                    <span className="text-xs font-medium text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">{item.status || "pendente"}</span>
                  </div>
                  <p className="text-sm text-slate-800 font-medium line-clamp-3 mt-2" title={item.caption}>
                    {item.caption}
                  </p>
                  <div className="mt-3 flex items-center justify-between pt-3 border-t border-indigo-100">
                    <span className="text-xs font-medium text-slate-500">{item.media_type}</span>
                    <button onClick={() => {
                        if(window.confirm('Excluir este agendamento?')) {
                          api.postador.deleteAgendado(item.id).then(() => load());
                        }
                      }} className="text-xs text-red-600 font-semibold hover:text-red-700 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-md transition-colors">Cancelar</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Histórico / Cronograma */}
        <div>
          <h2 className="text-lg font-semibold text-slate-800 mb-4 border-b pb-2">Histórico de Publicações</h2>
          {loading ? (
            <p className="text-sm text-slate-500">Carregando…</p>
          ) : cronograma.length === 0 ? (
            <div className="card border-dashed border-slate-300 bg-slate-50/50 text-center text-sm text-slate-600 p-6">
              Nenhuma publicação registrada.
            </div>
          ) : (
            <ul className="space-y-3">
              {cronograma.map((item) => (
                <li key={item.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:shadow-md">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-medium text-slate-500">
                      {formatDate(item.data_post)}
                    </span>
                    {item.link_post && (
                      <a href={item.link_post} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 bg-indigo-50 px-2 py-1 rounded-md">Ver no Instagram</a>
                    )}
                  </div>
                  <p className="text-sm text-slate-800 line-clamp-2 mt-1" title={item.caption}>
                    {item.caption}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </PageShell>
  );
}
