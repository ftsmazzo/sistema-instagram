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
  has_agent_token?: boolean;
  agent_ativo?: boolean;
  agent_nome?: string;
  agent_prompt_comentarios?: string;
  agent_prompt_direct?: string;
};

export type AgendaConfigRes = {
  dias_semana: number[];
  horario_inicio: string;
  horario_fim: string;
  duracao_minutos: number;
};

export const DEFAULT_AGENDA_CONFIG: AgendaConfigRes = {
  dias_semana: [1, 2, 3, 4, 5],
  horario_inicio: "09:00",
  horario_fim: "18:00",
  duracao_minutos: 60,
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
  handoff_whatsapp: string;
  link_produto_servico: string;
  agenda_config: AgendaConfigRes;
  criterios_qualificacao: string;
  agenda_local: string;
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
  agent_access_token?: string;
  agent_ativo?: boolean;
  agent_nome?: string;
  agent_prompt_comentarios?: string;
  agent_prompt_direct?: string;
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

export type WhatsappObjetivo = "link_produto" | "agendar_visita" | "handoff_humano";

export type WhatsappConnectionState = "open" | "connecting" | "close";

export type WhatsappConnectionRes = {
  ok: boolean;
  configured?: boolean;
  instance_name?: string | null;
  connection_state?: WhatsappConnectionState;
  profile_name?: string | null;
  phone_number?: string | null;
  profile_picture_url?: string | null;
  webhook_ok?: boolean;
  qr_base64?: string | null;
  qr_code?: string | null;
  pairing_code?: string | null;
  error?: string;
};

export type WhatsappGetRes = {
  instance: WhatsappInstanceRes | null;
  handoff_whatsapp?: string;
  link_produto_servico?: string;
  agenda_config?: AgendaConfigRes;
  criterios_qualificacao?: string;
  evolution_configured: boolean;
  connection: {
    state: WhatsappConnectionState;
    profile_name: string | null;
    phone_number: string | null;
    profile_picture_url: string | null;
    webhook_ok: boolean;
  } | null;
};

export type WhatsappInstanceRes = {
  id: string;
  instance_name: string;
  evolution_base_url: string;
  agent_ativo: boolean;
  agent_nome: string;
  agent_prompt: string;
  objetivos: WhatsappObjetivo[];
  status: string;
  delay_primeira_msg_minutos: number;
};

export type LeadListItemRes = {
  id: number;
  nome: string | null;
  whatsapp: string | null;
  username_instagram: string | null;
  objetivo: string | null;
  status: string;
  id_post_origem: string | null;
  origem_interacao: string | null;
  url_interesse: string | null;
  handoff_at: string | null;
  handoff_motivo: string | null;
  whatsapp_boas_vindas_enviado: boolean;
  created_at: string;
  updated_at: string;
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

export type PostadorNicheParams = {
  niche_id?: string;
  template_id?: string;
  segmento?: string;
  marca_nome?: string;
  image_mode?: "criativo" | "produto";
};

export type PostadorNicheTemplateRes = {
  key: string;
  id: string;
  label: string;
  formato: string;
  slides: number;
  hook_exemplo: string;
  legenda_max_chars: number;
  hashtags_max: number;
};

export type PostadorNicheRes = {
  id: string;
  label: string;
  descricao: string;
  tom_legenda: string;
  tom_visual: string;
  templates: PostadorNicheTemplateRes[];
};

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
    getNiches: (segmento?: string) => {
      const qs = segmento?.trim() ? `?segmento=${encodeURIComponent(segmento.trim())}` : "";
      return fetchJson<{ niches: PostadorNicheRes[]; suggested_niche_id: string | null }>(
        `/api/postador/niches${qs}`
      );
    },
    gerarCaption: (
      descricao: string,
      file?: File | File[] | null,
      provider?: string | null,
      model?: string | null,
      niche?: PostadorNicheParams | null
    ) => {
      const files = file == null ? [] : Array.isArray(file) ? file : [file];
      if (files.length > 0) {
        const form = new FormData();
        form.set("descricao", descricao);
        for (const f of files) form.append("arquivo", f);
        if (provider) form.set("provider", provider);
        if (model) form.set("model", model);
        if (niche?.niche_id) form.set("niche_id", niche.niche_id);
        if (niche?.template_id) form.set("template_id", niche.template_id);
        if (niche?.segmento) form.set("segmento", niche.segmento);
        if (niche?.marca_nome) form.set("marca_nome", niche.marca_nome);
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
        body: {
          descricao,
          provider: provider || undefined,
          model: model || undefined,
          ...niche,
        },
      });
    },
    gerarPorUrl: (url: string, provider?: string | null, model?: string | null, niche?: PostadorNicheParams | null) =>
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
        body: { url, provider: provider || undefined, model: model || undefined, ...niche },
      }),
    refazerCaption: (
      caption_atual: string,
      feedback: string,
      refazer_midia?: boolean,
      provider?: string | null,
      model?: string | null,
      niche?: PostadorNicheParams | null
    ) =>
      fetchJson<{ caption: string; media_url?: string; media_type?: string }>("/api/postador/refazer-caption", {
        method: "POST",
        body: { caption_atual, feedback, refazer_midia, provider: provider || undefined, model: model || undefined, ...niche },
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
      fetchJson<{ ok: boolean }>(`/api/postador/cronograma/${id}/delete`, { method: "POST", body: {} }),
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
      fetchJson<{ ok: boolean }>(`/api/postador/agendados/${id}/delete`, { method: "POST", body: {} }),
    publicarAgendado: (id: string, conta_id?: string | null) =>
      fetchJson<{ ok: boolean; id_container?: string; id_media?: string; link_post?: string; message?: string }>(
        `/api/postador/agendados/${id}/publicar`,
        { method: "POST", body: { conta_id: conta_id ?? undefined } }
      ),
    gerarImagem: (
      prompt: string,
      provider?: "openai" | "gemini",
      niche?: PostadorNicheParams | null,
      image_mode?: "criativo" | "produto"
    ) =>
      fetchJson<{ media_url: string }>("/api/postador/gerar-imagem", {
        method: "POST",
        body: { prompt, provider: provider ?? "gemini", image_mode, ...niche },
      }),
    getVideoProviders: () =>
      fetchJson<{
        providers: Array<{
          id: "slideshow" | "veo" | "sora";
          label: string;
          descricao: string;
          requer_imagens: boolean;
          requer_prompt: boolean;
          duracoes: Array<4 | 8 | 12>;
          custo_ref_8s_usd: number;
        }>;
      }>("/api/postador/video-providers"),
    gerarVideo: (body: {
      prompt: string;
      provider: "slideshow" | "veo" | "sora";
      image_urls?: string[];
      duration_seconds?: 4 | 8 | 12;
      auto_imagem_slideshow?: boolean;
    } & PostadorNicheParams) =>
      fetchJson<{
        media_url: string;
        media_type: "REELS";
        provider: string;
        duration_seconds: number;
        custo_estimado_usd: number;
      }>("/api/postador/gerar-video", {
        method: "POST",
        body,
      }),
    carouselAdicionarTexto: (image_urls: string[], texts: string[], niche?: PostadorNicheParams | null) =>
      fetchJson<{ image_urls: string[] }>("/api/postador/carousel-adicionar-texto", {
        method: "POST",
        body: { image_urls, texts, ...niche },
      }),
    gerarCTA: (caption: string, provider?: string, model?: string, niche?: PostadorNicheParams | null) =>
      fetchJson<{ cta: string }>("/api/postador/gerar-cta", {
        method: "POST",
        body: { caption, provider, model, ...niche },
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

  agentes: {
    getLeads: (params?: { limit?: number; with_whatsapp?: boolean; status?: string }) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.with_whatsapp) qs.set("with_whatsapp", "1");
      if (params?.status) qs.set("status", params.status);
      const q = qs.toString();
      return fetchJson<{ leads: LeadListItemRes[]; total: number }>(
        `/api/agentes/leads${q ? `?${q}` : ""}`
      );
    },
    getWhatsapp: () => fetchJson<WhatsappGetRes>("/api/agentes/whatsapp"),
    putWhatsapp: (body: {
      instance_name?: string;
      agent_ativo?: boolean;
      agent_nome?: string;
      agent_prompt?: string;
      objetivos?: WhatsappObjetivo[];
      delay_primeira_msg_minutos?: number;
      handoff_whatsapp?: string;
      link_produto_servico?: string;
      agenda_config?: AgendaConfigRes;
      criterios_qualificacao?: string;
    }) =>
      fetchJson<{ saved: boolean; instance: WhatsappInstanceRes }>("/api/agentes/whatsapp", {
        method: "PUT",
        body,
      }),
    connectWhatsapp: (instance_name: string) =>
      fetchJson<WhatsappConnectionRes>("/api/agentes/whatsapp/connect", {
        method: "POST",
        body: { instance_name },
      }),
    getWhatsappConnection: (refreshQr?: boolean) =>
      fetchJson<WhatsappConnectionRes>(
        `/api/agentes/whatsapp/connection${refreshQr ? "?refresh_qr=1" : ""}`
      ),
    disconnectWhatsapp: () =>
      fetchJson<{ ok: boolean; error?: string; message?: string }>(
        "/api/agentes/whatsapp/disconnect",
        { method: "POST", body: {} }
      ),
    deleteWhatsappInstance: () =>
      fetchJson<{ ok: boolean; deleted?: boolean; error?: string; message?: string }>(
        "/api/agentes/whatsapp/instance",
        { method: "DELETE" }
      ),
    syncWhatsappWebhook: () =>
      fetchJson<{
        ok: boolean;
        instance_name?: string;
        evolution_base_url?: string;
        webhook_url_expected?: string;
        applied?: unknown;
        current?: { enabled?: boolean; url?: string; events?: string[] } | null;
        error?: string;
      }>("/api/agentes/whatsapp/sync-webhook", { method: "POST", body: {} }),
    getWhatsappWebhook: () =>
      fetchJson<{
        ok: boolean;
        instance_name?: string;
        evolution_base_url?: string;
        webhook_url_expected?: string | null;
        current?: { enabled?: boolean; url?: string; events?: string[] } | null;
        error?: string;
      }>("/api/agentes/whatsapp/webhook"),
  },
};
