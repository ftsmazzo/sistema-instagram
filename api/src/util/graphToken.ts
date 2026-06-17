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
