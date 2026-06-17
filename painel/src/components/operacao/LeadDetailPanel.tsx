import type {
  FollowUpItemRes,
  LeadCoachRes,
  LeadTimelineDetailRes,
  CrmFollowUpMessageRes,
  PipelineMetricsRes,
  TimelineItemRes,
} from "../../api/client";

const LEAD_STATUSES = [
  { id: "novo", label: "Novo" },
  { id: "em_conversa", label: "Em conversa" },
  { id: "qualificado", label: "Qualificado" },
  { id: "handoff", label: "Handoff" },
  { id: "convertido", label: "Convertido" },
  { id: "perdido", label: "Perdido" },
];

type Props = {
  loading: boolean;
  leadDetail: LeadTimelineDetailRes | null;
  timeline: TimelineItemRes[];
  followUp?: FollowUpItemRes;
  coach: LeadCoachRes | null;
  coachLoading: boolean;
  aiAvailable: boolean;
  notasDraft: string;
  statusDraft: string;
  followupDraft: string;
  waMessageDraft: string;
  waScheduleDraft: string;
  schedulingWa: boolean;
  savingLead: boolean;
  leadScheduled: CrmFollowUpMessageRes[];
  onNotasChange: (v: string) => void;
  onStatusChange: (v: string) => void;
  onFollowupChange: (v: string) => void;
  onWaMessageChange: (v: string) => void;
  onWaScheduleChange: (v: string) => void;
  onSaveCrm: () => void;
  onRequestCoach: () => void;
  onScheduleWa: (origin?: string, msg?: string) => void;
  onCancelScheduled: (id: number) => void;
  onCopyMessage: (text: string) => void;
  onPresetSchedule: (hours: number | "tomorrow9") => void;
  formatDateTime: (iso: string) => string;
  canalLabel: (c: TimelineItemRes["canal"]) => string;
  tempClass: (t: string) => string;
  riscoClass: (r: LeadCoachRes["risco_perda"]) => string;
  followUpStatusLabel: (s: string) => string;
};

