import type { ReactNode } from "react";

type ConfigSectionCardProps = {
  title: string;
  description: string;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  summary: ReactNode;
  children: ReactNode;
};

export function ConfigSectionCard({
  title,
  description,
  editing,
  onEdit,
  onCancel,
  onSave,
  saving,
  summary,
  children,
}: ConfigSectionCardProps) {
  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
      </div>

      {editing ? (
        <>
          <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/40 p-4">{children}</div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={onSave} disabled={saving} className="btn-primary">
              {saving ? "Salvando…" : "Salvar"}
            </button>
            <button type="button" onClick={onCancel} disabled={saving} className="btn-secondary">
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-start gap-4 rounded-xl border border-slate-200 bg-slate-50/40 p-4">
          <div className="min-w-0 flex-1 space-y-1.5 text-sm text-slate-600">{summary}</div>
          <button type="button" onClick={onEdit} className="btn-secondary ml-auto shrink-0">
            Editar
          </button>
        </div>
      )}
    </section>
  );
}

function summaryLine(label: string, value: string | null | undefined): ReactNode {
  const v = (value ?? "").trim();
  return (
    <p>
      <span className="font-medium text-slate-800">{label}:</span> {v || "—"}
    </p>
  );
}

function summaryText(label: string, value: string | null | undefined, max = 120): ReactNode {
  const v = (value ?? "").trim();
  const preview = v.length > max ? `${v.slice(0, max - 1)}…` : v;
  return (
    <p>
      <span className="font-medium text-slate-800">{label}:</span> {preview || "—"}
    </p>
  );
}

export function perfilSummary(empresa: {
  nome: string;
  nome_fantasia: string;
  segmento: string;
  cidade: string;
  tom_voz: string;
  sobre: string;
}): ReactNode {
  return (
    <>
      {summaryLine("Marca", empresa.nome_fantasia || empresa.nome)}
      {summaryLine("Segmento", empresa.segmento)}
      {summaryLine("Região", empresa.cidade)}
      {summaryLine("Tom", empresa.tom_voz)}
      {summaryText("Sobre", empresa.sobre)}
    </>
  );
}

export function qualificacaoSummary(empresa: {
  objetivo_qualificacao: string;
  criterios_qualificacao?: string;
}): ReactNode {
  const criterios = (empresa.criterios_qualificacao ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return (
    <>
      {summaryText("Objetivo", empresa.objetivo_qualificacao)}
      <p>
        <span className="font-medium text-slate-800">Critérios:</span>{" "}
        {criterios.length ? `${criterios.length} item(ns)` : "—"}
      </p>
    </>
  );
}

export function comercialSummary(empresa: {
  link_produto_servico?: string;
  agenda_local?: string;
  handoff_whatsapp?: string;
  agenda_config: { dias_semana: number[]; horario_inicio: string; horario_fim: string; duracao_minutos: number };
}): ReactNode {
  const dias = empresa.agenda_config.dias_semana.length;
  return (
    <>
      {summaryText("Link produto/serviço", empresa.link_produto_servico, 80)}
      {summaryLine("Local compromisso", empresa.agenda_local)}
      {summaryLine("WhatsApp consultor", empresa.handoff_whatsapp)}
      <p>
        <span className="font-medium text-slate-800">Agenda:</span>{" "}
        {dias
          ? `${dias} dia(s) · ${empresa.agenda_config.horario_inicio}–${empresa.agenda_config.horario_fim} · ${empresa.agenda_config.duracao_minutos} min`
          : "—"}
      </p>
    </>
  );
}
