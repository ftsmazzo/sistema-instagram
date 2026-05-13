const getBaseUrl = (): string => {
  const url = import.meta.env.VITE_API_URL;
  if (url) return (url as string).trim().replace(/\/$/, "");
  return "http://localhost:3000";
};

const base = getBaseUrl();

export const AUTH_STORAGE_KEY = "mv_auth_token";

function emitAuthChanged(): void {
  try {
    window.dispatchEvent(new CustomEvent("mv-auth-changed"));
  } catch {
    /* ignore */
  }
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(AUTH_STORAGE_KEY, token);
    else localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  emitAuthChanged();
}

export function clearAuthToken(): void {
  setAuthToken(null);
}

type FetchOptions = Omit<RequestInit, "body"> & { body?: Record<string, unknown> };

async function fetchJson<T>(path: string, options?: FetchOptions): Promise<T> {
  const { body, ...init } = options ?? {};
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  const t = getAuthToken();
  if (t) headers["Authorization"] = `Bearer ${t}`;
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg = (errBody as { error?: string }).error ?? `API ${res.status}: ${res.statusText}`;
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

function cacheBust(url: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}_t=${Date.now()}`;
}

export type Health = { status: string; timestamp: string };

export type ContaInstagramRes = {
  id: string;
  nome: string;
  ig_user_id: string;
  has_token: boolean;
};

/** Perfil da empresa (workspace + automações). */
export type EmpresaPerfilRes = {
  nome: string;
  nome_fantasia: string;
  segmento: string;
  cidade: string;
  tom_voz: string;
  sobre: string;
  objetivo_qualificacao: string;
};

export type Config = {
  empresa: EmpresaPerfilRes;
  contas_instagram: ContaInstagramRes[];
  instagram_default_id: string | null;
  instagram?: { connected: boolean; ig_user_id?: string };
};

export type ContaInstagramInput = {
  id?: string;
  nome: string;
  ig_user_id: string;
  access_token?: string;
};

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



export type AuthStatus = {
  database: boolean;
  hasUsers: boolean;
  allowRegister: boolean;
  authMode?: string;
  message?: string;
  /** true quando META_APP_* e redirect estão na API (botão Conectar Meta no painel). */
  metaOAuthConfigured?: boolean;
  /** instagram = instagram.com/oauth/authorize; facebook = dialog Facebook + páginas. */
  metaOAuthMode?: "facebook" | "instagram";
};

function postadorAuthHeaders(): Record<string, string> {
  const t = getAuthToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export const api = {
  getHealth: () => fetchJson<Health>("/health"),
  getAuthStatus: () => fetchJson<AuthStatus>("/api/auth/status"),
  login: (email: string, password: string) =>
    fetchJson<{ token: string; user: { email: string; organization_id: string } }>("/api/auth/login", {
      method: "POST",
      body: { email, password },
    }),
  register: (email: string, password: string, organizationName: string) =>
    fetchJson<{ token: string; user: { email: string; organization_id: string } }>("/api/auth/register", {
      method: "POST",
      body: { email, password, organizationName },
    }),
  getMe: () => fetchJson<{ user: { id: string; email: string; organization_id: string } }>("/api/auth/me"),
  getMeWorkspace: () => fetchJson<Config>("/api/me/workspace"),
  getMetaOAuthUrl: () => fetchJson<{ url: string }>("/api/me/integrations/meta/oauth-url"),
  putMeWorkspace: (body: {
    empresa?: Partial<EmpresaPerfilRes>;
    contas_instagram?: ContaInstagramInput[];
    instagram_default_id?: string | null;
  }) =>
    fetchJson<{ saved: boolean; received: Config }>("/api/me/workspace", {
      method: "PUT",
      body,
    }),
  getConfig: () => fetchJson<Config>("/api/config"),
  putConfig: (body: {
    empresa?: Partial<EmpresaPerfilRes>;
    contas_instagram?: ContaInstagramInput[];
    instagram_default_id?: string | null;
    instagram?: { access_token?: string; ig_user_id?: string };
  }) =>
    fetchJson<{ saved: boolean; received: Config }>("/api/config", {
      method: "PUT",
      body,
    }),

  postador: {
    gerarCaption: (
      descricao: string,
      file?: File | File[] | null,
      provider?: string | null,
      model?: string | null
    ) => {
      const files = file == null ? [] : Array.isArray(file) ? file : [file];
      if (files.length > 0) {
        const form = new FormData();
        form.set("descricao", descricao);
        for (const f of files) form.append("arquivo", f);
        if (provider) form.set("provider", provider);
        if (model) form.set("model", model);
        return fetch(`${base}/api/postador/gerar-caption`, {
          method: "POST",
          headers: postadorAuthHeaders(),
          body: form,
        }).then(async (res) => {
          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            const msg = (errBody as { error?: string }).error ?? `API ${res.status}: ${res.statusText}`;
            throw new Error(msg);
          }
          return res.json() as Promise<{ caption: string; media_url?: string; media_urls?: string[]; media_type?: string }>;
        });
      }
      return fetchJson<{ caption: string; media_url?: string; media_urls?: string[]; media_type?: string }>("/api/postador/gerar-caption", {
        method: "POST",
        body: { descricao, provider: provider || undefined, model: model || undefined },
      });
    },
    gerarPorUrl: (url: string, provider?: string | null, model?: string | null) =>
      fetchJson<{
        jornada: Array<{
          post_number: number;
          estrategia: string;
          caption: string;
          media_url?: string;
          media_urls?: string[];
          media_type?: "IMAGE" | "CAROUSEL" | "REELS";
        }>;
      }>("/api/postador/por-url", {
        method: "POST",
        body: { url, provider: provider || undefined, model: model || undefined },
      }),
    refazerCaption: (
      caption_atual: string,
      feedback: string,
      refazer_midia?: boolean,
      provider?: string | null,
      model?: string | null
    ) =>
      fetchJson<{ caption: string; media_url?: string; media_type?: string }>("/api/postador/refazer-caption", {
        method: "POST",
        body: { caption_atual, feedback, refazer_midia, provider: provider || undefined, model: model || undefined },
      }),
    publicar: (payload: {
      caption: string;
      media_url?: string;
      media_urls?: string[];
      media_type?: "IMAGE" | "REELS" | "CAROUSEL";
      conta_id?: string | null;
    }) =>
      fetchJson<{ ok: boolean; id_container?: string; id_media?: string; link_post?: string; message?: string }>("/api/postador/publicar", {
        method: "POST",
        body: payload,
      }),
    getCronograma: () =>
      fetchJson<{ cronograma: CronogramaItem[]; total: number }>(cacheBust("/api/postador/cronograma")),
    deleteCronograma: (id: string) =>
      fetchJson<{ ok: boolean }>(`/api/postador/cronograma/${id}`, { method: "DELETE" }),
    getAgendados: () =>
      fetchJson<{ agendados: AgendadoItem[]; total: number }>(cacheBust("/api/postador/agendados")),
    saveAgendado: (payload: {
      caption: string;
      media_url?: string | null;
      media_urls?: string[] | null;
      media_type: "IMAGE" | "REELS" | "CAROUSEL";
      data_agendamento?: string | null;
      conta_id?: string | null;
    }) =>
      fetchJson<{ ok: boolean; agendado: AgendadoItem }>("/api/postador/agendados", {
        method: "POST",
        body: payload,
      }),
    deleteAgendado: (id: string) =>
      fetchJson<{ ok: boolean }>(`/api/postador/agendados/${id}`, { method: "DELETE" }),
    publicarAgendado: (id: string, conta_id?: string | null) =>
      fetchJson<{ ok: boolean; id_container?: string; id_media?: string; link_post?: string; message?: string }>(
        `/api/postador/agendados/${id}/publicar`,
        { method: "POST", body: { conta_id: conta_id ?? undefined } }
      ),
    gerarImagem: (prompt: string, provider?: "openai" | "gemini") =>
      fetchJson<{ media_url: string }>("/api/postador/gerar-imagem", {
        method: "POST",
        body: { prompt, provider: provider ?? "openai" },
      }),
    carouselAdicionarTexto: (image_urls: string[], texts: string[]) =>
      fetchJson<{ image_urls: string[] }>("/api/postador/carousel-adicionar-texto", {
        method: "POST",
        body: { image_urls, texts },
      }),
    gerarCTA: (caption: string, provider?: string, model?: string) =>
      fetchJson<{ cta: string }>("/api/postador/gerar-cta", {
        method: "POST",
        body: { caption, provider, model },
      }),
    uploadMidia: (file: File) => {
      const form = new FormData();
      form.set("arquivo", file);
      return fetch(`${base}/api/postador/upload-midia`, {
        method: "POST",
        headers: postadorAuthHeaders(),
        body: form,
      }).then(async (res) => {
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          const msg = (errBody as { error?: string }).error ?? `API ${res.status}: ${res.statusText}`;
          throw new Error(msg);
        }
        return res.json() as Promise<{ media_url: string }>;
      });
    },
  },
};
