import { ensureTables, getPool, isDbConfigured } from "../db/index.js";
import {
  getDebounceMaxWaitSeconds,
  getDebounceSeconds,
  isRedisConfigured,
  pingRedis,
  releaseBatchLock,
  tryAcquireBatchLock,
  tryMarkMessageSeen,
  touchDebounce,
} from "../services/redis.js";
import { normalizePhoneDigits } from "../util/phone.js";
import { onLeadWhatsappReply } from "./crmCadencia.js";

export type WhatsappEnqueueInput = {
  instanceName: string;
  phone: string;
  messageText: string;
  messageIdExt?: string | null;
};

export type WhatsappEnqueueResult = {
  ok: boolean;
  code: string;
  message?: string;
  queue_id?: number;
  batch_key?: string;
  debounce_until?: string;
  debounce_seconds?: number;
  pending_count?: number;
  redis_debounce?: boolean;
};

export type WhatsappQueueStatusOk = {
  ok: true;
  batch_key: string;
  instance_name: string;
  telefone: string;
  organization_id: string;
  debounce_seconds: number;
  redis_configured: boolean;
  redis_ok: boolean;
  pending: Array<{
    id: number;
    message_id_ext: string | null;
    message_text: string;
    status: string;
    received_at: string;
    debounce_until: string;
  }>;
};

export type WhatsappQueueStatusError = {
  ok: false;
  code: string;
  message: string;
};

export type WhatsappQueueStatusResult = WhatsappQueueStatusOk | WhatsappQueueStatusError;

export type WhatsappReadyBatch = {
  batch_key: string;
  instance_name: string;
  telefone: string;
  organization_id: string;
  message_text: string;
  message_count: number;
  queue_ids: number[];
  message_ids_ext: string[];
};

export type WhatsappProcessReadyResult =
  | { ok: true; code: string; batches: WhatsappReadyBatch[]; debounce_seconds: number; max_wait_seconds: number }
  | { ok: false; code: string; message: string };

export type WhatsappQueueCompleteResult =
  | { ok: true; code: string; updated: number; batch_key?: string }
  | { ok: false; code: string; message: string };

type InstanceRow = { organization_id: string; instance_name: string };

async function resolveInstance(instanceName: string): Promise<InstanceRow | null> {
  await ensureTables();
  const pool = getPool();
  const r = await pool.query<InstanceRow>(
    `SELECT organization_id, instance_name
     FROM whatsapp_instances WHERE instance_name = $1 LIMIT 1`,
    [instanceName.trim()]
  );
  return r.rows[0] ?? null;
}

function batchKey(organizationId: string, telefone: string): string {
  return `${organizationId}:${telefone}`;
}

export async function enqueueWhatsappInbound(input: WhatsappEnqueueInput): Promise<WhatsappEnqueueResult> {
  if (!isDbConfigured()) {
    return { ok: false, code: "DATABASE_NOT_CONFIGURED", message: "DATABASE_URL não configurada." };
  }

  const instanceName = input.instanceName.trim();
  const telefone = normalizePhoneDigits(input.phone);
  const messageText = (input.messageText ?? "").trim();
  const messageIdExt = (input.messageIdExt ?? "").trim() || null;

  if (!instanceName) {
    return { ok: false, code: "MISSING_INSTANCE", message: "Informe instance_name." };
  }
  if (!telefone) {
    return { ok: false, code: "INVALID_PHONE", message: "Telefone inválido." };
  }
  if (!messageText) {
    return { ok: false, code: "EMPTY_MESSAGE", message: "Mensagem vazia." };
  }

  const instance = await resolveInstance(instanceName);
  if (!instance) {
    return { ok: false, code: "INSTANCE_NOT_FOUND", message: "Instância WhatsApp não encontrada." };
  }

  const orgId = instance.organization_id;
  const key = batchKey(orgId, telefone);
  const debounceSeconds = getDebounceSeconds();

  if (messageIdExt) {
    const firstSeen = await tryMarkMessageSeen(orgId, messageIdExt);
    if (!firstSeen) {
      return { ok: true, code: "DUPLICATE", message: "message_id_ext já processado (Redis).", batch_key: key };
    }
  }

  await ensureTables();
  const pool = getPool();

  const insert = messageIdExt
    ? await pool.query<{ id: number }>(
        `INSERT INTO whatsapp_inbound_queue (
           organization_id, instance_name, telefone, message_id_ext, message_text,
           batch_key, status, debounce_until
         ) VALUES (
           $1::uuid, $2, $3, $4, $5, $6, 'queued', NOW() + ($7 || ' seconds')::interval
         )
         ON CONFLICT (organization_id, message_id_ext)
           WHERE message_id_ext IS NOT NULL AND message_id_ext <> ''
         DO NOTHING
         RETURNING id`,
        [orgId, instanceName, telefone, messageIdExt, messageText, key, String(debounceSeconds)]
      )
    : await pool.query<{ id: number }>(
        `INSERT INTO whatsapp_inbound_queue (
           organization_id, instance_name, telefone, message_id_ext, message_text,
           batch_key, status, debounce_until
         ) VALUES (
           $1::uuid, $2, $3, NULL, $4, $5, 'queued', NOW() + ($6 || ' seconds')::interval
         )
         RETURNING id`,
        [orgId, instanceName, telefone, messageText, key, String(debounceSeconds)]
      );

  if (insert.rowCount === 0) {
    return {
      ok: true,
      code: "DUPLICATE",
      message: "message_id_ext já enfileirado (Postgres).",
      batch_key: key,
    };
  }

  const extend = await pool.query<{ debounce_until: Date; pending_count: string }>(
    `WITH updated AS (
       UPDATE whatsapp_inbound_queue
       SET debounce_until = NOW() + ($2 || ' seconds')::interval
       WHERE batch_key = $1 AND status = 'queued'
       RETURNING debounce_until
     )
     SELECT debounce_until, (SELECT COUNT(*)::text FROM whatsapp_inbound_queue WHERE batch_key = $1 AND status = 'queued') AS pending_count
     FROM updated
     LIMIT 1`,
    [key, String(debounceSeconds)]
  );

  const redisDebounce = await touchDebounce(key, debounceSeconds);
  const debounceUntil = extend.rows[0]?.debounce_until ?? new Date(Date.now() + debounceSeconds * 1000);
  const pendingCount = Number(extend.rows[0]?.pending_count ?? 1);

  onLeadWhatsappReply(orgId, telefone).catch(() => {});

  return {
    ok: true,
    code: "ENQUEUED",
    queue_id: insert.rows[0]?.id,
    batch_key: key,
    debounce_until: debounceUntil.toISOString(),
    debounce_seconds: debounceSeconds,
    pending_count: pendingCount,
    redis_debounce: redisDebounce,
  };
}

