import type { CadenciaPresetRes, CrmCadenciaConfigRes } from "../../api/client";

type Props = {
  cadencia: CrmCadenciaConfigRes;
  setCadencia: (c: CrmCadenciaConfigRes) => void;
  cadenciaPresets: CadenciaPresetRes[];
  cadenciaSegmento: string;
  cadenciaPresetSugerido: string | null;
  cadenciaSaving: boolean;
  onSave: () => void;
  onApplyPreset: (id: string) => void;
};

export function OperacaoCadenciaSection({
  cadencia,
  setCadencia,
  cadenciaPresets,
  cadenciaSegmento,
  cadenciaPresetSugerido,
  cadenciaSaving,
  onSave,
  onApplyPreset,
}: Props) {
  return (
    <section className="card border-brand-200/60">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Cadência automática</h2>
          <p className="mt-1 text-sm text-slate-600">
            D+1 / D+3 / D+7 no WhatsApp quando o lead para de responder. Cancela se responder. Alertas vão ao consultor
            (Empresa).
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={cadencia.ativo}
            onChange={(e) => setCadencia({ ...cadencia, ativo: e.target.checked })}
          />
          Ativa
        </label>
      </div>
      {cadenciaPresets.length > 0 && (
        <div className="mb-4 rounded-xl border border-brand-100 bg-brand-50/50 p-3">
          <p className="mb-2 text-xs font-semibold text-brand-900">
            Templates por segmento
            {cadenciaSegmento ? <span className="font-normal text-brand-700"> — {cadenciaSegmento}</span> : null}
          </p>
          <div className="flex flex-wrap gap-2">
            {cadenciaPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={cadenciaSaving}
                onClick={() => onApplyPreset(preset.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-50 ${
                  preset.id === cadenciaPresetSugerido
                    ? "bg-brand-600 text-white"
                    : "border border-brand-200 bg-white text-brand-800 hover:bg-brand-50"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-medium text-slate-600">
          Horas sem resposta
          <input
            type="number"
            min={4}
            max={168}
            className="input-field mt-1 !py-2"
            value={cadencia.horas_sem_resposta}
            onChange={(e) => setCadencia({ ...cadencia, horas_sem_resposta: Number(e.target.value) || 24 })}
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Alerta consultor (horas)
          <input
            type="number"
            min={2}
            max={72}
            className="input-field mt-1 !py-2"
            value={cadencia.alerta_consultor_horas}
            onChange={(e) => setCadencia({ ...cadencia, alerta_consultor_horas: Number(e.target.value) || 12 })}
          />
        </label>
      </div>
      <div className="space-y-3">
        {cadencia.etapas.map((etapa, idx) => (
          <label key={idx} className="block text-xs font-medium text-slate-600">
            Etapa {idx + 1} — +{etapa.horas_apos_parada}h
            <textarea
              className="textarea-field mt-1 min-h-[60px] !py-2 !text-sm"
              value={etapa.mensagem}
              onChange={(e) => {
                const etapas = [...cadencia.etapas];
                etapas[idx] = { ...etapa, mensagem: e.target.value };
                setCadencia({ ...cadencia, etapas });
              }}
            />
            <span className="text-[10px] font-normal text-slate-400">{"{nome}"} · {"{objetivo}"} · {"{empresa}"}</span>
          </label>
        ))}
      </div>
      <button type="button" disabled={cadenciaSaving} onClick={onSave} className="btn-primary mt-4">
        {cadenciaSaving ? "Salvando…" : "Salvar cadência"}
      </button>
    </section>
  );
}
