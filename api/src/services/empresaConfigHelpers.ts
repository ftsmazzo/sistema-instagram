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

const DIA_SEMANA_MAP: Record<string, number> = {
  domingo: 0,
  dom: 0,
  segunda: 1,
  seg: 1,
  terca: 2,
  terça: 2,
  ter: 2,
  quarta: 3,
  qua: 3,
  quinta: 4,
  qui: 4,
  sexta: 5,
  sex: 5,
  sabado: 6,
  sábado: 6,
  sab: 6,
};

function normalizeDiaSemanaKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

function parseDiaSemana(value: string | null | undefined): number | null {
  const key = normalizeDiaSemanaKey(value ?? "");
  if (!key) return null;
  if (key in DIA_SEMANA_MAP) return DIA_SEMANA_MAP[key];
  for (const [nome, dow] of Object.entries(DIA_SEMANA_MAP)) {
    if (key.startsWith(nome) || nome.startsWith(key)) return dow;
  }
  return null;
}

function getWeekdayInTz(date: Date, timezone: string): number {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(date);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[weekday] ?? date.getUTCDay();
}

function getYmdInTz(date: Date, timezone: string): { year: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return { year: get("year"), month: get("month"), day: get("day") };
}

function tzOffsetSuffix(timezone: string): string {
  if (timezone === "America/Sao_Paulo") return "-03:00";
  return "Z";
}

/** Linha segura de contexto do lead — nunca expõe "desconhecido" ao modelo. */
export function formatLeadContextLine(nome?: string | null, username?: string | null): string {
  const n = (nome ?? "").trim();
  const u = (username ?? "").trim().replace(/^@/, "");
  if (n && u) return `Lead: ${n} (Instagram @${u})`;
  if (n) return `Lead: ${n}`;
  if (u) return `Lead: contato do Instagram @${u}`;
  return "Lead: contato (nome ainda não confirmado — não invente nome nem use @desconhecido)";
}

export function resolveProximoDiaSemana(
  diaSemana: string,
  horario: string,
  timezone: string,
  preferAfterToday = true
): Date | null {
  const targetDow = parseDiaSemana(diaSemana);
  if (targetDow === null || !isValidTime(horario)) return null;
  const tz = timezone.trim() || "America/Sao_Paulo";
  const now = new Date();
  const startOffset = preferAfterToday ? 1 : 0;
  for (let i = startOffset; i <= 21; i++) {
    const candidate = new Date(now.getTime() + i * 86_400_000);
    if (getWeekdayInTz(candidate, tz) !== targetDow) continue;
    const ymd = getYmdInTz(candidate, tz);
    const iso = `${ymd.year}-${ymd.month}-${ymd.day}T${horario.trim()}:00${tzOffsetSuffix(tz)}`;
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

/** Retorna a próxima data de um dia da semana (sem horário) — para consultas do lead. */
export function consultarProximaData(
  diaSemana: string,
  timezone: string
): { ok: true; dia_semana: string; data: string; data_extenso: string; mensagem: string } | { ok: false; error: string } {
  const tz = timezone.trim() || "America/Sao_Paulo";
  const targetDow = parseDiaSemana(diaSemana);
  if (targetDow === null) {
    return { ok: false, error: "Dia da semana inválido — use segunda, terça, quarta, quinta, sexta, etc." };
  }
  const now = new Date();
  for (let i = 1; i <= 21; i++) {
    const candidate = new Date(now.getTime() + i * 86_400_000);
    if (getWeekdayInTz(candidate, tz) !== targetDow) continue;
    const f = formatDateInTz(candidate, tz);
    return {
      ok: true,
      dia_semana: f.diaSemana,
      data: f.data,
      data_extenso: `${f.diaSemana}, ${f.data}`,
      mensagem: `A próxima ${f.diaSemana} é ${f.data}.`,
    };
  }
  return { ok: false, error: "Não foi possível resolver a data nos próximos 21 dias." };
}

export function resolveAgendamentoDateTime(args: {
  dataVisitaRaw?: string | null;
  diaSemana?: string | null;
  horario?: string | null;
  timezone: string;
}): { date: Date | null; source: "dia_semana" | "iso" | null; error?: string } {
  const tz = args.timezone.trim() || "America/Sao_Paulo";
  const horario = (args.horario ?? "").trim();

  if (args.diaSemana?.trim() && horario) {
    const resolved = resolveProximoDiaSemana(args.diaSemana, horario, tz, true);
    if (resolved) return { date: resolved, source: "dia_semana" };
    return {
      date: null,
      source: null,
      error: "Não foi possível resolver dia da semana + horário informados.",
    };
  }

  const raw = (args.dataVisitaRaw ?? "").trim();
  if (!raw) {
    return { date: null, source: null, error: "Informe data_visita (ISO) ou dia_semana + horario." };
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return { date: null, source: null, error: "data_visita inválida — use ISO8601 ou dia_semana + horario." };
  }
  const maxFuture = new Date(Date.now() + 21 * 86_400_000);
  if (parsed > maxFuture) {
    return {
      date: null,
      source: null,
      error: "data_visita muito distante — use dia_semana + horario para o servidor calcular a próxima ocorrência.",
    };
  }
  return { date: parsed, source: "iso" };
}

export function validateDataVisitaAgenda(
  date: Date,
  timezone: string,
  agenda: AgendaConfig
): { ok: boolean; error?: string } {
  const tz = timezone.trim() || "America/Sao_Paulo";
  const now = new Date();
  const ymdNow = getYmdInTz(now, tz);
  const ymdDate = getYmdInTz(date, tz);
  const todayKey = `${ymdNow.year}-${ymdNow.month}-${ymdNow.day}`;
  const dateKey = `${ymdDate.year}-${ymdDate.month}-${ymdDate.day}`;
  if (dateKey < todayKey) {
    return { ok: false, error: "Data no passado — use o bloco CALENDÁRIO para a próxima ocorrência do dia." };
  }
  const maxFuture = new Date(now.getTime() + 60 * 86_400_000);
  if (date > maxFuture) {
    return { ok: false, error: "Data muito distante — confira o CALENDÁRIO (máx. 60 dias)." };
  }
  const dow = getWeekdayInTz(date, tz);
  if (!agenda.dias_semana.includes(dow)) {
    return { ok: false, error: "Dia da semana fora da disponibilidade configurada no painel." };
  }
  const hora = formatDateInTz(date, tz).hora;
  if (hora < agenda.horario_inicio || hora > agenda.horario_fim) {
    return { ok: false, error: `Horário fora da janela ${agenda.horario_inicio}–${agenda.horario_fim}.` };
  }
  return { ok: true };
}

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
    `HOJE: ${hoje.diaSemana}, ${hoje.data} às ${hoje.hora}.`,
    "Próximos 14 dias (copie a data exata — NUNCA invente mês/ano):",
  ];
  const proximaPorDow = new Map<number, string>();
  for (let i = 1; i <= 14; i++) {
    const d = new Date(now.getTime() + i * 86_400_000);
    const f = formatDateInTz(d, tz);
    lines.push(`- ${f.diaSemana}: ${f.data}`);
    const dow = getWeekdayInTz(d, tz);
    if (!proximaPorDow.has(dow)) proximaPorDow.set(dow, f.data);
  }
  lines.push("", "Próxima ocorrência de cada dia (use ao agendar):");
  for (let dow = 0; dow <= 6; dow++) {
    const data = proximaPorDow.get(dow);
    if (data) lines.push(`- ${DIA_LABELS[dow]}: ${data}`);
  }
  return lines.join("\n");
}

