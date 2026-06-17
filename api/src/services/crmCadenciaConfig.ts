export type CrmCadenciaEtapa = {
  horas_apos_parada: number;
  mensagem: string;
};

export type CrmCadenciaConfig = {
  ativo: boolean;
  horas_sem_resposta: number;
  alerta_consultor_horas: number;
  etapas: CrmCadenciaEtapa[];
};

export const DEFAULT_CRM_CADENCIA: CrmCadenciaConfig = {
  ativo: true,
  horas_sem_resposta: 24,
  alerta_consultor_horas: 12,
  etapas: [
    {
      horas_apos_parada: 24,
      mensagem:
        "Oi {nome}! Passando para saber se ainda posso te ajudar com {objetivo}. Qual seria o melhor próximo passo pra você?",
    },
    {
      horas_apos_parada: 72,
      mensagem:
        "Oi {nome}, tudo bem? Nossa conversa sobre {objetivo} ficou pendente. Ainda faz sentido retomarmos?",
    },
    {
      horas_apos_parada: 168,
      mensagem:
        "Último contato por aqui, {nome}. Se ainda tiver interesse em {objetivo}, é só responder — fico à disposição.",
    },
  ],
};

function clampHours(n: unknown, min: number, max: number, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

export function parseCrmCadenciaConfig(raw: unknown): CrmCadenciaConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CRM_CADENCIA, etapas: [...DEFAULT_CRM_CADENCIA.etapas] };
  const o = raw as Record<string, unknown>;
  const etapasRaw = Array.isArray(o.etapas) ? o.etapas : DEFAULT_CRM_CADENCIA.etapas;
  const etapas: CrmCadenciaEtapa[] = etapasRaw
    .map((e) => {
      if (!e || typeof e !== "object") return null;
      const row = e as Record<string, unknown>;
      const msg = String(row.mensagem ?? "").trim();
      if (!msg) return null;
      return {
        horas_apos_parada: clampHours(row.horas_apos_parada, 1, 720, 24),
        mensagem: msg.slice(0, 4096),
      };
    })
    .filter((x): x is CrmCadenciaEtapa => x !== null)
    .sort((a, b) => a.horas_apos_parada - b.horas_apos_parada);

  return {
    ativo: o.ativo !== false,
    horas_sem_resposta: clampHours(o.horas_sem_resposta, 4, 168, 24),
    alerta_consultor_horas: clampHours(o.alerta_consultor_horas, 2, 72, 12),
    etapas: etapas.length > 0 ? etapas : [...DEFAULT_CRM_CADENCIA.etapas],
  };
}

export function applyCadenciaTemplate(
  template: string,
  vars: { nome: string; objetivo: string; empresa: string }
): string {
  const nome = vars.nome.trim() || "tudo bem";
  const objetivo = vars.objetivo.trim() || "seu interesse";
  const empresa = vars.empresa.trim() || "nossa equipe";
  return template
    .replace(/\{nome\}/gi, nome)
    .replace(/\{objetivo\}/gi, objetivo)
    .replace(/\{empresa\}/gi, empresa)
    .trim();
}
