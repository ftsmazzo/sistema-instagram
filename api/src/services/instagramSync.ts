import { AGENT_GRAPH_API_BASE } from "./agentConfigDefaults.js";

export type InstagramMediaItem = {
  id: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
};

type GraphMediaResponse = {
  data?: InstagramMediaItem[];
  paging?: { cursors?: { after?: string }; next?: string };
  error?: { message?: string; code?: number };
};

type GraphSingleMediaResponse = InstagramMediaItem & {
  error?: { message?: string; code?: number };
};

const MEDIA_FIELDS = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp";

function graphUrl(path: string, token: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${AGENT_GRAPH_API_BASE}${path}${sep}access_token=${encodeURIComponent(token)}`;
}

export async function fetchInstagramMediaPage(
  igUserId: string,
  token: string,
  after?: string | null
): Promise<{ items: InstagramMediaItem[]; nextAfter: string | null }> {
  const igId = igUserId.trim();
  const accessToken = token.trim();
  if (!igId || !accessToken) {
    throw new Error("Conta Instagram sem ig_user_id ou token configurado.");
  }

  const params = new URLSearchParams({ fields: MEDIA_FIELDS, limit: "25" });
  if (after?.trim()) params.set("after", after.trim());

  const res = await fetch(graphUrl(`/${igId}/media?${params.toString()}`, accessToken));
  const json = (await res.json()) as GraphMediaResponse;

  if (json.error?.message) {
    throw new Error(json.error.message);
  }
  if (!res.ok) {
    throw new Error(`Graph API retornou HTTP ${res.status}`);
  }

  return {
    items: json.data ?? [],
    nextAfter: json.paging?.cursors?.after ?? null,
  };
}

export async function fetchInstagramMediaById(mediaId: string, token: string): Promise<InstagramMediaItem | null> {
  const id = mediaId.trim();
  const accessToken = token.trim();
  if (!id || !accessToken) return null;

  const res = await fetch(graphUrl(`/${id}?fields=${MEDIA_FIELDS}`, accessToken));
  const json = (await res.json()) as GraphSingleMediaResponse;

  if (json.error?.message || !json.id) return null;
  return json;
}

export async function fetchAllInstagramMedia(
  igUserId: string,
  token: string,
  maxItems = 50
): Promise<InstagramMediaItem[]> {
  const cap = Math.min(Math.max(maxItems, 1), 100);
  const all: InstagramMediaItem[] = [];
  let after: string | null = null;

  while (all.length < cap) {
    const page = await fetchInstagramMediaPage(igUserId, token, after);
    if (!page.items.length) break;
    all.push(...page.items);
    if (!page.nextAfter || all.length >= cap) break;
    after = page.nextAfter;
  }

  return all.slice(0, cap);
}

export function resolveMediaPreviewUrl(item: InstagramMediaItem): string | null {
  return item.media_url?.trim() || item.thumbnail_url?.trim() || null;
}
