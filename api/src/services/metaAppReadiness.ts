import { getMetaOAuthEnv, getMetaOAuthMode, isMetaOAuthConfigured } from "./metaOAuth.js";

const PERMISSOES_CRITICAS_FACEBOOK = [
  "public_profile",
  "pages_show_list",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_comments",
  "instagram_manage_messages",
  "business_management",
] as const;

const PERMISSOES_CRITICAS_INSTAGRAM = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
] as const;

type GraphPermissionRow = {
  permission?: string;
  status?: string;
  access_level?: string;
};

export type MetaReadinessReport = {
  configured: boolean;
  app_id: string | null;
  oauth_mode: "facebook" | "instagram";
  redirect_uri: string | null;
  painel_public_url: string | null;
  /** true só quando permissões críticas têm Advanced Access aprovado (clientes reais). */
  pronto_para_clientes: boolean;
  bloqueios: string[];
  avisos: string[];
  permissoes: Array<{ permission: string; status: string; access_level: string }>;
  links: {
    app_dashboard: string;
    app_review: string;
    business_verification: string;
    facebook_login: string;
    publish: string;
  };
  proximos_passos: string[];
  /** Explica que env vars ≠ clientes em produção */
  nota_producao: string;
};

function appAccessToken(appId: string, appSecret: string): string {
  return `${appId}|${appSecret}`;
}

function isAdvanced(row: GraphPermissionRow): boolean {
  return (row.access_level ?? "").toLowerCase() === "advanced";
}

async function fetchAppPermissions(appId: string, appSecret: string, graphVersion: string) {
  const token = appAccessToken(appId, appSecret);
  const u = new URL(`https://graph.facebook.com/${graphVersion}/${appId}/permissions`);
  u.searchParams.set("access_token", token);
  const res = await fetch(u.toString());
  const json = (await res.json()) as { data?: GraphPermissionRow[]; error?: { message?: string } };
  if (!res.ok || json.error) {
    throw new Error(json.error?.message ?? `Graph permissions HTTP ${res.status}`);
  }
  return json.data ?? [];
}

export async function buildMetaReadinessReport(): Promise<MetaReadinessReport> {
  const oauthMode = getMetaOAuthMode();
  const env = getMetaOAuthEnv();
  const painel = process.env.PAINEL_PUBLIC_URL?.trim().replace(/\/$/, "") || null;
  const appId = env?.appId ?? null;

  const links = {
    app_dashboard: appId ? `https://developers.facebook.com/apps/${appId}/dashboard/` : "https://developers.facebook.com/apps/",
    app_review: appId ? `https://developers.facebook.com/apps/${appId}/app-review/permissions/` : "https://developers.facebook.com/",
    business_verification: appId
      ? `https://developers.facebook.com/apps/${appId}/settings/business-verification/`
      : "https://developers.facebook.com/",
    facebook_login: appId
      ? `https://developers.facebook.com/apps/${appId}/facebook-login/settings/`
      : "https://developers.facebook.com/",
    publish: appId ? `https://developers.facebook.com/apps/${appId}/publish/` : "https://developers.facebook.com/",
  };

  const bloqueios: string[] = [];
  const avisos: string[] = [];
  const proximos_passos: string[] = [];

  const notaProducao =
    "OAuth «Conectar Meta» num app central só escala com Verificação comercial (CNPJ) da dona do app. Sem CNPJ: use Administração → Nova conta → token + ig_user_id manual (docs/META-SEM-CNPJ-FABRIAIA.md).";

  if (!isMetaOAuthConfigured() || !env || !appId) {
    bloqueios.push("OAuth Meta não configurado na API (META_APP_ID, META_APP_SECRET, META_OAUTH_REDIRECT_URI).");
    return {
      configured: false,
      app_id: appId,
      oauth_mode: oauthMode,
      redirect_uri: env?.redirectUri ?? null,
      painel_public_url: painel,
      pronto_para_clientes: false,
      bloqueios,
      avisos,
      permissoes: [],
      links,
      proximos_passos: ["Preencha as variáveis META_* na API e reinicie o serviço."],
      nota_producao: notaProducao,
    };
  }

  if (!painel) {
    avisos.push("PAINEL_PUBLIC_URL não definido — após o login Meta o redirect pode falhar.");
  }

  if (painel && !painel.startsWith("https://")) {
    avisos.push("PAINEL_PUBLIC_URL deve ser HTTPS em produção.");
  }

  const privacyUrl = painel ? `${painel}/politica-de-privacidade.html` : null;
  if (!privacyUrl) {
    bloqueios.push("Defina PAINEL_PUBLIC_URL e publique a política de privacidade (…/politica-de-privacidade.html).");
  } else {
    proximos_passos.push(`No Meta → Configurações → Básico: URL de política de privacidade = ${privacyUrl}`);
  }

  proximos_passos.push(
    "SEM CNPJ FabriaIA: ignore OAuth para clientes — Administração → Nova conta → cole ig_user_id + token (ver docs/META-SEM-CNPJ-FABRIAIA.md).",
    "COM CNPJ: Meta → Verificação comercial → Revisão do app (Advanced Access) → modo Ao vivo.",
    "Meta → Painel inicial: resolver «Ações necessárias» se houver banner."
  );

  let permissoes: MetaReadinessReport["permissoes"] = [];
  try {
    const rows = await fetchAppPermissions(appId, env.appSecret, env.graphVersion);
    permissoes = rows.map((r) => ({
      permission: r.permission ?? "?",
      status: r.status ?? "desconhecido",
      access_level: r.access_level ?? "standard",
    }));

    const byName = new Map(permissoes.map((p) => [p.permission, p]));
    const critical =
      oauthMode === "instagram" ? PERMISSOES_CRITICAS_INSTAGRAM : PERMISSOES_CRITICAS_FACEBOOK;

    const faltandoAdvanced = critical.filter((name) => {
      const row = byName.get(name);
      if (!row) return true;
      return !isAdvanced(row);
    });

    if (faltandoAdvanced.length > 0) {
      bloqueios.push(
        `Permissões ainda sem Advanced Access (clientes bloqueados): ${faltandoAdvanced.join(", ")}.`
      );
    }

    const publicProfile = byName.get("public_profile");
    if (oauthMode === "facebook" && publicProfile && !isAdvanced(publicProfile)) {
      bloqueios.push(
        "public_profile só tem Standard Access — causa exata do erro «Login indisponível» para quem não é testador."
      );
    }
  } catch (err) {
    avisos.push(
      `Não foi possível ler permissões do app na Graph API: ${err instanceof Error ? err.message : "erro"}. Confira META_APP_ID e META_APP_SECRET.`
    );
  }

  const pronto_para_clientes = bloqueios.length === 0;

  return {
    configured: true,
    app_id: appId,
    oauth_mode: oauthMode,
    redirect_uri: env.redirectUri,
    painel_public_url: painel,
    pronto_para_clientes,
    bloqueios,
    avisos,
    permissoes,
    links,
    proximos_passos,
    nota_producao: notaProducao,
  };
}
