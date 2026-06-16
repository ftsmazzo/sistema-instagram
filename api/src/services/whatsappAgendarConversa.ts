import { ensureTables, getPool } from "../db/index.js";
import { AGENT_TIMEZONE } from "./agentConfigDefaults.js";
import { parseAgendaConfig, resolveAgendamentoDateTime, validateDataVisitaAgenda } from "./empresaConfigHelpers.js";
import { agendarCompromisso, type AgendarCompromissoResult } from "./whatsappAgendar.js";
import { normalizePhoneDigits } from "../util/phone.js";

const DIA_REGEX: Array<{ re: RegExp; label: string }> = [
  { re: /\bsegunda(?:-feira)?\b/i, label: "segunda" },
  { re: /\bter[cç]a(?:-feira)?\b/i, label: "terça" },
  { re: /\bquarta(?:-feira)?\b/i, label: "quarta" },
  { re: /\bquinta(?:-feira)?\b/i, label: "quinta" },
  { re: /\bsexta(?:-feira)?\b/i, label: "sexta" },
  { re: /\bs[aá]bado\b/i, label: "sábado" },
  { re: /\bdomingo\b/i, label: "domingo" },
];

export function extrairDiaSemanaDoTexto(texto: string): string | null {
  const t = (texto ?? "").trim();
  if (!t) return null;
  for (const { re, label } of DIA_REGEX) {
    if (re.test(t)) return label;
  }
  return null;
}

export function extrairHorarioDoTexto(texto: string): string | null {
  const t = (texto ?? "").trim();
  if (!t) return null;
  const asH = t.match(/\b(?:às|as)\s*(\d{1,2})(?::(\d{2}))?\s*h?\b/i);
  if (asH) {
    const hh = asH[1].padStart(2, "0");
    const mm = (asH[2] ?? "00").padStart(2, "0");
    return `${hh}:${mm}`;
  }
  const colon = t.match(/\b(\d{1,2}):(\d{2})\b/);
  if (colon) return `${colon[1].padStart(2, "0")}:${colon[2]}`;
  const hOnly = t.match(/\b(\d{1,2})\s*h\b/i);
  if (hOnly) return `${hOnly[1].padStart(2, "0")}:00`;
  return null;
}

export function isConfirmacaoAgendamentoLead(texto: string): boolean {
  return /\b(t[aá]\s*(bom|ótimo|otimo|certo)|confirmo|pode ser|fechado|combinado|perfeito|isso|esse hor[aá]rio)\b/i.test(
    texto ?? ""
  );
}

export function isDeclaracaoAgendamentoAgente(texto: string): boolean {
  return /\b(est[aá] agendad|confirmad|reuni[aã]o|nos vemos|marcamos|agendamos)\b/i.test(texto ?? "");
}

export type TentarAgendarDaConversaInput = {
  organizationId: string;
  leadPhone: string;
  textoLead: string;
  textoAgente: string;
  contextoExtra?: string | null;
};

export type TentarAgendarDaConversaResult =
  | ({ skipped: true; reason: string } & Partial<AgendarCompromissoResult>)
  | ({ skipped: false } & AgendarCompromissoResult);

async function visitaJaExisteHoje(
  organizationId: string,
  telefone: string,
  dataIso: string
): Promise<boolean> {
  await ensureTables();
  const pool = getPool();
  const r = await pool.query<{ id: number }>(
    `SELECT id FROM visitas
     WHERE organization_id = $1::uuid
       AND telefone = $2
       AND data_visita::date = $3::timestamptz::date
       AND created_at > NOW() - INTERVAL '24 hours'
     LIMIT 1`,
    [organizationId, telefone, dataIso]
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Fallback quando o LLM confirma agendamento na conversa mas não chama agendar_compromisso.
 * Extrai dia/hora do texto e grava em visitas + alerta consultor.
 */
export async function tentarAgendarDaConversa(
  input: TentarAgendarDaConversaInput
): Promise<TentarAgendarDaConversaResult> {
  const organizationId = input.organizationId.trim();
  const textoLead = (input.textoLead ?? "").trim();
  const textoAgente = (input.textoAgente ?? "").trim();
  const combinado = [textoLead, textoAgente, input.contextoExtra ?? ""].filter(Boolean).join("\n");

  const leadConfirmou = isConfirmacaoAgendamentoLead(textoLead);
  const agenteDeclarou = isDeclaracaoAgendamentoAgente(textoAgente);

  if (!leadConfirmou && !agenteDeclarou) {
    return { skipped: true, reason: "conversa_sem_confirmacao_de_agendamento" };
  }

  const diaSemana = extrairDiaSemanaDoTexto(combinado);
  if (!diaSemana) {
    return { skipped: true, reason: "dia_da_semana_nao_identificado_no_texto" };
  }

  await ensureTables();
  const pool = getPool();
  const orgRes = await pool.query<{ agenda_config: unknown }>(
    `SELECT COALESCE(agenda_config, '{"dias_semana":[1,2,3,4,5],"horario_inicio":"09:00","horario_fim":"18:00","duracao_minutos":60}'::jsonb) AS agenda_config
     FROM organizations WHERE id = $1::uuid LIMIT 1`,
    [organizationId]
  );
  const agenda = parseAgendaConfig(orgRes.rows[0]?.agenda_config);
  const horario = extrairHorarioDoTexto(combinado) ?? agenda.horario_inicio;
  const phoneDigits = normalizePhoneDigits(input.leadPhone);

  const resolved = resolveAgendamentoDateTime({
    dataVisitaRaw: "",
    diaSemana,
    horario,
    horarioPadrao: agenda.horario_inicio,
    timezone: AGENT_TIMEZONE,
  });
  if (!resolved.date) {
    return { skipped: true, reason: resolved.error ?? "data_nao_resolvida" };
  }
  const validation = validateDataVisitaAgenda(resolved.date, AGENT_TIMEZONE, agenda);
  if (!validation.ok) {
    return { skipped: true, reason: validation.error ?? "data_invalida" };
  }

  if (await visitaJaExisteHoje(organizationId, phoneDigits, resolved.date.toISOString())) {
    return { skipped: true, reason: "visita_ja_registrada_recentemente" };
  }

  const result = await agendarCompromisso({
    organizationId,
    leadPhone: input.leadPhone,
    dataVisita: "",
    diaSemana,
    horario,
    assunto: "Agendamento via WhatsApp",
    observacoes: `Auto-registro da conversa. Lead: "${textoLead.slice(0, 120)}". Agente: "${textoAgente.slice(0, 120)}".`,
  });

  return { skipped: false, ...result };
}