export function buildWhatsappRuntimeRules(): string {
  return [
    "REGRAS FIXAS (prioridade máxima):",
    "- Máximo 400 caracteres. Uma ideia + no máximo uma pergunta.",
    "- Se há histórico Direct acima: CONTINUE a conversa — sem pitch frio.",
    "- Nome: use UM único nome por toda a conversa. NUNCA @desconhecido, @n/a ou placeholders.",
    "- LINK: NUNCA envie na 1ª mensagem nem em resposta a ok/perfeito/obrigado. Só após discovery + pedido explícito ou interesse confirmado no assunto do Instagram.",
    "- enviar_link_produto: a ferramenta JÁ envia o link — NÃO repita URL na resposta final.",
    "- AGENDAMENTO: NUNCA diga \"está agendado\" sem chamar agendar_compromisso e receber ok:true.",
    "- Toda confirmação ao lead DEVE incluir data DD/MM/AAAA (ex.: 19/06/2026) copiada da ferramenta.",
    "- Se o lead perguntar \"que dia é quinta/terça\", chame consultar_data_agenda ANTES de responder — NUNCA invente mês ou ano.",
    "- Use dia_semana + horario em agendar_compromisso (ex.: quinta, 09:00) — o servidor calcula a data correta.",
    "- Na confirmação ao lead, use EXATAMENTE data_visita_formatada retornada pela ferramenta.",
    "- Se agendar_compromisso falhar, diga que vai confirmar com a equipe — não invente data.",
    "- qualificar_acionar_humano: quando lead qualificado ou pedir humano.",
  ].join("\n");
}

export function buildWhatsappPromptRuntime(args: {
  basePrompt: string;
  instagramResumo: string | null;
  calendarioResumo: string;
  urlInteresse?: string | null;
  linkPadrao?: string | null;
}): string {
  const blocos = [
    args.basePrompt,
    "",
    "--- CONTEXTO INSTAGRAM ---",
    args.instagramResumo?.trim() || "Sem histórico Instagram registrado para este lead.",
  ];
  if (args.urlInteresse?.trim()) {
    blocos.push(`Link/produto de interesse no Instagram: ${args.urlInteresse.trim()}`);
  } else if (args.linkPadrao?.trim()) {
    blocos.push(`Link padrão (só enviar após discovery + interesse): ${args.linkPadrao.trim()}`);
  }
  blocos.push("", "--- CALENDÁRIO ---", args.calendarioResumo, "", buildWhatsappRuntimeRules());
  return blocos.join("\n");
}

export function formatDataVisitaParaAlerta(iso: string, timezone: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  const f = formatDateInTz(parsed, timezone);
  return `${f.diaSemana}, ${f.data} às ${f.hora}`;
}
