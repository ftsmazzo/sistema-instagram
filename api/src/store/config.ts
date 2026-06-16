import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { isDbConfigured, getPool, ensureTables } from "../db/index.js";

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), "data");
const CONFIG_PATH = join(DATA_DIR, "config.json");

import type { AgendaConfig } from "../services/empresaConfigHelpers.js";
import { DEFAULT_AGENDA_CONFIG, parseAgendaConfig } from "../services/empresaConfigHelpers.js";

export type ContaInstagram = {
  id: string;
  nome: string;
  access_token: string;
  ig_user_id: string;
  /** Página Facebook vinculada (POST /{page_id}/messages). */
  facebook_page_id?: string;
  /** Token para agente (Direct/comentários); separado do token de publicação. */
  agent_access_token?: string;
  agent_ativo?: boolean;
  /** Nome do assistente exibido nas respostas. */
  agent_nome?: string;
  agent_prompt_comentarios?: string;
  agent_prompt_direct?: string;
};

/** Dados da empresa no workspace (além do nome legal/registro em `nome`). */
export type EmpresaPerfil = {
  nome: string;
  nome_fantasia: string;
  segmento: string;
  cidade: string;
  tom_voz: string;
  sobre: string;
  /** O que o agente deve qualificar no lead (multi-segmento; ex.: agendar consulta, orçamento). */
  objetivo_qualificacao: string;
  /** WhatsApp do consultor humano para alerta quando o lead estiver qualificado. */
  handoff_whatsapp: string;
  /** URL padrão de produto/serviço para o agente enviar quando o lead pedir detalhes. */
  link_produto_servico: string;
  /** Dias e horários disponíveis para agendar visita/reunião. */
  agenda_config: AgendaConfig;
  /** Critérios de qualificação (um por linha). */
  criterios_qualificacao: string;
  /** Local padrão do compromisso (endereço, link de reunião, etc.). */
  agenda_local: string;
};

export type ConfigStore = {
  empresa: EmpresaPerfil;
  /** Múltiplas contas Instagram para postar. */
  contas_instagram: ContaInstagram[];
  /** ID da conta usada por padrão ao publicar (quando o painel não envia conta_id). */
  instagram_default_id: string | null;
  /** @deprecated Use contas_instagram; mantido para migração. */
  instagram?: { access_token?: string; ig_user_id?: string };
};

export const emptyEmpresa = (): EmpresaPerfil => ({
  nome: "",
  nome_fantasia: "",
  segmento: "",
  cidade: "",
  tom_voz: "",
  sobre: "",
  objetivo_qualificacao: "",
  handoff_whatsapp: "",
  link_produto_servico: "",
  agenda_config: { ...DEFAULT_AGENDA_CONFIG },
  criterios_qualificacao: "",
  agenda_local: "",
});

const defaultConfig: ConfigStore = {
  empresa: emptyEmpresa(),
  contas_instagram: [],
  instagram_default_id: null,
};

function genContaId(): string {
  return `conta-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Migra config antiga (um único instagram) para contas_instagram. */
function normalizeConfig(parsed: Partial<ConfigStore>): ConfigStore {
  const contas = Array.isArray(parsed.contas_instagram) ? [...parsed.contas_instagram] : [];
  const defaultId = parsed.instagram_default_id ?? null;

  if (contas.length === 0 && parsed.instagram?.access_token?.trim() && parsed.instagram?.ig_user_id?.trim()) {
    contas.push({
      id: genContaId(),
      nome: "Conta principal",
      access_token: parsed.instagram.access_token.trim(),
      ig_user_id: parsed.instagram.ig_user_id.trim(),
    });
  }

  const emp = { ...emptyEmpresa(), ...(parsed.empresa ?? {}) };
  return {
    empresa: emp,
    contas_instagram: contas,
    instagram_default_id: defaultId ?? (contas[0]?.id ?? null),
    instagram: parsed.instagram,
  };
}

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

async function loadFromFile(): Promise<ConfigStore> {
  await ensureDataDir();
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<ConfigStore>;
    return normalizeConfig(parsed);
  } catch {
    return { ...defaultConfig };
  }
}

async function loadFromDb(): Promise<ConfigStore> {
  await ensureTables();
  const pool = getPool();
  const res = await pool.query<{ value: unknown }>("SELECT value FROM app_config WHERE key = $1", ["config"]);
  if (res.rows.length === 0) return { ...defaultConfig };
  const parsed = res.rows[0].value as Partial<ConfigStore>;
  return normalizeConfig(parsed);
}

export async function loadConfig(): Promise<ConfigStore> {
  if (isDbConfigured()) return loadFromDb();
  return loadFromFile();
}

/** Retorna token, ig_user_id e id interno da conta (conta_id ou padrão). Para uso interno ao publicar. */
export function getContaParaPublicar(
  config: ConfigStore,
  contaId?: string | null
): { token: string; igUserId: string; contaId: string } | null {
  const id = (contaId ?? config.instagram_default_id)?.trim();
  const conta = id
    ? config.contas_instagram.find((c) => c.id === id)
    : config.contas_instagram[0];
  if (!conta?.access_token?.trim() || !conta?.ig_user_id?.trim()) return null;
  return { token: conta.access_token.trim(), igUserId: conta.ig_user_id.trim(), contaId: conta.id };
}

async function saveToFile(config: ConfigStore): Promise<ConfigStore> {
  await ensureDataDir();
  const toSave: ConfigStore = { ...config };
  delete (toSave as Partial<ConfigStore>).instagram;
  await writeFile(CONFIG_PATH, JSON.stringify(toSave, null, 2), "utf-8");
  return config;
}

async function saveToDb(config: ConfigStore): Promise<ConfigStore> {
  await ensureTables();
  const pool = getPool();
  const toSave = { ...config } as Record<string, unknown>;
  delete toSave.instagram;
  await pool.query(
    `INSERT INTO app_config (key, value) VALUES ('config', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(toSave)]
  );
  return config;
}

