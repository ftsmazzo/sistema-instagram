import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { isDbConfigured, getPool, ensureTables } from "../db/index.js";

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), "data");
const CRONOGRAMA_PATH = join(DATA_DIR, "cronograma.json");

export type CronogramaItem = {
  id: string;
  caption: string;
  media_url: string | null;
  media_type: "IMAGE" | "REELS" | "CAROUSEL" | null;
  id_container: string | null;
  link_post: string | null;
  data_post: string;
  created_at: string;
};

async function ensureCronogramaFile(): Promise<CronogramaItem[]> {
  try {
    const raw = await readFile(CRONOGRAMA_PATH, "utf-8");
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function listFromFile(): Promise<CronogramaItem[]> {
  const list = await ensureCronogramaFile();
  return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

async function listFromDb(): Promise<CronogramaItem[]> {
  await ensureTables();
  const pool = getPool();
  const res = await pool.query<CronogramaItem>(
    "SELECT id, caption, media_url, media_type, id_container, link_post, data_post, created_at::text FROM postador_cronograma ORDER BY created_at DESC"
  );
  return res.rows.map((r) => ({
    id: r.id,
    caption: r.caption,
    media_url: r.media_url ?? null,
    media_type: r.media_type as "IMAGE" | "REELS" | "CAROUSEL" | null,
    id_container: r.id_container ?? null,
    link_post: r.link_post ?? null,
    data_post: r.data_post,
    created_at: typeof r.created_at === "string" ? r.created_at : new Date(r.created_at as Date).toISOString(),
  }));
}

export async function listCronograma(): Promise<CronogramaItem[]> {
  if (isDbConfigured()) return listFromDb();
  return listFromFile();
}

async function appendToFile(item: Omit<CronogramaItem, "id" | "created_at">): Promise<CronogramaItem> {
  await mkdir(DATA_DIR, { recursive: true });
  const list = await ensureCronogramaFile();
  const created_at = new Date().toISOString();
  const id = `post-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const full: CronogramaItem = {
    id,
    caption: item.caption,
    media_url: item.media_url ?? null,
    media_type: item.media_type ?? null,
    id_container: item.id_container ?? null,
    link_post: item.link_post ?? null,
    data_post: item.data_post,
    created_at,
  };
  list.unshift(full);
  await writeFile(CRONOGRAMA_PATH, JSON.stringify(list, null, 2), "utf-8");
  return full;
}

async function appendToDb(item: Omit<CronogramaItem, "id" | "created_at">): Promise<CronogramaItem> {
  await ensureTables();
  const pool = getPool();
  const id = `post-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const created_at = new Date().toISOString();
  await pool.query(
    `INSERT INTO postador_cronograma (id, caption, media_url, media_type, id_container, link_post, data_post, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      item.caption,
      item.media_url ?? null,
      item.media_type ?? null,
      item.id_container ?? null,
      item.link_post ?? null,
      item.data_post,
      created_at,
    ]
  );
  return {
    id,
    caption: item.caption,
    media_url: item.media_url ?? null,
    media_type: item.media_type ?? null,
    id_container: item.id_container ?? null,
    link_post: item.link_post ?? null,
    data_post: item.data_post,
    created_at,
  };
}

export async function appendCronograma(item: Omit<CronogramaItem, "id" | "created_at">): Promise<CronogramaItem> {
  if (isDbConfigured()) return appendToDb(item);
  return appendToFile(item);
}

export async function deleteCronograma(id: string): Promise<boolean> {
  if (isDbConfigured()) {
    await ensureTables();
    const pool = getPool();
    const res = await pool.query("DELETE FROM postador_cronograma WHERE id = $1", [id]);
    return (res.rowCount ?? 0) > 0;
  } else {
    const list = await ensureCronogramaFile();
    const filtered = list.filter((i) => i.id !== id);
    if (list.length === filtered.length) return false;
    await writeFile(CRONOGRAMA_PATH, JSON.stringify(filtered, null, 2), "utf-8");
    return true;
  }
}