export async function getWhatsappQueueStatus(args: {
  instanceName: string;
  phone: string;
}): Promise<WhatsappQueueStatusResult> {
  if (!isDbConfigured()) {
    return { ok: false, code: "DATABASE_NOT_CONFIGURED", message: "DATABASE_URL não configurada." };
  }

  const instanceName = args.instanceName.trim();
  const telefone = normalizePhoneDigits(args.phone);
  if (!instanceName || !telefone) {
    return { ok: false, code: "MISSING_LOOKUP", message: "Informe instance e phone." };
  }

  const instance = await resolveInstance(instanceName);
  if (!instance) {
    return { ok: false, code: "INSTANCE_NOT_FOUND", message: "Instância não encontrada." };
  }

  const key = batchKey(instance.organization_id, telefone);
  await ensureTables();
  const pool = getPool();
  const r = await pool.query<{
    id: number;
    message_id_ext: string | null;
    message_text: string;
    status: string;
    received_at: Date;
    debounce_until: Date;
  }>(
    `SELECT id, message_id_ext, message_text, status, received_at, debounce_until
     FROM whatsapp_inbound_queue
     WHERE batch_key = $1 AND status IN ('queued', 'processing')
     ORDER BY received_at ASC
     LIMIT 20`,
    [key]
  );

  const redisOk = isRedisConfigured() ? await pingRedis() : false;

  return {
    ok: true,
    batch_key: key,
    instance_name: instanceName,
    telefone,
    organization_id: instance.organization_id,
    debounce_seconds: getDebounceSeconds(),
    redis_configured: isRedisConfigured(),
    redis_ok: redisOk,
    pending: r.rows.map((row) => ({
      id: row.id,
      message_id_ext: row.message_id_ext,
      message_text: row.message_text,
      status: row.status,
      received_at: row.received_at.toISOString(),
      debounce_until: row.debounce_until.toISOString(),
    })),
  };
}

type ReadyBatchRow = {
  batch_key: string;
  instance_name: string;
  telefone: string;
  organization_id: string;
};

type QueueMessageRow = {
  id: number;
  message_id_ext: string | null;
  message_text: string;
};

async function fetchReadyBatchCandidates(limit: number): Promise<ReadyBatchRow[]> {
  await ensureTables();
  const pool = getPool();
  const maxWait = getDebounceMaxWaitSeconds();
  const r = await pool.query<ReadyBatchRow>(
    `SELECT batch_key, instance_name, telefone, organization_id::text AS organization_id
     FROM whatsapp_inbound_queue
     WHERE status = 'queued'
     GROUP BY batch_key, instance_name, telefone, organization_id
     HAVING MAX(debounce_until) <= NOW()
         OR MIN(received_at) <= NOW() - ($1 || ' seconds')::interval
     ORDER BY MIN(received_at) ASC
     LIMIT $2`,
    [String(maxWait), limit]
  );
  return r.rows;
}

