import { ensureTables, getPool, isDbConfigured } from "../db/index.js";
import {
  getDebounceSeconds,
  isRedisConfigured,
  pingRedis,
  tryMarkMessageSeen,
  touchDebounce,
} from "../services/redis.js";
import { normalizePhoneDigits } from "../util/phone.js";

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

export type WhatsappQueueStatusResult = {
  ok: boolean;
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
}): Promise<WhatsappQueueStatusResult | { ok: false; code: string; message: string }> {
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
