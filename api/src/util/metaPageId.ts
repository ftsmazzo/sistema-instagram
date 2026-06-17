const DEFAULT_GRAPH_BASE =
  process.env.META_GRAPH_API_BASE?.trim() || "https://graph.facebook.com/v21.0";

type GraphError = { message?: string; code?: number };
type MeAccountsResponse = {
  data?: Array<{
    id?: string;
    instagram_business_account?: { id?: string };
  }>;
  error?: GraphError;
};
type MeResponse = { id?: string; error?: GraphError };

/**
 * Resolve o ID da Página Facebook para POST /{page_id}/messages.
 * Prioriza página cujo instagram_business_account.id bate com igUserId.
 */
export async function resolveFacebookPageId(
  accessToken: string,
  options?: { graphBase?: string; igUserId?: string }
): Promise<string | null> {
  const token = accessToken.trim();
  if (!token) return null;

  const base = (options?.graphBase || DEFAULT_GRAPH_BASE).replace(/\/$/, "");
  const igTarget = options?.igUserId?.trim() || null;

  const fromAccounts = await fetchPageIdFromAccounts(token, base, igTarget);
  if (fromAccounts) return fromAccounts;

  const fromMe = await fetchPageIdFromMe(token, base);
  if (!fromMe) return null;

  if (igTarget) {
    const linked = await pageHasInstagramAccount(fromMe, igTarget, token, base);
    return linked ? fromMe : null;
  }

  return fromMe;
}

async function fetchPageIdFromAccounts(
  token: string,
  base: string,
  igTarget: string | null
): Promise<string | null> {
  try {
    const u = new URL(`${base}/me/accounts`);
    u.searchParams.set("fields", "id,instagram_business_account{id}");
    u.searchParams.set("access_token", token);
    const res = await fetch(u.toString());
    const json = (await res.json()) as MeAccountsResponse;
    if (!res.ok || json.error || !json.data?.length) return null;

    if (igTarget) {
      const match = json.data.find((p) => p.instagram_business_account?.id?.trim() === igTarget);
      if (match?.id?.trim()) return match.id.trim();
    }

    const firstWithIg = json.data.find((p) => p.instagram_business_account?.id?.trim());
    if (firstWithIg?.id?.trim()) return firstWithIg.id.trim();

    const first = json.data[0]?.id?.trim();
    return first || null;
  } catch {
    return null;
  }
}

async function fetchPageIdFromMe(token: string, base: string): Promise<string | null> {
  try {
    const u = new URL(`${base}/me`);
    u.searchParams.set("fields", "id");
    u.searchParams.set("access_token", token);
    const res = await fetch(u.toString());
    const json = (await res.json()) as MeResponse;
    if (!res.ok || json.error || !json.id?.trim()) return null;
    return json.id.trim();
  } catch {
    return null;
  }
}

async function pageHasInstagramAccount(
  pageId: string,
  igUserId: string,
  token: string,
  base: string
): Promise<boolean> {
  try {
    const u = new URL(`${base}/${pageId}`);
    u.searchParams.set("fields", "instagram_business_account{id}");
    u.searchParams.set("access_token", token);
    const res = await fetch(u.toString());
    const json = (await res.json()) as {
      instagram_business_account?: { id?: string };
      error?: GraphError;
    };
    if (!res.ok || json.error) return false;
    return json.instagram_business_account?.id?.trim() === igUserId;
  } catch {
    return false;
  }
}
