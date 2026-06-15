import crypto from "crypto";

const GRAPH_DEFAULT = "v21.0";

/** `instagram` = fluxo instagram.com/oauth/authorize (login da empresa Instagram no Dev Console). `facebook` = dialog do Facebook + /me/accounts. */
export function getMetaOAuthMode(): "facebook" | "instagram" {
  const m = (process.env.META_OAUTH_MODE ?? "facebook").trim().toLowerCase();
  return m === "instagram" ? "instagram" : "facebook";
}

export type MetaOAuthEnv = {
  appId: string;
  /** client_id no OAuth Instagram; por defeito = META_APP_ID. Se a Meta mostrar outro ID no produto Instagram, use META_INSTAGRAM_CLIENT_ID. */
  instagramClientId: string;
  appSecret: string;
  redirectUri: string;
  graphVersion: string;
  scopes: string;
  stateSecret: string;
};

export function getMetaOAuthEnv(): MetaOAuthEnv | null {
  const appId = process.env.META_APP_ID?.trim() ?? "";
  const appSecret = process.env.META_APP_SECRET?.trim() ?? "";
  const redirectUri = process.env.META_OAUTH_REDIRECT_URI?.trim() ?? "";
  if (!appId || !appSecret || !redirectUri) return null;
  let graphVersion = process.env.META_GRAPH_VERSION?.trim() || GRAPH_DEFAULT;
  if (!graphVersion.startsWith("v")) graphVersion = `v${graphVersion}`;
  const mode = getMetaOAuthMode();
  const scopes =
    process.env.META_OAUTH_SCOPES?.trim() ||
    (mode === "instagram"
      ? [
          "instagram_business_basic",
          "instagram_business_manage_messages",
          "instagram_business_manage_comments",
          "instagram_business_content_publish",
        ].join(",")
      : [
          "pages_show_list",
          "pages_read_engagement",
          "instagram_basic",
          "instagram_content_publish",
          "instagram_manage_comments",
          "instagram_manage_messages",
          "business_management",
        ].join(","));
  const stateSecret = process.env.META_OAUTH_STATE_SECRET?.trim() || process.env.JWT_SECRET?.trim() || "dev-meta-state";
  const instagramClientId = process.env.META_INSTAGRAM_CLIENT_ID?.trim() || appId;
  return { appId, instagramClientId, appSecret, redirectUri, graphVersion, scopes, stateSecret };
}

export function isMetaOAuthConfigured(): boolean {
  return getMetaOAuthEnv() !== null;
}

type StatePayload = { orgId: string; sub: string; exp: number };

const STATE_TTL_MS = 20 * 60 * 1000;

