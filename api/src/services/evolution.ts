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

export type EvolutionConnectionState = "open" | "connecting" | "close";

export type EvolutionConnectQr = {
  qr_base64: string | null;
  qr_code: string | null;
  pairing_code: string | null;
};

export type EvolutionInstanceStatus = {
  instance_name: string;
  state: EvolutionConnectionState;
  profile_name: string | null;
  phone_number: string | null;
  profile_picture_url: string | null;
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
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
  opts?: { notFoundOk?: boolean }
): Promise<T | null> {
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
    const errMsg = parseEvolutionError(json, res.status);
    if (opts?.notFoundOk && (res.status === 404 || /not found/i.test(errMsg))) {
      return null;
    }
    throw new Error(errMsg);
  }
  return json;
}

function pickString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function normalizeQrPayload(raw: unknown): EvolutionConnectQr {
  const empty: EvolutionConnectQr = { qr_base64: null, qr_code: null, pairing_code: null };
  if (!raw || typeof raw !== "object") return empty;
  const o = raw as Record<string, unknown>;
  const nested =
    o.qrcode && typeof o.qrcode === "object" ? (o.qrcode as Record<string, unknown>) : o;
  const base64 = pickString(nested.base64, nested.qrcode, o.base64);
  const qrCode = pickString(nested.code, o.code);
  const pairing = pickString(nested.pairingCode, o.pairingCode);
  let qr_base64 = base64;
  if (qr_base64 && !qr_base64.startsWith("data:")) {
    qr_base64 = `data:image/png;base64,${qr_base64}`;
  }
  return { qr_base64, qr_code: qrCode, pairing_code: pairing };
}

function jidToPhone(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const digits = jid.split("@")[0]?.replace(/\D/g, "") ?? "";
  return digits.length >= 8 ? digits : null;
}

function mapEvolutionState(raw: string | null | undefined): EvolutionConnectionState | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "open") return "open";
  if (s === "connecting") return "connecting";
  if (s === "close" || s === "closed") return "close";
  return null;
}

function findInstanceRow(raw: unknown, instanceName: string): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const n = pickString(row.instanceName, row.name);
      if (n === instanceName) return row;
    }
    const first = raw[0];
    return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
  }
  const o = raw as Record<string, unknown>;
  if (o.instance && typeof o.instance === "object") return o.instance as Record<string, unknown>;
  return o;
}

function normalizeConnectionState(raw: unknown): EvolutionConnectionState {
  if (!raw || typeof raw !== "object") return "close";
  const o = raw as Record<string, unknown>;
  const nested =
    o.instance && typeof o.instance === "object" ? (o.instance as Record<string, unknown>) : o;
  const mapped = mapEvolutionState(
    pickString(nested.state, nested.connectionStatus, nested.status, o.state, o.connectionStatus)
  );
  return mapped ?? "close";
}

function normalizeInstanceProfile(raw: unknown, instanceName: string): EvolutionInstanceStatus {
  const row = findInstanceRow(raw, instanceName);
  if (!row) {
    return {
      instance_name: instanceName,
      state: normalizeConnectionState(raw),
      profile_name: null,
      phone_number: null,
      profile_picture_url: null,
    };
  }

  const phone =
    pickString(row.number, row.owner, row.phone, row.wuid) ??
    jidToPhone(pickString(row.ownerJid, row.owner_jid, row.remoteJid));

  const mappedState =
    mapEvolutionState(pickString(row.connectionStatus, row.state, row.status)) ??
    normalizeConnectionState(raw);

  return {
    instance_name: pickString(row.instanceName, row.name, instanceName) ?? instanceName,
    state: mappedState,
    profile_name: pickString(row.profileName, row.profile_name, row.pushName),
    phone_number: phone,
    profile_picture_url: pickString(
      row.profilePicUrl,
      row.profilePictureUrl,
      row.profile_picture_url,
      row.pictureUrl
    ),
  };
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

  const json = await evolutionFetch<unknown[] | Record<string, unknown>>(
    baseUrl?.trim() || env.baseUrl,
    env.apiKey,
    "GET",
    `/instance/fetchInstances?instanceName=${encodeURIComponent(name)}`,
    undefined,
    { notFoundOk: true }
  );

  if (!json) return false;
  if (Array.isArray(json)) return json.length > 0;
  if (typeof json === "object" && ("instance" in json || "instanceName" in json || "name" in json)) return true;
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

  await ensureEvolutionInstance(name, baseUrl);

  const payload = {
    webhook: {
      enabled: true,
      url: webhookUrl,
      webhookByEvents: false,
      webhookBase64: false,
      events: [...EVOLUTION_WEBHOOK_EVENTS],
    },
  };

  const json = await evolutionFetch<{ webhook?: { instanceName?: string; webhook?: unknown } }>(
    baseUrl,
    env.apiKey,
    "POST",
    `/webhook/set/${encodeURIComponent(name)}`,
    payload
  );
  if (!json) throw new Error(`Falha ao configurar webhook da instância "${name}".`);

  const nested = normalizeWebhookConfig(json.webhook?.webhook ?? json.webhook);
  return {
    instanceName: json.webhook?.instanceName ?? name,
    webhook: nested ?? { enabled: true, url: webhookUrl, events: [...EVOLUTION_WEBHOOK_EVENTS] },
  };
}