async function claimReadyBatch(batchKey: string): Promise<WhatsappReadyBatch | null> {
  const locked = await tryAcquireBatchLock(batchKey);
  if (!locked) return null;

  await ensureTables();
  const pool = getPool();

  try {
    const pending = await pool.query<QueueMessageRow>(
      `SELECT id, message_id_ext, message_text
       FROM whatsapp_inbound_queue
       WHERE batch_key = $1 AND status = 'queued'
       ORDER BY received_at ASC`,
      [batchKey]
    );

    if (pending.rowCount === 0) {
      await releaseBatchLock(batchKey);
      return null;
    }

    const meta = await pool.query<ReadyBatchRow>(
      `SELECT batch_key, instance_name, telefone, organization_id::text AS organization_id
       FROM whatsapp_inbound_queue
       WHERE batch_key = $1
       LIMIT 1`,
      [batchKey]
    );
    const head = meta.rows[0];
    if (!head) {
      await releaseBatchLock(batchKey);
      return null;
    }

    const ids = pending.rows.map((row) => row.id);
    await pool.query(
      `UPDATE whatsapp_inbound_queue
       SET status = 'processing', processed_at = NOW()
       WHERE id = ANY($1::int[]) AND status = 'queued'`,
      [ids]
    );

    const texts = pending.rows.map((row) => row.message_text.trim()).filter(Boolean);
    const messageIds = pending.rows
      .map((row) => (row.message_id_ext ?? "").trim())
      .filter(Boolean);

    return {
      batch_key: head.batch_key,
      instance_name: head.instance_name,
      telefone: head.telefone,
      organization_id: head.organization_id,
      message_text: texts.join("\n"),
      message_count: texts.length,
      queue_ids: ids,
      message_ids_ext: messageIds,
    };
  } catch {
    await releaseBatchLock(batchKey);
    throw new Error("claimReadyBatch failed");
  }
}

/** Agrupa batches prontos (debounce expirado ou max wait) e reserva com lock Redis. */
export async function processReadyWhatsappBatches(args?: { limit?: number }): Promise<WhatsappProcessReadyResult> {
  if (!isDbConfigured()) {
    return { ok: false, code: "DATABASE_NOT_CONFIGURED", message: "DATABASE_URL não configurada." };
  }

  const limit = Math.min(Math.max(args?.limit ?? 5, 1), 20);
  const candidates = await fetchReadyBatchCandidates(limit);
  const batches: WhatsappReadyBatch[] = [];

  for (const candidate of candidates) {
    if (batches.length >= limit) break;
    const claimed = await claimReadyBatch(candidate.batch_key);
    if (claimed) batches.push(claimed);
  }

  return {
    ok: true,
    code: batches.length > 0 ? "BATCHES_READY" : "NO_BATCHES",
    batches,
    debounce_seconds: getDebounceSeconds(),
    max_wait_seconds: getDebounceMaxWaitSeconds(),
  };
}

/** Marca fila como concluída após resposta do agente (libera lock Redis). */
export async function completeWhatsappBatch(args: {
  batchKey?: string;
  queueIds?: number[];
}): Promise<WhatsappQueueCompleteResult> {
  if (!isDbConfigured()) {
    return { ok: false, code: "DATABASE_NOT_CONFIGURED", message: "DATABASE_URL não configurada." };
  }

  const batchKey = (args.batchKey ?? "").trim();
  const queueIds = (args.queueIds ?? []).filter((id) => Number.isFinite(id) && id > 0);

  if (!batchKey && queueIds.length === 0) {
    return { ok: false, code: "MISSING_LOOKUP", message: "Informe batch_key ou queue_ids." };
  }

  await ensureTables();
  const pool = getPool();

  const r = batchKey
    ? await pool.query<{ batch_key: string }>(
        `UPDATE whatsapp_inbound_queue
         SET status = 'done', processed_at = COALESCE(processed_at, NOW())
         WHERE batch_key = $1 AND status = 'processing'
         RETURNING batch_key`,
        [batchKey]
      )
    : await pool.query<{ batch_key: string }>(
        `UPDATE whatsapp_inbound_queue
         SET status = 'done', processed_at = COALESCE(processed_at, NOW())
         WHERE id = ANY($1::int[]) AND status = 'processing'
         RETURNING batch_key`,
        [queueIds]
      );

  const resolvedKey = r.rows[0]?.batch_key ?? batchKey;
  if (resolvedKey) await releaseBatchLock(resolvedKey);

  return {
    ok: true,
    code: r.rowCount && r.rowCount > 0 ? "COMPLETED" : "NOTHING_TO_COMPLETE",
    updated: r.rowCount ?? 0,
    batch_key: resolvedKey || undefined,
  };
}