export type ContaInstagramInput = {
  id?: string;
  nome: string;
  ig_user_id: string;
  facebook_page_id?: string;
  access_token?: string; // se vazio, mantém o existente
  agent_access_token?: string;
  agent_ativo?: boolean;
  agent_nome?: string;
  agent_prompt_comentarios?: string;
  agent_prompt_direct?: string;
};

export async function saveConfig(
  config: Partial<Omit<ConfigStore, "empresa" | "contas_instagram">> & {
    empresa?: Partial<EmpresaPerfil>;
    contas_instagram?: ContaInstagramInput[];
  }
): Promise<ConfigStore> {
  const current = await loadConfig();
  let contas = current.contas_instagram;
  let defaultId = current.instagram_default_id;

  if (config.contas_instagram) {
    const input = config.contas_instagram;
    contas = input.map((c) => {
      const existing = c.id ? contas.find((x) => x.id === c.id) : null;
      const token = (c.access_token?.trim() || existing?.access_token) ?? "";
      const agentTok = (c.agent_access_token?.trim() || existing?.agent_access_token) ?? "";
      return {
        id: c.id ?? genContaId(),
        nome: (c.nome ?? existing?.nome ?? "").trim() || "Conta",
        ig_user_id: (c.ig_user_id ?? existing?.ig_user_id ?? "").trim(),
        facebook_page_id: (c.facebook_page_id?.trim() || existing?.facebook_page_id) ?? "",
        access_token: token,
        agent_access_token: agentTok,
        agent_ativo: c.agent_ativo ?? existing?.agent_ativo ?? false,
        agent_nome: (c.agent_nome ?? existing?.agent_nome ?? "").trim(),
        agent_prompt_comentarios: (c.agent_prompt_comentarios ?? existing?.agent_prompt_comentarios ?? "").trim(),
        agent_prompt_direct: (c.agent_prompt_direct ?? existing?.agent_prompt_direct ?? "").trim(),
      };
    });
  }

  if (config.instagram_default_id !== undefined) {
    defaultId = config.instagram_default_id?.trim() || null;
  }
  if (config.empresa) {
    const e = config.empresa;
    const emp = { ...current.empresa };
    if (e.nome !== undefined) emp.nome = e.nome.trim() || "Empresa";
    if (e.nome_fantasia !== undefined) emp.nome_fantasia = (e.nome_fantasia ?? "").trim();
    if (e.segmento !== undefined) emp.segmento = (e.segmento ?? "").trim();
    if (e.cidade !== undefined) emp.cidade = (e.cidade ?? "").trim();
    if (e.tom_voz !== undefined) emp.tom_voz = (e.tom_voz ?? "").trim();
    if (e.sobre !== undefined) emp.sobre = (e.sobre ?? "").trim();
    if (e.objetivo_qualificacao !== undefined) emp.objetivo_qualificacao = (e.objetivo_qualificacao ?? "").trim();
    if (e.handoff_whatsapp !== undefined) emp.handoff_whatsapp = (e.handoff_whatsapp ?? "").trim();
    if (e.link_produto_servico !== undefined) emp.link_produto_servico = (e.link_produto_servico ?? "").trim();
    if (e.agenda_config !== undefined) emp.agenda_config = parseAgendaConfig(e.agenda_config);
    if (e.criterios_qualificacao !== undefined) emp.criterios_qualificacao = (e.criterios_qualificacao ?? "").trim();
    if (e.agenda_local !== undefined) emp.agenda_local = (e.agenda_local ?? "").trim();
    current.empresa = emp;
  }

  const next: ConfigStore = {
    empresa: current.empresa,
    contas_instagram: contas,
    instagram_default_id: defaultId,
  };
  if (isDbConfigured()) return saveToDb(next);
  return saveToFile(next);
}
