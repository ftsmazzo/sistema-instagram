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

async function evolutionFetch<T>(
  baseUrl: string,
  apiKey: string,
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const url = `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  const res = await fetch(url, {
    method,
    headers: {
      apikey: apiKey,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: string | { message?: string };
    message?: string | string[];
  };
  if (!res.ok) {
    const err = json.error;
    const msg =
      typeof err === "string"
        ? err
        : typeof err === "object" && err?.message
          ? err.message
          : Array.isArray(json.message)
            ? json.message.join(", ")
            : typeof json.message === "string"
              ? json.message
              : `Evolution HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
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

  const payload = {
    enabled: true,
    url: webhookUrl,
    webhookByEvents: false,
    webhookBase64: false,
    events: [...EVOLUTION_WEBHOOK_EVENTS],
  };

  const json = await evolutionFetch<{ webhook?: { instanceName?: string; webhook?: EvolutionWebhookConfig } }>(
    baseUrl,
    env.apiKey,
    "POST",
    `/webhook/set/${encodeURIComponent(name)}`,
    payload
  );

  const nested = json.webhook?.webhook;
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

  const json = await evolutionFetch<EvolutionWebhookConfig | null>(
    baseUrl?.trim() || env.baseUrl,
    env.apiKey,
    "GET",
    `/webhook/find/${encodeURIComponent(name)}`
  );
  if (!json || typeof json !== "object") return null;
  if (!json.url && !json.enabled) return null;
  return json;
}
