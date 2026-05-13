import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { isDbConfigured, getPool, ensureTables } from "../db/index.js";

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), "data");
const AGENDADOS_PATH = join(DATA_DIR, "agendados.json");

export type AgendadoItem = {
  id: string;
  caption: string;
  media_url: string | null;
  media_urls: string[] | null;
  media_type: "IMAGE" | "REELS" | "CAROUSEL";
  data_agendamento?: string | null;
  conta_id?: string | null;
  status?: string;
  created_at: string;
};

async function ensureAgendadosFile(): Promise<AgendadoItem[]> {
  try {
    const raw = await readFile(AGENDADOS_PATH, "utf-8");
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function listFromFile(): Promise<AgendadoItem[]> {
  const list = await ensureAgendadosFile();
  return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

async function listFromDb(): Promise<AgendadoItem[]> {
  await ensureTables();
  const pool = getPool();
  const res = await pool.query<{
    id: string;
    caption: string;
    media_url: string | null;
    media_urls: string[] | null;
    media_type: string;
    data_agendamento: string | null;
    conta_id: string | null;
    status: string;
    created_at: string;
  }>(
    "SELECT id, caption, media_url, media_urls, media_type, data_agendamento::text, conta_id, status, created_at::text FROM postador_agendados ORDER BY created_at DESC"
  );
  return res.rows.map((r) => ({
    id: r.id,
    caption: r.caption,
    media_url: r.media_url ?? null,
    media_urls: Array.isArray(r.media_urls) ? r.media_urls : null,
    media_type: r.media_type as "IMAGE" | "REELS" | "CAROUSEL",
    data_agendamento: r.data_agendamento ? (typeof r.data_agendamento === "string" ? r.data_agendamento : new Date(r.data_agendamento as unknown as Date).toISOString()) : null,
    conta_id: r.conta_id,
    status: r.status,
    created_at: typeof r.created_at === "string" ? r.created_at : new Date(r.created_at as unknown as Date).toISOString(),
  }));
}

export async function listAgendados(): Promise<AgendadoItem[]> {
  if (isDbConfigured()) return listFromDb();
  return listFromFile();
}

function genId(): string {
  return `ag-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function addToFile(item: Omit<AgendadoItem, "id" | "created_at">): Promise<AgendadoItem> {
  await mkdir(DATA_DIR, { recursive: true });
  const list = await ensureAgendadosFile();
  const created_at = new Date().toISOString();
  const id = genId();
  const full: AgendadoItem = {
    id,
    caption: item.caption,
    media_url: item.media_url ?? null,
    media_urls: item.media_urls ?? null,
    media_type: item.media_type,
    data_agendamento: item.data_agendamento ?? null,
    conta_id: item.conta_id ?? null,
    status: item.status ?? "pendente",
    created_at,
  };
  list.unshift(full);
  await writeFile(AGENDADOS_PATH, JSON.stringify(list, null, 2), "utf-8");
  return full;
}

async function addToDb(item: Omit<AgendadoItem, "id" | "created_at">): Promise<AgendadoItem> {
  await ensureTables();
  const pool = getPool();
  const id = genId();
  const created_at = new Date().toISOString();
  await pool.query(
    `INSERT INTO postador_agendados (id, caption, media_url, media_urls, media_type, data_agendamento, conta_id, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      item.caption,
      item.media_url ?? null,
      item.media_urls ? JSON.stringify(item.media_urls) : null,
      item.media_type,
      item.data_agendamento ?? null,
      item.conta_id ?? null,
      item.status ?? 'pendente',
      created_at,
    ]
  );
  return {
    id,
    caption: item.caption,
    media_url: item.media_url ?? null,
    media_urls: item.media_urls ?? null,
    media_type: item.media_type,
    data_agendamento: item.data_agendamento ?? null,
    conta_id: item.conta_id ?? null,
    status: item.status ?? 'pendente',
    created_at,
  };
}

export async function addAgendado(item: Omit<AgendadoItem, "id" | "created_at">): Promise<AgendadoItem> {
  if (isDbConfigured()) return addToDb(item);
  return addToFile(item);
}

async function getFromFile(id: string): Promise<AgendadoItem | null> {
  const list = await ensureAgendadosFile();
  return list.find((x) => x.id === id) ?? null;
}

async function getFromDb(id: string): Promise<AgendadoItem | null> {
  await ensureTables();
  const pool = getPool();
  const res = await pool.query<{
    id: string;
    caption: string;
    media_url: string | null;
    media_urls: unknown;
    media_type: string;
    data_agendamento: string | null;
    conta_id: string | null;
    status: string;
    created_at: string;
  }>("SELECT id, caption, media_url, media_urls, media_type, data_agendamento::text, conta_id, status, created_at::text FROM postador_agendados WHERE id = $1", [
    id,
  ]);
  const r = res.rows[0];
  if (!r) return null;
  const media_urls = Array.isArray(r.media_urls) ? r.media_urls : null;
  return {
    id: r.id,
    caption: r.caption,
    media_url: r.media_url ?? null,
    media_urls,
    media_type: r.media_type as "IMAGE" | "REELS" | "CAROUSEL",
    data_agendamento: r.data_agendamento ? (typeof r.data_agendamento === "string" ? r.data_agendamento : new Date(r.data_agendamento as unknown as Date).toISOString()) : null,
    conta_id: r.conta_id,
    status: r.status,
    created_at: typeof r.created_at === "string" ? r.created_at : new Date(r.created_at as unknown as Date).toISOString(),
  };
}

export async function getAgendado(id: string): Promise<AgendadoItem | null> {
  if (isDbConfigured()) return getFromDb(id);
  return getFromFile(id);
}

async function deleteFromFile(id: string): Promise<boolean> {
  const list = await ensureAgendadosFile();
  const idx = list.findIndex((x) => x.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  await writeFile(AGENDADOS_PATH, JSON.stringify(list, null, 2), "utf-8");
  return true;
}

async function deleteFromDb(id: string): Promise<boolean> {
  await ensureTables();
  const pool = getPool();
  const res = await pool.query("DELETE FROM postador_agendados WHERE id = $1", [id]);
  return (res.rowCount ?? 0) > 0;
}

export async function deleteAgendado(id: string): Promise<boolean> {
  if (isDbConfigured()) return deleteFromDb(id);
  return deleteFromFile(id);
}

export async function updateAgendadoStatus(id: string, status: string): Promise<void> {
  if (!isDbConfigured()) return;
  await ensureTables();
  const pool = getPool();
  await pool.query("UPDATE postador_agendados SET status = $1 WHERE id = $2", [status, id]);
}

export async function listAgendadosPendentesParaPostar(): Promise<AgendadoItem[]> {
  if (!isDbConfigured()) return [];
  await ensureTables();
  const pool = getPool();
  const res = await pool.query<{
    id: string;
    caption: string;
    media_url: string | null;
    media_urls: string[] | null;
    media_type: string;
    data_agendamento: string | null;
    conta_id: string | null;
    status: string;
    created_at: string;
  }>(
    "SELECT id, caption, media_url, media_urls, media_type, data_agendamento::text, conta_id, status, created_at::text FROM postador_agendados WHERE status = 'pendente' AND data_agendamento IS NOT NULL AND data_agendamento::timestamptz <= now() ORDER BY data_agendamento ASC"
  );
  return res.rows.map((r) => ({
    id: r.id,
    caption: r.caption,
    media_url: r.media_url ?? null,
    media_urls: Array.isArray(r.media_urls) ? r.media_urls : null,
    media_type: r.media_type as "IMAGE" | "REELS" | "CAROUSEL",
    data_agendamento: typeof r.data_agendamento === "string" ? r.data_agendamento : new Date(r.data_agendamento as unknown as Date).toISOString(),
    conta_id: r.conta_id,
    status: r.status,
    created_at: typeof r.created_at === "string" ? r.created_at : new Date(r.created_at as unknown as Date).toISOString(),
  }));
}
