export type AgendaConfig = {
  dias_semana: number[];
  horario_inicio: string;
  horario_fim: string;
  duracao_minutos: number;
};

export const DEFAULT_AGENDA_CONFIG: AgendaConfig = {
  dias_semana: [1, 2, 3, 4, 5],
  horario_inicio: "09:00",
  horario_fim: "18:00",
  duracao_minutos: 60,
};

const DIA_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim());
}

export function parseAgendaConfig(raw: unknown): AgendaConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_AGENDA_CONFIG };
  const o = raw as Record<string, unknown>;
  const dias = Array.isArray(o.dias_semana)
    ? o.dias_semana.filter((d): d is number => typeof d === "number" && d >= 0 && d <= 6)
    : DEFAULT_AGENDA_CONFIG.dias_semana;
  const inicio = typeof o.horario_inicio === "string" && isValidTime(o.horario_inicio) ? o.horario_inicio.trim() : DEFAULT_AGENDA_CONFIG.horario_inicio;
  const fim = typeof o.horario_fim === "string" && isValidTime(o.horario_fim) ? o.horario_fim.trim() : DEFAULT_AGENDA_CONFIG.horario_fim;
  const dur = typeof o.duracao_minutos === "number" && o.duracao_minutos >= 15 && o.duracao_minutos <= 480
    ? Math.round(o.duracao_minutos)
    : DEFAULT_AGENDA_CONFIG.duracao_minutos;
  return {
    dias_semana: dias.length > 0 ? [...new Set(dias)].sort((a, b) => a - b) : [...DEFAULT_AGENDA_CONFIG.dias_semana],
    horario_inicio: inicio,
    horario_fim: fim,
    duracao_minutos: dur,
  };
}

export function formatAgendaForPrompt(agenda: AgendaConfig): string {
  const dias = agenda.dias_semana.map((d) => DIA_LABELS[d] ?? String(d)).join(", ");
  return `Dias: ${dias || "não configurado"}. Horário: ${agenda.horario_inicio}–${agenda.horario_fim}. Duração sugerida: ${agenda.duracao_minutos} min.`;
}

export function parseCriteriosLines(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
}

export function formatCriteriosForPrompt(text: string | null | undefined): string | null {
  const items = parseCriteriosLines(text);
  if (items.length === 0) return null;
  return items.map((c, i) => `${i + 1}. ${c}`).join("\n");
}

function formatDateInTz(date: Date, timezone: string): { diaSemana: string; data: string; hora: string } {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    diaSemana: get("weekday"),
    data: `${get("day")}/${get("month")}/${get("year")}`,
    hora: `${get("hour")}:${get("minute")}`,
  };
}

/** Bloco de calendário para o agente converter "quarta" em data exata. */
export function buildCalendarioContext(timezone: string): string {
  const tz = timezone.trim() || "America/Sao_Paulo";
  const now = new Date();
  const hoje = formatDateInTz(now, tz);
  const lines = [
    `Fuso horário: ${tz}.`,
    `Agora: ${hoje.diaSemana}, ${hoje.data} às ${hoje.hora}.`,
    "Próximos 7 dias (use ao agendar — sempre confirme DD/MM/AAAA com o lead):",
  ];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getTime() + i * 86_400_000);
    const f = formatDateInTz(d, tz);
    lines.push(`- ${f.diaSemana}: ${f.data}`);
  }
  return lines.join("\n");
}

export function formatDataVisitaParaAlerta(iso: string, timezone: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  const f = formatDateInTz(parsed, timezone);
  return `${f.diaSemana}, ${f.data} às ${f.hora}`;
}