/** Cria instância Baileys na Evolution (idempotente se já existir). */
export async function ensureEvolutionInstance(instanceName: string, baseUrl?: string): Promise<void> {
  const env = getEvolutionEnv();
  if (!env) {
    throw new Error(
      "Evolution não configurada na API. Defina EVOLUTION_BASE_URL e EVOLUTION_GLOBAL_API_KEY."
    );
  }
  const name = instanceName.trim();
  if (!name) throw new Error("instance_name obrigatório.");
  const url = baseUrl?.trim() || env.baseUrl;

  if (await evolutionInstanceExists(name, url)) return;

  try {
    await evolutionFetch<{ instance?: { instanceName?: string } }>(
      url,
      env.apiKey,
      "POST",
      "/instance/create",
      {
        instanceName: name,
        qrcode: false,
        integration: "WHATSAPP-BAILEYS",
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/already exists|já existe|duplicate|is already/i.test(msg)) return;
    throw err;
  }
}

/** @deprecated use ensureEvolutionInstance */
export async function createEvolutionInstance(instanceName: string, baseUrl?: string): Promise<void> {
  return ensureEvolutionInstance(instanceName, baseUrl);
}

/** Gera QR / pairing code para conectar WhatsApp. */
export async function getEvolutionConnectQr(
  instanceName: string,
  baseUrl?: string
): Promise<EvolutionConnectQr> {
  const env = getEvolutionEnv();
  if (!env) {
    throw new Error(
      "Evolution não configurada na API. Defina EVOLUTION_BASE_URL e EVOLUTION_GLOBAL_API_KEY."
    );
  }
  const name = instanceName.trim();
  if (!name) throw new Error("instance_name obrigatório.");
  const url = baseUrl?.trim() || env.baseUrl;

  const json = await evolutionFetch<unknown>(
    url,
    env.apiKey,
    "GET",
    `/instance/connect/${encodeURIComponent(name)}`
  );
  if (!json) throw new Error(`Não foi possível gerar QR para a instância "${name}".`);
  return normalizeQrPayload(json);
}

/** Estado da conexão + dados básicos do perfil (quando disponível). */
export async function getEvolutionInstanceStatus(
  instanceName: string,
  baseUrl?: string
): Promise<EvolutionInstanceStatus> {
  const env = getEvolutionEnv();
  if (!env) {
    throw new Error(
      "Evolution não configurada na API. Defina EVOLUTION_BASE_URL e EVOLUTION_GLOBAL_API_KEY."
    );
  }
  const name = instanceName.trim();
  if (!name) throw new Error("instance_name obrigatório.");
  const url = baseUrl?.trim() || env.baseUrl;

  const [stateJson, listJson] = await Promise.all([
    evolutionFetch<unknown>(
      url,
      env.apiKey,
      "GET",
      `/instance/connectionState/${encodeURIComponent(name)}`,
      undefined,
      { notFoundOk: true }
    ),
    evolutionFetch<unknown>(
      url,
      env.apiKey,
      "GET",
      `/instance/fetchInstances?instanceName=${encodeURIComponent(name)}`,
      undefined,
      { notFoundOk: true }
    ),
  ]);

  const fromState = normalizeInstanceProfile(stateJson ?? {}, name);
  const fromList = listJson ? normalizeInstanceProfile(listJson, name) : null;

  const state =
    fromList?.state && fromList.state !== "close"
      ? fromList.state
      : fromState.state !== "close"
        ? fromState.state
        : fromList?.state ?? "close";

  return {
    instance_name: name,
    state,
    profile_name: fromList?.profile_name ?? fromState.profile_name,
    phone_number: fromList?.phone_number ?? fromState.phone_number,
    profile_picture_url: fromList?.profile_picture_url ?? fromState.profile_picture_url,
  };
}

/** Desconecta WhatsApp (logout) mantendo a instância na Evolution. */
export async function logoutEvolutionInstance(instanceName: string, baseUrl?: string): Promise<void> {
  const env = getEvolutionEnv();
  if (!env) throw new Error("Evolution não configurada na API.");
  const name = instanceName.trim();
  if (!name) throw new Error("instance_name obrigatório.");
  const url = baseUrl?.trim() || env.baseUrl;
  await evolutionFetch(url, env.apiKey, "DELETE", `/instance/logout/${encodeURIComponent(name)}`, undefined, {
    notFoundOk: true,
  });
}

/** Remove instância da Evolution (irreversível na Evolution). */
export async function deleteEvolutionInstance(instanceName: string, baseUrl?: string): Promise<void> {
  const env = getEvolutionEnv();
  if (!env) throw new Error("Evolution não configurada na API.");
  const name = instanceName.trim();
  if (!name) throw new Error("instance_name obrigatório.");
  const url = baseUrl?.trim() || env.baseUrl;
  await evolutionFetch(url, env.apiKey, "DELETE", `/instance/delete/${encodeURIComponent(name)}`, undefined, {
    notFoundOk: true,
  });
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
      `/webhook/find/${encodeURIComponent(name)}`,
      undefined,
      { notFoundOk: true }
    );
    return normalizeWebhookConfig(json);
  } catch {
    return null;
  }
}
