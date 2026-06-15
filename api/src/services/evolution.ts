/**
 * Cliente Evolution API v2 (Baileys) — provisionamento de webhook para o n8n.
 * @see https://doc.evolution-api.com/v2/api-reference/webhook/set
 */

export type EvolutionEnv = {
  baseUrl: string;
  apiKey: string;
  webhookUrl: string;
};

/** Eventos mínimos para o agente WhatsApp (n8n path whatsapp-evolution). */
export const EVOLUTION_WEBHOOK_EVENTS = [
  "MESSAGES_UPSERT",
  "CONNECTION_UPDATE",
] as const;

export type EvolutionWebhookConfig = {
  enabled: boolean;
  url: string;
  webhookByEvents?: boolean;
  webhookBase64?: boolean;
  events: string[];
};

type EvolutionErrorJson = {
  status?: number;
  error?: string | { message?: string };
  message?: string | string[];
  response?: { message?: string | string[] };
};

export function getEvolutionEnv(): EvolutionEnv | null {
  const baseUrl = (process.env.EVOLUTION_BASE_URL ?? "").trim().replace(/\/$/, "");
  const apiKey = (process.env.EVOLUTION_GLOBAL_API_KEY ?? "").trim();
  const webhookUrl = (process.env.N8N_WEBHOOK_WHATSAPP_EVOLUTION ?? "").trim();
  if (!baseUrl || !apiKey || !webhookUrl) return null;
  return { baseUrl, apiKey, webhookUrl };
}

export function isEvolutionConfigured(): boolean {
  return getEvolutionEnv() !== null;
}

/** URL da Evolution: env central tem prioridade sobre valor salvo no workspace. */
export function resolveEvolutionBaseUrl(storedUrl?: string | null): string {
  const fromEnv = (process.env.EVOLUTION_BASE_URL ?? "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  return (storedUrl ?? "").trim().replace(/\/$/, "");
}

function parseEvolutionError(json: EvolutionErrorJson, httpStatus: number): string {
  const nested = json.response?.message;
  if (Array.isArray(nested) && nested.length) return nested.join("; ");
  if (typeof nested === "string" && nested.trim()) return nested.trim();
  const err = json.error;
  if (typeof err === "string" && err.trim()) return err.trim();
  if (typeof err === "object" && err?.message) return err.message;
  if (Array.isArray(json.message) && json.message.length) return json.message.join("; ");
  if (typeof json.message === "string" && json.message.trim()) return json.message.trim();
  return `Evolution HTTP ${httpStatus}`;
}

async function evolutionFetch<T>(
  baseUrl: string,
  apiKey: string,
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const url = `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        apikey: apiKey,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    const hint = err instanceof Error ? err.message : "erro de rede";
    throw new Error(
      `Não foi possível conectar na Evolution (${baseUrl}). ${hint}. Verifique EVOLUTION_BASE_URL e rede do container.`
    );
  }

  const raw = await res.text();
  let json: EvolutionErrorJson & T = {} as EvolutionErrorJson & T;
  if (raw.trim()) {
    try {
      json = JSON.parse(raw) as EvolutionErrorJson & T;
    } catch {
      if (!res.ok) {
        throw new Error(`Evolution HTTP ${res.status}: ${raw.slice(0, 200)}`);
      }
    }
  }

  if (!res.ok) {
    throw new Error(parseEvolutionError(json, res.status));
  }
  return json;
}

function normalizeWebhookConfig(raw: unknown): EvolutionWebhookConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const nested = o.webhook && typeof o.webhook === "object" ? (o.webhook as Record<string, unknown>) : o;
  const url = typeof nested.url === "string" ? nested.url : "";
  const enabled = nested.enabled === true;
  const events = Array.isArray(nested.events) ? nested.events.filter((e) => typeof e === "string") : [];
  if (!url && !enabled) return null;
  return {
    enabled,
    url,
    webhookByEvents: nested.webhookByEvents === true,
    webhookBase64: nested.webhookBase64 === true,
    events,
  };
}

/** Verifica se a instância existe na Evolution (nome exato). */
export async function evolutionInstanceExists(instanceName: string, baseUrl?: string): Promise<boolean> {
  const env = getEvolutionEnv();
  if (!env) return false;
  const name = instanceName.trim();
  if (!name) return false;

  const json = await evolutionFetch<unknown[] | { instance?: unknown }>(
    baseUrl?.trim() || env.baseUrl,
    env.apiKey,
    "GET",
    `/instance/fetchInstances?instanceName=${encodeURIComponent(name)}`
  );

  if (Array.isArray(json)) return json.length > 0;
  if (json && typeof json === "object" && "instance" in json) return true;
  return false;
}

export async function setInstanceWebhook(
  instanceName: string,
  opts?: { baseUrl?: string; webhookUrl?: string }
): Promise<{ instanceName: string; webhook: EvolutionWebhookConfig }> {
  const env = getEvolutionEnv();
  if (!env) {
    throw new Error(
      "Evolution não configurada na API. Defina EVOLUTION_BASE_URL, EVOLUTION_GLOBAL_API_KEY e N8N_WEBHOOK_WHATSAPP_EVOLUTION."
    );
  }
  const baseUrl = opts?.baseUrl?.trim() || env.baseUrl;
  const webhookUrl = opts?.webhookUrl?.trim() || env.webhookUrl;
  const name = instanceName.trim();
  if (!name) throw new Error("instance_name obrigatório.");

  const exists = await evolutionInstanceExists(name, baseUrl);
  if (!exists) {
    throw new Error(
      `Instância "${name}" não existe na Evolution (${baseUrl}). Crie no manager ou corrija o nome no painel.`
    );
  }

  const payload = {
    enabled: true,
    url: webhookUrl,
    webhookByEvents: false,
    webhookBase64: false,
    events: [...EVOLUTION_WEBHOOK_EVENTS],
  };

  const json = await evolutionFetch<{ webhook?: { instanceName?: string; webhook?: unknown } }>(
    baseUrl,
    env.apiKey,
    "POST",
    `/webhook/set/${encodeURIComponent(name)}`,
    payload
  );

  const nested = normalizeWebhookConfig(json.webhook?.webhook ?? json.webhook);
  return {
    instanceName: json.webhook?.instanceName ?? name,
    webhook: nested ?? { enabled: true, url: webhookUrl, events: [...EVOLUTION_WEBHOOK_EVENTS] },
  };
}

export async function findInstanceWebhook(
  instanceName: string,
  baseUrl?: string
): Promise<EvolutionWebhookConfig | null> {
  const env = getEvolutionEnv();
  if (!env) {
    throw new Error(
      "Evolution não configurada na API. Defina EVOLUTION_BASE_URL, EVOLUTION_GLOBAL_API_KEY e N8N_WEBHOOK_WHATSAPP_EVOLUTION."
    );
  }
  const name = instanceName.trim();
  if (!name) throw new Error("instance_name obrigatório.");

  try {
    const json = await evolutionFetch<unknown>(
      baseUrl?.trim() || env.baseUrl,
      env.apiKey,
      "GET",
      `/webhook/find/${encodeURIComponent(name)}`
    );
    return normalizeWebhookConfig(json);
  } catch {
    return null;
  }
}
