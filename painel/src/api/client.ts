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
    ...(init.headers as Record<string, string>),
  };
  const t = getAuthToken();
  if (t) headers["Authorization"] = `Bearer ${t}`;
  const payload = body !== undefined ? JSON.stringify(body) : undefined;
  if (payload !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers,
    body: payload,
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
  facebook_page_id?: string;
  has_token: boolean;
  has_agent_token?: boolean;
  agent_ativo?: boolean;
  agent_nome?: string;
  agent_prompt_comentarios?: string;
  agent_prompt_direct?: string;
};

export type PostagemListItemRes = {
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

/** Brand kit do Postador (paleta + logo). */
export type PostadorBrandKitRes = {
  cor_primaria: string;
  cor_secundaria: string;
  cor_destaque: string;
  logo_url?: string;
  usar_logo_em_posts?: boolean;
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
  postador_brand?: PostadorBrandKitRes;
};

export type QualificacaoCriterioRes = {
  id: string;
  label: string;
  pergunta_guia: string;
  obrigatorio: boolean;
};

export type QualificacaoPlaybookRes = {
  id: string;
  label: string;
  descricao: string;
  emoji: string;
  segmento: string;
  tom_voz: string;
  sobre_exemplo: string;
  objetivo_qualificacao: string;
  resultado_esperado: string;
  criterios: QualificacaoCriterioRes[];
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
  facebook_page_id?: string;
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
  whatsapp_primeira_ia_enviada: boolean;
  whatsapp_ia_agendada_em: string | null;
  whatsapp_boas_vindas_em: string | null;
  created_at: string;
  updated_at: string;
  crm_notas: string | null;
  proximo_followup_em: string | null;
};

export type PipelineMetricsRes = {
  ok: boolean;
  ai_disponivel: boolean;
  period_days: number;
  taxa_comentario_para_lead: number | null;
  taxa_lead_para_whatsapp: number | null;
  taxa_whatsapp_para_handoff: number | null;
  taxa_handoff_para_convertido: number | null;
  leads_ativos: number;
  leads_parados_72h: number;
  follow_ups_pendentes: number;
};

export type FollowUpItemRes = {
  lead_id: number;
  nome: string | null;
  username_instagram: string | null;
  whatsapp: string | null;
  status: string;
  priority: "critical" | "high" | "medium" | "low";
  temperature: "quente" | "morno" | "frio";
  motivo: string;
  acao_sugerida: string;
  horas_parado: number | null;
  funil_etapa: string;
  visita_proxima: string | null;
};

export type LeadCoachRes = {
  resumo: string;
  temperatura: "quente" | "morno" | "frio";
  proxima_acao: string;
  mensagem_sugerida: string;
  risco_perda: "baixo" | "medio" | "alto";
  oportunidade: string;
};

export type LeadTimelineDetailRes = {
  id: number;
  nome: string | null;
  id_instagram: string;
  whatsapp: string | null;
  username_instagram: string | null;
  status: string;
  objetivo: string | null;
  origem_interacao: string | null;
  url_interesse: string | null;
  handoff_motivo: string | null;
  crm_notas: string | null;
  proximo_followup_em: string | null;
};

export type FunnelStatsRes = {
  ok: boolean;
  period_days: number;
  comentarios: number;
  direct_inbound: number;
  direct_outbound: number;
  whatsapp_inbound: number;
  whatsapp_outbound: number;
  leads_total: number;
  leads_com_whatsapp: number;
  leads_por_status: Record<string, number>;
  handoffs: number;
};

export type TimelineItemRes = {
  canal: "comentario" | "direct" | "whatsapp" | "visita";
  direction: "inbound" | "outbound";
  text: string;
  at: string;
  ref: string | null;
};

export type OperacaoHealthRes = {
  ok: boolean;
  issues: { code: string; message: string; severity: "error" | "warning" | "info" }[];
  instagram: { contas: number; agentes_ativos: number; com_token_agente_igaa: number };
  whatsapp: {
    evolution_configured: boolean;
    agent_ativo: boolean;
    instance_name: string | null;
    connection_state: string | null;
  };
};

export type AuthStatus = {
  database: boolean;
  hasUsers: boolean;
  allowRegister: boolean;
  authMode?: string;
  message?: string;
  /** @deprecated OAuth Meta removido do painel — use Administração → Adicionar conta */
  metaOAuthConfigured?: boolean;
  /** instagram = instagram.com/oauth/authorize; facebook = dialog Facebook + páginas. */
  metaOAuthMode?: "facebook" | "instagram";
};

function postadorAuthHeaders(): Record<string, string> {
  const t = getAuthToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export type PostadorSlideTemplateId =
  | "limpo"
  | "minimal"
  | "numerado"
  | "capa"
  | "editorial"
  | "magazine"
  | "bold"
  | "split"
  | "glass";

export type PostadorNicheParams = {
  niche_id?: string;
  template_id?: string;
  segmento?: string;
  marca_nome?: string;
  image_mode?: "criativo" | "produto";
  slide_template?: PostadorSlideTemplateId;
  music_id?: string;
  music_start_sec?: number;
  slides_count?: number;
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
  getQualificacaoPlaybooks: (segmento?: string) => {
    const qs = segmento?.trim() ? `?segmento=${encodeURIComponent(segmento.trim())}` : "";
    return fetchJson<{ playbooks: QualificacaoPlaybookRes[]; suggested_playbook_id: string | null }>(
      `/api/qualificacao/playbooks${qs}`
    );
  },
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
    gerarCarrossel: (body: {
      brief: string;
      provider?: "openai" | "gemini";
      aplicar_moldura?: boolean;
      slides_count?: number;
    } & PostadorNicheParams) =>
      fetchJson<{
        media_type: "CAROUSEL";
        media_urls: string[];
        slide_texts: string[];
        caption: string;
        overlay_applied: boolean;
        slides_count: number;
        custo_estimado_usd: number;
      }>("/api/postador/gerar-carrossel", {
        method: "POST",
        body: { ...body, provider: body.provider ?? "gemini" },
      }),
    compositarProduto: (body: { background_url: string; product_url: string; product_scale?: number }) =>
      fetchJson<{ media_url: string }>("/api/postador/compositar-produto", {
        method: "POST",
        body,
      }),
    checarQualidade: (body: {
      caption?: string | null;
      media_type?: string;
      media_url?: string | null;
      media_urls?: string[];
    }) =>
      fetchJson<{
        score: number;
        pronto: boolean;
        issues: Array<{ nivel: "ok" | "aviso" | "erro"; codigo: string; mensagem: string }>;
      }>("/api/postador/checar-qualidade", {
        method: "POST",
        body,
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
    getMusicTracks: () =>
      fetchJson<{
        tracks: Array<{
          id: string;
          label: string;
          mood: string;
          volume: number;
          preview_url?: string;
          preview_duration_sec?: number;
        }>;
      }>("/api/postador/music-tracks").then((res) => ({
        tracks: res.tracks.map((t) => ({
          ...t,
          preview_url:
            t.preview_url && !t.preview_url.startsWith("http")
              ? `${base}${t.preview_url}`
              : t.preview_url,
        })),
      })),
    getSlideTemplates: () =>
      fetchJson<{
        templates: Array<{
          id: PostadorSlideTemplateId;
          label: string;
          descricao: string;
          recomendado?: boolean;
        }>;
      }>("/api/postador/slide-templates"),
    gerarVideo: (body: {
      prompt: string;
      provider: "slideshow" | "veo" | "sora";
      image_urls?: string[];
      duration_seconds?: 4 | 8 | 12;
      auto_imagem_slideshow?: boolean;
      music_id?: string;
      music_start_sec?: number;
    } & PostadorNicheParams) =>
      fetchJson<{
        media_url: string;
        media_type: "REELS";
        provider: string;
        duration_seconds: number;
        custo_estimado_usd: number;
        music_id?: string | null;
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

  postagens: {
    list: (params?: { limit?: number; offset?: number; instagram_account_id?: string }) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.offset) qs.set("offset", String(params.offset));
      if (params?.instagram_account_id) qs.set("instagram_account_id", params.instagram_account_id);
      const q = qs.toString();
      return fetchJson<{ postagens: PostagemListItemRes[]; total: number }>(
        `/api/postagens${q ? `?${q}` : ""}`
      );
    },
    sync: (body?: { instagram_account_id?: string; limit?: number }) =>
      fetchJson<{
        ok: boolean;
        synced: number;
        total_fetched: number;
        account_id: string;
        account_nome: string;
        error?: string;
      }>("/api/postagens/sync", { method: "POST", body: body ?? {} }),
    delete: (id: number) =>
      fetchJson<{ ok: boolean; deleted: boolean }>(`/api/postagens/${id}`, { method: "DELETE" }),
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
    getFunnel: (days?: number) =>
      fetchJson<FunnelStatsRes>(`/api/agentes/funnel${days ? `?days=${days}` : ""}`),
    getOperacaoHealth: () => fetchJson<OperacaoHealthRes>("/api/agentes/operacao/health"),
    getOperacaoPipeline: (days?: number) =>
      fetchJson<PipelineMetricsRes>(`/api/agentes/operacao/pipeline${days ? `?days=${days}` : ""}`),
    getFollowUps: () =>
      fetchJson<{ ok: boolean; items: FollowUpItemRes[]; total: number }>(
        "/api/agentes/operacao/follow-ups"
      ),
    getLeadTimeline: (leadId: number) =>
      fetchJson<{
        ok: boolean;
        lead: LeadTimelineDetailRes;
        timeline: TimelineItemRes[];
      }>(`/api/agentes/leads/${leadId}/timeline`),
    updateLead: (leadId: number, body: {
      status?: string;
      crm_notas?: string | null;
      proximo_followup_em?: string | null;
    }) =>
      fetchJson<{ ok: boolean; lead: LeadListItemRes }>(`/api/agentes/leads/${leadId}`, {
        method: "PATCH",
        body,
      }),
    getLeadAiCoach: (leadId: number) =>
      fetchJson<{ ok: boolean; coach: LeadCoachRes }>(`/api/agentes/leads/${leadId}/ai-coach`, {
        method: "POST",
        body: {},
      }),
  },
};
