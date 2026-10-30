export type IgConfig = {
  igUserId: string;
  accessToken: string;
  facebookPageId: string | null;
  graphVersion: string;
};

function normalizeToken(raw: string): string {
  let t = raw.trim();
  if (/^bearer\s+/i.test(t)) t = t.replace(/^bearer\s+/i, "").trim();
  if (t.startsWith("{")) {
    try {
      const parsed = JSON.parse(t) as { access_token?: string };
      if (parsed.access_token?.trim()) t = parsed.access_token.trim();
    } catch {
      /* keep */
    }
  }
  return t.replace(/\s+/g, "");
}

export function loadConfig(): IgConfig {
  const igUserId = (process.env.IG_USER_ID ?? "").trim();
  const accessToken = normalizeToken(process.env.INSTAGRAM_ACCESS_TOKEN ?? "");
  const facebookPageId = (process.env.FACEBOOK_PAGE_ID ?? "").trim() || null;
  const graphVersion = (process.env.META_GRAPH_VERSION ?? "v24.0").replace(/^v?/, "v");

  if (!igUserId || !accessToken) {
    throw new Error(
      "Defina IG_USER_ID e INSTAGRAM_ACCESS_TOKEN no ambiente do MCP (Claude Desktop / Cursor mcp.json)."
    );
  }

  return { igUserId, accessToken, facebookPageId, graphVersion };
}

/** Instagram Login tokens → graph.instagram.com; EAA → graph.facebook.com */
export function graphBase(token: string, version: string): string {
  if (/^(IGAA|IGQV)/i.test(token)) {
    return `https://graph.instagram.com/${version}`;
  }
  return `https://graph.facebook.com/${version}`;
}
