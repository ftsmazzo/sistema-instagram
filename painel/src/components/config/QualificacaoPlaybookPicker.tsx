import { useEffect, useState } from "react";
import { api, type EmpresaPerfilRes, type QualificacaoPlaybookRes } from "../api/client";

type Props = {
  empresa: EmpresaPerfilRes;
  onApply: (patch: Partial<EmpresaPerfilRes>) => void;
};

function criteriosFromLines(text: string): string[] {
  return (text ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
}

function linesFromCriterios(labels: string[]): string {
  return labels.join("\n");
}

export function QualificacaoPlaybookPicker({ empresa, onApply }: Props) {
  const [playbooks, setPlaybooks] = useState<QualificacaoPlaybookRes[]>([]);
  const [suggestedId, setSuggestedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [criterioIds, setCriterioIds] = useState<Set<string>>(new Set());

  const selected = playbooks.find((p) => p.id === selectedId) ?? null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getQualificacaoPlaybooks(empresa.segmento || empresa.sobre)
      .then((res) => {
        if (cancelled) return;
        setPlaybooks(res.playbooks);
        setSuggestedId(res.suggested_playbook_id);
        const initial = res.suggested_playbook_id ?? res.playbooks[0]?.id ?? null;
        setSelectedId(initial);
      })
      .catch(() => {
        if (!cancelled) setPlaybooks([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [empresa.segmento, empresa.sobre]);

  useEffect(() => {
    if (!selected) return;
    const current = new Set(criteriosFromLines(empresa.criterios_qualificacao ?? ""));
    const ids = selected.criterios
      .filter((c) => current.has(c.label) || c.obrigatorio)
      .map((c) => c.id);
    setCriterioIds(new Set(ids.length ? ids : selected.criterios.map((c) => c.id)));
  }, [selectedId, selected, empresa.criterios_qualificacao]);

  const toggleCriterio = (id: string, obrigatorio: boolean) => {
    if (obrigatorio) return;
    setCriterioIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyPlaybook = () => {
    if (!selected) return;
    const labels = selected.criterios
      .filter((c) => criterioIds.has(c.id))
      .map((c) => c.label);
    onApply({
      segmento: selected.segmento,
      tom_voz: selected.tom_voz,
      sobre: empresa.sobre.trim() ? empresa.sobre : selected.sobre_exemplo,
      objetivo_qualificacao: selected.objetivo_qualificacao,
      criterios_qualificacao: linesFromCriterios(labels),
    });
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Carregando modelos de qualificação…</p>;
  }

  if (playbooks.length === 0) return null;

  return (
    <div className="space-y-4 rounded-xl border border-violet-200 bg-violet-50/50 p-4">
      <div>
        <p className="text-sm font-semibold text-violet-950">Modelo rápido (1 clique)</p>
        <p className="mt-1 text-xs text-violet-900/80">
          Escolha o tipo de negócio. O agente ganha objetivo, tom e perguntas humanas — você só ajusta o que quiser.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {playbooks.map((p) => {
          const active = p.id === selectedId;
          const suggested = p.id === suggestedId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedId(p.id)}
              className={`rounded-lg border p-3 text-left text-sm transition ${
                active
                  ? "border-violet-500 bg-white ring-2 ring-violet-300"
                  : "border-slate-200 bg-white hover:border-violet-300"
              }`}
            >
              <span className="font-medium text-slate-900">
                {p.emoji} {p.label}
                {suggested && !active ? (
                  <span className="ml-1 text-xs font-normal text-violet-600">sugerido</span>
                ) : null}
              </span>
              <span className="mt-1 block text-xs text-slate-600">{p.descricao}</span>
            </button>
          );
        })}
      </div>

      {selected && (
        <>
          <p className="rounded-lg bg-white/80 px-3 py-2 text-xs text-slate-700">
            <span className="font-medium text-slate-900">Resultado esperado:</span> {selected.resultado_esperado}
          </p>

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-slate-800">O que o agente deve descobrir</legend>
            {selected.criterios.map((c) => {
              const on = criterioIds.has(c.id);
              return (
                <label
                  key={c.id}
                  className={`flex cursor-pointer gap-2 rounded-lg border px-3 py-2 text-sm ${
                    on ? "border-violet-300 bg-white" : "border-slate-200 bg-slate-50 opacity-80"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={c.obrigatorio}
                    onChange={() => toggleCriterio(c.id, c.obrigatorio)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium text-slate-900">{c.label}</span>
                    {c.obrigatorio ? (
                      <span className="ml-1 text-xs text-violet-600">obrigatório</span>
                    ) : null}
                    <span className="mt-0.5 block text-xs text-slate-600">Ex.: “{c.pergunta_guia}”</span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          <button type="button" onClick={applyPlaybook} className="btn-primary w-full sm:w-auto">
            Aplicar modelo ao formulário
          </button>
        </>
      )}
    </div>
  );
}