export function LeadDetailPanel(props: Props) {
  const {
    loading,
    leadDetail,
    timeline,
    followUp,
    coach,
    coachLoading,
    aiAvailable,
    notasDraft,
    statusDraft,
    followupDraft,
    waMessageDraft,
    waScheduleDraft,
    schedulingWa,
    savingLead,
    leadScheduled,
    onNotasChange,
    onStatusChange,
    onFollowupChange,
    onWaMessageChange,
    onWaScheduleChange,
    onSaveCrm,
    onRequestCoach,
    onScheduleWa,
    onCancelScheduled,
    onCopyMessage,
    onPresetSchedule,
    formatDateTime,
    canalLabel,
    tempClass,
    riscoClass,
    followUpStatusLabel,
  } = props;

  if (loading) {
    return <div className="card h-48 animate-pulse bg-slate-100/80" aria-busy />;
  }

  return (
    <div className="space-y-5">
      {leadDetail && (
        <div className="card !p-4 text-sm space-y-2">
          <p>
            <span className="text-slate-500">Objetivo:</span> {leadDetail.objetivo ?? "—"}
          </p>
          <p>
            <span className="text-slate-500">Origem:</span> {leadDetail.origem_interacao ?? "—"}
          </p>
          {leadDetail.url_interesse && (
            <p>
              <span className="text-slate-500">Interesse:</span>{" "}
              <a href={leadDetail.url_interesse} target="_blank" rel="noreferrer" className="text-brand-600 underline">
                abrir link
              </a>
            </p>
          )}
          {leadDetail.handoff_motivo && (
            <p>
              <span className="text-slate-500">Handoff:</span> {leadDetail.handoff_motivo}
            </p>
          )}
          {followUp && (
            <p className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-950">
              {followUp.acao_sugerida}
            </p>
          )}
        </div>
      )}

      <div className="card !p-4 border-emerald-200/80 bg-emerald-50/30 space-y-3">
        <h3 className="font-semibold text-emerald-950">Agendar WhatsApp</h3>
        {!leadDetail?.whatsapp ? (
          <p className="text-xs text-amber-800">Lead sem WhatsApp — capture o número antes de agendar.</p>
        ) : (
          <>
            <label className="block text-xs font-medium text-slate-600">
              Mensagem
              <textarea
                className="textarea-field mt-1 min-h-[88px] !py-2 !text-sm"
                value={waMessageDraft}
                onChange={(e) => onWaMessageChange(e.target.value)}
                placeholder="Olá! Vi que você demonstrou interesse…"
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Enviar em
              <input
                type="datetime-local"
                className="input-field mt-1 !py-2"
                value={waScheduleDraft}
                onChange={(e) => onWaScheduleChange(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "+2h", preset: 2 as const },
                { label: "+24h", preset: 24 as const },
                { label: "Amanhã 9h", preset: "tomorrow9" as const },
              ].map(({ label, preset }) => (
                <button
                  key={label}
                  type="button"
                  className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-emerald-900 hover:bg-emerald-50"
                  onClick={() => onPresetSchedule(preset === "tomorrow9" ? "tomorrow9" : preset)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={schedulingWa}
                onClick={() => onScheduleWa("manual")}
                className="btn-primary !py-2 !text-xs"
              >
                {schedulingWa ? "Agendando…" : "Programar envio"}
              </button>
              {coach?.mensagem_sugerida && (
                <button
                  type="button"
                  disabled={schedulingWa}
                  onClick={() => {
                    onWaMessageChange(coach.mensagem_sugerida);
                    onScheduleWa("ai_coach", coach.mensagem_sugerida);
                  }}
                  className="btn-secondary !py-2 !text-xs border-brand-200 text-brand-800"
                >
                  Agendar msg da IA
                </button>
              )}
            </div>
            {leadScheduled.filter((x) => x.status === "pendente" || x.status === "falhou").length > 0 && (
              <ul className="space-y-1 border-t border-emerald-100 pt-2">
                {leadScheduled
                  .filter((x) => x.status === "pendente" || x.status === "falhou")
                  .slice(0, 5)
                  .map((item) => (
                    <li key={item.id} className="flex justify-between gap-2 text-xs">
                      <span className="text-slate-700">
                        {followUpStatusLabel(item.status)} · {formatDateTime(item.agendado_para)}
                      </span>
                      {item.status === "pendente" && (
                        <button type="button" className="font-semibold text-red-600" onClick={() => onCancelScheduled(item.id)}>
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

      <div className="card !p-4 space-y-3">
        <h3 className="font-semibold text-slate-900">Gestão do lead</h3>
        <label className="block text-xs font-medium text-slate-600">
          Status
          <select className="input-field mt-1 !py-2" value={statusDraft} onChange={(e) => onStatusChange(e.target.value)}>
            {LEAD_STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Próximo follow-up
          <input
            type="datetime-local"
            className="input-field mt-1 !py-2"
            value={followupDraft}
            onChange={(e) => onFollowupChange(e.target.value)}
          />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Notas do consultor
          <textarea
            className="textarea-field mt-1 min-h-[72px] !py-2 !text-sm"
            value={notasDraft}
            onChange={(e) => onNotasChange(e.target.value)}
            placeholder="Objeções, orçamento, próximo passo…"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={savingLead} onClick={onSaveCrm} className="btn-primary !py-2 !text-xs">
            {savingLead ? "Salvando…" : "Salvar CRM"}
          </button>
          <button
            type="button"
            disabled={coachLoading || !aiAvailable}
            onClick={onRequestCoach}
            className="btn-secondary !py-2 !text-xs"
          >
            {coachLoading ? "Gerando…" : "Sugestão IA"}
          </button>
        </div>
      </div>

      {coach && (
        <div className="card !p-4 border-brand-200/80 bg-brand-50/40 space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-brand-950">Coach de conversão</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tempClass(coach.temperatura)}`}>
              {coach.temperatura}
            </span>
            <span className={`text-xs font-medium ${riscoClass(coach.risco_perda)}`}>Risco: {coach.risco_perda}</span>
          </div>
          <p className="text-slate-700">{coach.resumo}</p>
          <p>
            <span className="font-medium">Próxima ação:</span> {coach.proxima_acao}
          </p>
          {coach.mensagem_sugerida && (
            <div className="rounded-xl border border-brand-100 bg-white p-3">
              <p className="mb-1 text-xs text-slate-500">Mensagem sugerida</p>
              <p className="whitespace-pre-wrap text-slate-800">{coach.mensagem_sugerida}</p>
              <button
                type="button"
                className="mt-2 text-xs font-semibold text-brand-600 hover:underline"
                onClick={() => {
                  onWaMessageChange(coach.mensagem_sugerida);
                  onCopyMessage(coach.mensagem_sugerida);
                }}
              >
                Usar na agenda · Copiar
              </button>
            </div>
          )}
        </div>
      )}

      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-800">Histórico</h3>
        {timeline.length === 0 ? (
          <p className="text-sm text-slate-500">Sem mensagens registradas.</p>
        ) : (
          <ol className="max-h-[320px] space-y-3 overflow-y-auto pr-1">
            {timeline.map((item, idx) => (
              <li key={`${item.ref}-${idx}`} className={`flex text-sm ${item.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[90%] rounded-xl px-3 py-2 ${
                    item.direction === "outbound"
                      ? item.canal === "visita"
                        ? "bg-amber-600 text-white"
                        : "bg-brand-600 text-white"
                      : "border border-slate-200 bg-slate-50 text-slate-800"
                  }`}
                >
                  <p className="mb-1 text-[10px] font-semibold uppercase opacity-80">
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
  );
}
