import { Redis } from "ioredis";

let client: Redis | null = null;
let connectAttempted = false;

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL?.trim());
}

export function getDebounceSeconds(): number {
  const raw = Number(process.env.WA_DEBOUNCE_SECONDS ?? 8);
  if (!Number.isFinite(raw) || raw < 2) return 8;
  return Math.min(Math.floor(raw), 30);
}

export function getDebounceMaxWaitSeconds(): number {
  const raw = Number(process.env.WA_DEBOUNCE_MAX_WAIT ?? 30);
  if (!Number.isFinite(raw) || raw < 5) return 30;
  return Math.min(Math.floor(raw), 120);
}

export function getRedis(): Redis | null {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  if (!client && !connectAttempted) {
    connectAttempted = true;
    client = new Redis(url, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    client.on("error", (err: Error) => {
      console.warn("[redis]", err.message);
    });
  }
  return client;
}

export async function pingRedis(): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    if (redis.status !== "ready") await redis.connect();
    const pong = await redis.ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}

function dedupKey(organizationId: string, messageIdExt: string): string {
  return `wa:seen:${organizationId}:${messageIdExt}`;
}

function debounceKey(batchKey: string): string {
  return `wa:debounce:${batchKey}`;
}

function lockKey(batchKey: string): string {
  return `wa:lock:${batchKey}`;
}

/** true = primeira vez (pode enfileirar); false = webhook duplicado. */
export async function tryMarkMessageSeen(
  organizationId: string,
  messageIdExt: string,
  ttlSeconds = 86400
): Promise<boolean> {
  const redis = getRedis();
  if (!redis || !messageIdExt.trim()) return true;
  try {
    if (redis.status !== "ready") await redis.connect();
    const ok = await redis.set(dedupKey(organizationId, messageIdExt), "1", "EX", ttlSeconds, "NX");
    return ok === "OK";
  } catch {
    return true;
  }
}

/** Renova janela de debounce (memória curta). */
export async function touchDebounce(batchKey: string, seconds?: number): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  const ttl = seconds ?? getDebounceSeconds();
  try {
    if (redis.status !== "ready") await redis.connect();
    await redis.set(debounceKey(batchKey), String(Date.now()), "EX", ttl);
    return true;
  } catch {
    return false;
  }
}

/** Lock exclusivo por batch (usado no passo 2 — processamento). */
export async function tryAcquireBatchLock(batchKey: string, ttlSeconds = 90): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true;
  try {
    if (redis.status !== "ready") await redis.connect();
    const ok = await redis.set(lockKey(batchKey), String(Date.now()), "EX", ttlSeconds, "NX");
    return ok === "OK";
  } catch {
    return true;
  }
}

export async function releaseBatchLock(batchKey: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    if (redis.status !== "ready") await redis.connect();
    await redis.del(lockKey(batchKey));
  } catch {
    /* ignore */
  }
}
