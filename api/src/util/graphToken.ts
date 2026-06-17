/**
 * Normaliza token Graph colado no painel (remove Bearer, JSON, URL, quebras de linha).
 */
export function normalizeGraphAccessToken(raw: string | null | undefined): string {
  let t = (raw ?? "").trim();
  if (!t) return "";

  if (/^bearer\s+/i.test(t)) {
    t = t.replace(/^bearer\s+/i, "").trim();
  }

  if (t.startsWith("{")) {
    try {
      const parsed = JSON.parse(t) as { access_token?: string };
      if (typeof parsed.access_token === "string" && parsed.access_token.trim()) {
        t = parsed.access_token.trim();
      }
    } catch {
      /* mantém string original */
    }
  }

  const fromQuery = t.match(/(?:^|[?&])access_token=([^&\s"'<>]+)/i);
  if (fromQuery?.[1]) {
    try {
      t = decodeURIComponent(fromQuery[1]);
    } catch {
      t = fromQuery[1];
    }
  }

  t = t.replace(/^["']+|["']+$/g, "");
  t = t.replace(/\s+/g, "");

  return t;
}

/** Tokens Meta costumam ser longos e alfanuméricos (EAA…, IGQV…). */
export function isPlausibleGraphToken(token: string): boolean {
  const t = token.trim();
  if (t.length < 30) return false;
  return /^[A-Za-z0-9_|.-]+$/.test(t);
}

export function resolveInstagramGraphToken(
  accessToken: string | null | undefined,
  agentAccessToken: string | null | undefined
): string {
  const primary = normalizeGraphAccessToken(accessToken);
  const agent = normalizeGraphAccessToken(agentAccessToken);
  return primary || agent;
}

/** Token Instagram Login (IGAA / IGQV) — host graph.instagram.com, não graph.facebook.com. */
export function isInstagramLoginToken(token: string | null | undefined): boolean {
  const t = normalizeGraphAccessToken(token ?? "");
  return /^(IGAA|IGQV)/i.test(t);
}

/** Token Facebook / Página (EAA…) — host graph.facebook.com. */
export function isFacebookGraphToken(token: string | null | undefined): boolean {
  const t = normalizeGraphAccessToken(token ?? "");
  return /^EAA/i.test(t);
}

/** Escolhe graph.facebook.com ou graph.instagram.com conforme o prefixo do token. */
export function resolveGraphApiBaseForToken(
  token: string | null | undefined,
  version = (process.env.AGENT_GRAPH_API_VERSION ?? "v24.0").replace(/^v?/, "v")
): string {
  if (isInstagramLoginToken(token)) {
    return (
      process.env.AGENT_INSTAGRAM_GRAPH_API_BASE?.trim() ||
      `https://graph.instagram.com/${version}`
    );
  }
  return (
    process.env.AGENT_GRAPH_API_BASE?.trim() ||
    `https://graph.facebook.com/${version}`
  );
}
