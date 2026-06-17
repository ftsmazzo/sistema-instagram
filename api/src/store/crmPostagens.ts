import { getPool, ensureTables, isDbConfigured } from "../db/index.js";
import {
  fetchAllInstagramMedia,
  fetchInstagramMediaById,
  resolveMediaPreviewUrl,
  type InstagramMediaItem,
} from "../services/instagramSync.js";

function hashtagsFromCaption(caption: string): string | null {
  const tags = caption.match(/#[^\s#]+/g);
  if (!tags?.length) return null;
  return [...new Set(tags.map((t) => t.slice(1)))].join(", ");
}

function mencoesFromCaption(caption: string): string | null {
  const m = caption.match(/@[^\s@]+/g);
  if (!m?.length) return null;
  return [...new Set(m.map((x) => x.slice(1)))].join(", ");
}

export type UpsertPostagemFromPostadorParams = {
  organizationId: string;
  instagramAccountId: string;
  idPost: string;
  caption: string;
  mediaType: string | null;
  mediaUrl: string | null;
  linkPost: string | null;
  dataPost: string;
};

export type PostagemListItem = {
  id: number;
  id_post: string;
  caption_post: string | null;
  media_type: string | null;
  media_url: string | null;
  link_post: string | null;
  data_post: string | null;
  instagram_account_id: string | null;
  comentarios_count: number;
  leads_count: number;
  created_at: string;
  updated_at: string;
};

export type InstagramAccountForSync = {
  id: string;
  nome: string;
  ig_user_id: string;
  access_token: string;
  agent_access_token: string;
};

function resolveToken(account: InstagramAccountForSync): string {
  return (account.agent_access_token || account.access_token || "").trim();
}

async function upsertPostagemRow(params: {
  organizationId: string;
  instagramAccountId: string;
  idPost: string;
  caption: string;
  mediaType: string | null;
  mediaUrl: string | null;
  linkPost: string | null;
  dataPost: string | null;
}): Promise<void> {
  const pool = getPool();
  const hashtags = hashtagsFromCaption(params.caption);
  const mencoes = mencoesFromCaption(params.caption);
  await pool.query(
    `INSERT INTO postagens (
      organization_id, instagram_account_id, id_post, caption_post, media_type, media_url, link_post, data_post,
      hashtags, mencoes, processado, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9, $10, false, NOW())
    ON CONFLICT (organization_id, id_post) DO UPDATE SET
      caption_post = EXCLUDED.caption_post,
      media_type = EXCLUDED.media_type,
      media_url = EXCLUDED.media_url,
      link_post = EXCLUDED.link_post,
      data_post = EXCLUDED.data_post,
      hashtags = EXCLUDED.hashtags,
      mencoes = EXCLUDED.mencoes,
      instagram_account_id = COALESCE(EXCLUDED.instagram_account_id, postagens.instagram_account_id),
      updated_at = NOW()`,
    [
      params.organizationId,
      params.instagramAccountId,
      params.idPost,
      params.caption,
      params.mediaType,
      params.mediaUrl,
      params.linkPost,
      params.dataPost,
      hashtags,
      mencoes,
    ]
  );
}

function mediaToUpsertParams(
  organizationId: string,
  instagramAccountId: string,
  item: InstagramMediaItem
): Parameters<typeof upsertPostagemRow>[0] {
  return {
    organizationId,
    instagramAccountId,
    idPost: item.id,
    caption: item.caption?.trim() ?? "",
    mediaType: item.media_type?.trim() ?? null,
    mediaUrl: resolveMediaPreviewUrl(item),
    linkPost: item.permalink?.trim() ?? null,
    dataPost: item.timestamp?.trim() ?? null,
  };
}

/**
 * Grava/atualiza linha em `postagens` (CRM) após publicação pelo Postador.
 * `id_post` = id da mídia publicada no Graph (mesmo usado em webhooks).
 */
export async function upsertPostagemFromPostador(params: UpsertPostagemFromPostadorParams): Promise<void> {
  if (!isDbConfigured()) return;
  await ensureTables();
  await upsertPostagemRow({
    organizationId: params.organizationId,
    instagramAccountId: params.instagramAccountId,
    idPost: params.idPost,
    caption: params.caption,
    mediaType: params.mediaType,
    mediaUrl: params.mediaUrl,
    linkPost: params.linkPost,
    dataPost: params.dataPost,
  });
}

export async function getInstagramAccountForSync(
  organizationId: string,
  instagramAccountId?: string | null
): Promise<InstagramAccountForSync | null> {
  if (!isDbConfigured()) return null;
  await ensureTables();
  const pool = getPool();

  if (instagramAccountId?.trim()) {
    const r = await pool.query<InstagramAccountForSync>(
      `SELECT id, nome, ig_user_id,
              COALESCE(access_token, '') AS access_token,
              COALESCE(agent_access_token, '') AS agent_access_token
       FROM instagram_accounts
       WHERE organization_id = $1::uuid AND id = $2
       LIMIT 1`,
      [organizationId, instagramAccountId.trim()]
    );
    return r.rows[0] ?? null;
  }

  const r = await pool.query<InstagramAccountForSync>(
    `SELECT id, nome, ig_user_id,
            COALESCE(access_token, '') AS access_token,
            COALESCE(agent_access_token, '') AS agent_access_token
     FROM instagram_accounts
     WHERE organization_id = $1::uuid
     ORDER BY created_at ASC
     LIMIT 1`,
    [organizationId]
  );
  return r.rows[0] ?? null;
}

export async function syncPostagensFromInstagram(params: {
  organizationId: string;
  instagramAccountId?: string | null;
  limit?: number;
}): Promise<{ synced: number; total_fetched: number; account_id: string; account_nome: string }> {
  if (!isDbConfigured()) {
    throw new Error("Banco não configurado.");
  }
  await ensureTables();

  const account = await getInstagramAccountForSync(params.organizationId, params.instagramAccountId);
  if (!account) {
    throw new Error("Nenhuma conta Instagram cadastrada. Configure em Administração.");
  }

  const token = resolveToken(account);
  if (!token) {
    throw new Error("Conta sem token Graph API. Cadastre o token em Administração → Contas Instagram.");
  }
  if (!account.ig_user_id?.trim()) {
    throw new Error("Conta sem ig_user_id configurado.");
  }

  const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
  const items = await fetchAllInstagramMedia(account.ig_user_id, token, limit);

  for (const item of items) {
    await upsertPostagemRow(mediaToUpsertParams(params.organizationId, account.id, item));
  }

  return {
    synced: items.length,
    total_fetched: items.length,
    account_id: account.id,
    account_nome: account.nome || account.ig_user_id,
  };
}

export async function ensurePostagemFromInstagram(params: {
  organizationId: string;
  igUserId: string;
  mediaId: string;
}): Promise<{ created: boolean; id_post: string } | null> {
  if (!isDbConfigured()) return null;
  await ensureTables();
  const pool = getPool();

  const existing = await pool.query<{ id_post: string }>(
    `SELECT id_post FROM postagens WHERE organization_id = $1::uuid AND id_post = $2 LIMIT 1`,
    [params.organizationId, params.mediaId]
  );
  if (existing.rows[0]) {
    return { created: false, id_post: existing.rows[0].id_post };
  }

  const acc = await pool.query<InstagramAccountForSync>(
    `SELECT id, nome, ig_user_id,
            COALESCE(access_token, '') AS access_token,
            COALESCE(agent_access_token, '') AS agent_access_token
     FROM instagram_accounts
     WHERE organization_id = $1::uuid AND ig_user_id = $2
     LIMIT 1`,
    [params.organizationId, params.igUserId.trim()]
  );
  const account = acc.rows[0];
  if (!account) return null;

  const token = resolveToken(account);
  if (!token) return null;

  const item = await fetchInstagramMediaById(params.mediaId, token);
  if (!item?.id) return null;

  await upsertPostagemRow(mediaToUpsertParams(params.organizationId, account.id, item));
  return { created: true, id_post: item.id };
}

/** Busca org pela conta IG e garante post no CRM (webhook lazy sync). */
export async function ensurePostagemByIgUser(
  igUserId: string,
  mediaId: string
): Promise<{ created: boolean; id_post: string; organization_id: string } | null> {
  if (!isDbConfigured()) return null;
  await ensureTables();
  const pool = getPool();

  const acc = await pool.query<{ organization_id: string }>(
    `SELECT organization_id::text FROM instagram_accounts WHERE ig_user_id = $1 LIMIT 1`,
    [igUserId.trim()]
  );
  const orgId = acc.rows[0]?.organization_id;
  if (!orgId) return null;

  const result = await ensurePostagemFromInstagram({
    organizationId: orgId,
    igUserId,
    mediaId,
  });
  if (!result) return null;
  return { ...result, organization_id: orgId };
}

export async function listPostagens(params: {
  organizationId: string;
  limit?: number;
  offset?: number;
  instagramAccountId?: string | null;
}): Promise<{ postagens: PostagemListItem[]; total: number }> {
  if (!isDbConfigured()) return { postagens: [], total: 0 };
  await ensureTables();
  const pool = getPool();
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);

  const conditions = ["p.organization_id = $1::uuid"];
  const values: unknown[] = [params.organizationId];
  let idx = 2;

  if (params.instagramAccountId?.trim()) {
    conditions.push(`p.instagram_account_id = $${idx++}`);
    values.push(params.instagramAccountId.trim());
  }

  const where = conditions.join(" AND ");

  const countR = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM postagens p WHERE ${where}`,
    values
  );
  const total = Number(countR.rows[0]?.n ?? 0);

  values.push(limit, offset);
  const r = await pool.query(
    `SELECT p.id, p.id_post, p.caption_post, p.media_type, p.media_url, p.link_post, p.data_post,
            p.instagram_account_id, p.created_at, p.updated_at,
            (SELECT COUNT(*)::int FROM comentarios c
             WHERE c.organization_id = p.organization_id AND c.id_postagem = p.id_post) AS comentarios_count,
            (SELECT COUNT(*)::int FROM leads l
             WHERE l.organization_id = p.organization_id AND l.id_post_origem = p.id_post) AS leads_count
     FROM postagens p
     WHERE ${where}
     ORDER BY COALESCE(p.data_post, p.created_at) DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    values
  );

  const postagens: PostagemListItem[] = r.rows.map((row) => ({
    id: row.id,
    id_post: row.id_post,
    caption_post: row.caption_post,
    media_type: row.media_type,
    media_url: row.media_url,
    link_post: row.link_post,
    data_post: row.data_post ? new Date(row.data_post).toISOString() : null,
    instagram_account_id: row.instagram_account_id,
    comentarios_count: Number(row.comentarios_count ?? 0),
    leads_count: Number(row.leads_count ?? 0),
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  }));

  return { postagens, total };
}