export function signMetaOAuthState(orgId: string, sub: string, secret: string): string {
  const exp = Date.now() + STATE_TTL_MS;
  const payload: StatePayload = { orgId, sub, exp };
  const data = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyMetaOAuthState(state: string, secret: string): StatePayload | null {
  const i = state.lastIndexOf(".");
  if (i <= 0) return null;
  const data = state.slice(0, i);
  const sig = state.slice(i + 1);
  const expected = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  try {
    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as StatePayload;
    if (typeof parsed.orgId !== "string" || typeof parsed.sub !== "string" || typeof parsed.exp !== "number") return null;
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildFacebookAuthorizeUrl(env: MetaOAuthEnv, state: string): string {
  const u = new URL(`https://www.facebook.com/${env.graphVersion}/dialog/oauth`);
  u.searchParams.set("client_id", env.appId);
  u.searchParams.set("redirect_uri", env.redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", env.scopes);
  return u.toString();
}

/** Mesmo fluxo da URL incorporada no passo "login da empresa" do Instagram no Dev Console. */
export function buildInstagramAuthorizeUrl(env: MetaOAuthEnv, state: string): string {
  const u = new URL("https://www.instagram.com/oauth/authorize");
  u.searchParams.set("client_id", env.instagramClientId);
  u.searchParams.set("redirect_uri", env.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", env.scopes);
  u.searchParams.set("state", state);
  u.searchParams.set("force_reauth", "true");
  return u.toString();
}

export function buildMetaAuthorizeUrl(env: MetaOAuthEnv, state: string): string {
  return getMetaOAuthMode() === "instagram" ? buildInstagramAuthorizeUrl(env, state) : buildFacebookAuthorizeUrl(env, state);
}

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const u = new URL(`https://graph.facebook.com/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u.toString(), { method: "GET" });
  const json = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok || (json as { error?: unknown }).error) {
    const msg = (json as { error?: { message?: string } }).error?.message ?? `Graph HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

/** Troca code por token de usuário (curta duração) e depois por longa duração. */
export async function exchangeCodeForLongLivedUserToken(
  env: MetaOAuthEnv,
  code: string
): Promise<{ access_token: string }> {
  const short = await graphGet<{ access_token: string }>(`${env.graphVersion}/oauth/access_token`, {
    client_id: env.appId,
    client_secret: env.appSecret,
    redirect_uri: env.redirectUri,
    code,
  });

  const long = await graphGet<{ access_token: string }>(`${env.graphVersion}/oauth/access_token`, {
    grant_type: "fb_exchange_token",
    client_id: env.appId,
    client_secret: env.appSecret,
    fb_exchange_token: short.access_token,
  });
  return long;
}

export type PageWithInstagram = {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; username?: string; name?: string };
};

export async function fetchPagesWithInstagram(env: MetaOAuthEnv, userAccessToken: string): Promise<PageWithInstagram[]> {
  const fields = "id,name,access_token,instagram_business_account{id,username,name}";
  const json = await graphGet<{ data?: PageWithInstagram[] }>(`${env.graphVersion}/me/accounts`, {
    fields,
    access_token: userAccessToken,
  });
  return json.data ?? [];
}

/** Troca o code do Instagram Business Login por token longo (graph.instagram.com). */
export async function exchangeInstagramCodeForLongLivedToken(
  env: MetaOAuthEnv,
  code: string
): Promise<{ access_token: string }> {
  const body = new URLSearchParams({
    client_id: env.instagramClientId,
    client_secret: env.appSecret,
    grant_type: "authorization_code",
    redirect_uri: env.redirectUri,
    code,
  });
  const res = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = (await res.json()) as {
    access_token?: string;
    error_type?: string;
    error_message?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_message || json.error_type || `Instagram token HTTP ${res.status}`);
  }

  const longUrl = new URL("https://graph.instagram.com/access_token");
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", env.appSecret);
  longUrl.searchParams.set("access_token", json.access_token);
  const longRes = await fetch(longUrl.toString());
  const longJson = (await longRes.json()) as { access_token?: string; error?: { message?: string } };
  if (!longRes.ok || !longJson.access_token) {
    throw new Error(longJson.error?.message || `Instagram long-lived HTTP ${longRes.status}`);
  }
  return { access_token: longJson.access_token };
}

export async function fetchInstagramBusinessMe(
  env: MetaOAuthEnv,
  accessToken: string
): Promise<{ id: string; username?: string }> {
  const u = new URL(`https://graph.instagram.com/${env.graphVersion}/me`);
  u.searchParams.set("fields", "id,username");
  u.searchParams.set("access_token", accessToken);
  const res = await fetch(u.toString());
  const json = (await res.json()) as { id?: string; username?: string; error?: { message?: string } };
  if (!res.ok || !json.id) {
    throw new Error(json.error?.message || `Instagram /me HTTP ${res.status}`);
  }
  return { id: json.id, username: json.username };
}

/** Converte o resultado do login Instagram em formato compatível com merge no workspace. */
export function pagesFromInstagramDirectAuth(
  accessToken: string,
  me: { id: string; username?: string }
): PageWithInstagram[] {
  return [
    {
      id: me.id,
      name: me.username ? `@${me.username}` : "Instagram",
      access_token: accessToken,
      instagram_business_account: { id: me.id, username: me.username },
    },
  ];
}
