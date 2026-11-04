import { graphBase, type IgConfig } from "./config.js";

type GraphError = { message?: string; code?: number; error_subcode?: number; type?: string; fbtrace_id?: string };

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Resposta não-JSON da Graph API (${res.status}): ${text.slice(0, 300)}`);
  }
}

function throwIfError(json: Record<string, unknown>, fallback: string): void {
  const err = json.error as GraphError | undefined;
  if (err) {
    const bits = [
      err.message || fallback,
      err.code != null ? `code=${err.code}` : null,
      err.error_subcode != null ? `subcode=${err.error_subcode}` : null,
      err.type ? `type=${err.type}` : null,
    ].filter(Boolean);
    throw new Error(bits.join(" | "));
  }
}

function cursorFromPaging(paging: unknown): string | null {
  if (!paging || typeof paging !== "object") return null;
  const cursors = (paging as { cursors?: { after?: string } }).cursors;
  return cursors?.after ?? null;
}

export class InstagramGraph {
  constructor(private readonly cfg: IgConfig) {}

  private base(): string {
    return graphBase(this.cfg.accessToken, this.cfg.graphVersion);
  }

  private async get(path: string, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
    const u = new URL(`${this.base()}${path.startsWith("/") ? path : `/${path}`}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") u.searchParams.set(k, v);
    }
    u.searchParams.set("access_token", this.cfg.accessToken);
    const res = await fetch(u);
    const json = await parseJson(res);
    throwIfError(json, `GET ${path} falhou`);
    return json;
  }

  private async postForm(path: string, fields: Record<string, string>): Promise<Record<string, unknown>> {
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(fields)) body.set(k, v);
    body.set("access_token", this.cfg.accessToken);
    const res = await fetch(`${this.base()}${path.startsWith("/") ? path : `/${path}`}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const json = await parseJson(res);
    throwIfError(json, `POST ${path} falhou`);
    return json;
  }

  private async delete(path: string, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
    const u = new URL(`${this.base()}${path.startsWith("/") ? path : `/${path}`}`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    u.searchParams.set("access_token", this.cfg.accessToken);
    const res = await fetch(u, { method: "DELETE" });
    const json = await parseJson(res);
    throwIfError(json, `DELETE ${path} falhou`);
    return json;
  }

  private async waitForContainer(creationId: string, maxWait = 60_000): Promise<void> {
    const step = 1500;
    let elapsed = 0;
    while (elapsed < maxWait) {
      await new Promise((r) => setTimeout(r, step));
      elapsed += step;
      const status = await this.get(`/${creationId}`, { fields: "status_code,status" });
      if (status.status_code === "FINISHED") return;
      if (status.status_code === undefined && elapsed >= 3000) return;
      if (status.status_code === "ERROR" || status.status === "ERROR") {
        throw new Error("Processamento da mídia falhou no Instagram (URL pública? formato suportado?)");
      }
    }
    throw new Error(`Timeout aguardando container ${creationId} ficar FINISHED`);
  }

  private async publishContainer(creationId: string) {
    await this.waitForContainer(creationId);
    const published = await this.postForm(`/${this.cfg.igUserId}/media_publish`, {
      creation_id: creationId,
    });
    const idMedia = String(published.id ?? "");
    if (!idMedia) throw new Error("Instagram não retornou id da mídia publicada");

    let permalink: string | null = null;
    try {
      const meta = await this.get(`/${idMedia}`, { fields: "permalink" });
      permalink = typeof meta.permalink === "string" ? meta.permalink : null;
    } catch {
      /* optional */
    }
    return { id_container: creationId, id_media: idMedia, permalink };
  }

  async getProfile() {
    return this.get(`/${this.cfg.igUserId}`, {
      fields: "id,username,name,biography,followers_count,follows_count,media_count,profile_picture_url,website",
    });
  }

  async listMedia(limit = 12, after?: string) {
    const params: Record<string, string> = {
      fields: "id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count,thumbnail_url",
      limit: String(Math.min(Math.max(limit, 1), 50)),
    };
    if (after) params.after = after;
    const json = await this.get(`/${this.cfg.igUserId}/media`, params);
    return {
      data: (json.data as unknown[]) ?? [],
      paging: json.paging ?? null,
      next_cursor: cursorFromPaging(json.paging),
    };
  }

  async getMedia(mediaId: string) {
    return this.get(`/${mediaId}`, {
      fields:
        "id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count,thumbnail_url,children{id,media_type,media_url}",
    });
  }

  async publishImage(imageUrl: string, caption: string) {
    const container = await this.postForm(`/${this.cfg.igUserId}/media`, {
      image_url: imageUrl,
      caption,
    });
    const creationId = String(container.id ?? "");
    if (!creationId) throw new Error("Instagram não retornou creation_id");
    return this.publishContainer(creationId);
  }

  async publishReel(videoUrl: string, caption: string, coverUrl?: string) {
    const fields: Record<string, string> = {
      media_type: "REELS",
      video_url: videoUrl,
      caption,
    };
    if (coverUrl) fields.cover_url = coverUrl;
    const container = await this.postForm(`/${this.cfg.igUserId}/media`, fields);
    const creationId = String(container.id ?? "");
    if (!creationId) throw new Error("Instagram não retornou creation_id do Reel");
    return this.publishContainer(creationId);
  }

  async publishCarousel(imageUrls: string[], caption: string) {
    if (imageUrls.length < 2 || imageUrls.length > 10) {
      throw new Error("Carrossel precisa de 2 a 10 URLs de imagem HTTPS públicas");
    }
    const childIds: string[] = [];
    for (const url of imageUrls) {
      const child = await this.postForm(`/${this.cfg.igUserId}/media`, {
        image_url: url,
        is_carousel_item: "true",
      });
      const id = String(child.id ?? "");
      if (!id) throw new Error("Falha ao criar item do carrossel");
      childIds.push(id);
    }
    const parent = await this.postForm(`/${this.cfg.igUserId}/media`, {
      media_type: "CAROUSEL",
      caption,
      children: childIds.join(","),
    });
    const creationId = String(parent.id ?? "");
    if (!creationId) throw new Error("Instagram não retornou creation_id do carrossel");
    return this.publishContainer(creationId);
  }

  async publishStory(opts: { image_url?: string; video_url?: string }) {
    if (!opts.image_url && !opts.video_url) {
      throw new Error("Informe image_url ou video_url para Story");
    }
    if (opts.image_url && opts.video_url) {
      throw new Error("Use só image_url OU video_url para Story");
    }
    const fields: Record<string, string> = { media_type: "STORIES" };
    if (opts.image_url) fields.image_url = opts.image_url;
    if (opts.video_url) fields.video_url = opts.video_url;
    const container = await this.postForm(`/${this.cfg.igUserId}/media`, fields);
    const creationId = String(container.id ?? "");
    if (!creationId) throw new Error("Instagram não retornou creation_id do Story");
    return this.publishContainer(creationId);
  }

  async listComments(mediaId: string, limit = 25, after?: string) {
    const params: Record<string, string> = {
      fields: "id,text,username,timestamp,like_count,replies{id,text,username,timestamp}",
      limit: String(Math.min(Math.max(limit, 1), 50)),
    };
    if (after) params.after = after;
    const json = await this.get(`/${mediaId}/comments`, params);
    return {
      data: (json.data as unknown[]) ?? [],
      paging: json.paging ?? null,
      next_cursor: cursorFromPaging(json.paging),
    };
  }

  async replyComment(commentId: string, message: string) {
    return this.postForm(`/${commentId}/replies`, { message });
  }

  async hideComment(commentId: string, hide = true) {
    return this.postForm(`/${commentId}`, { hide: hide ? "true" : "false" });
  }

  async deleteComment(commentId: string) {
    return this.delete(`/${commentId}`);
  }

  async listConversations(limit = 20, after?: string) {
    const params: Record<string, string> = {
      fields: "id,updated_time,participants,message_count",
      platform: "instagram",
      limit: String(Math.min(Math.max(limit, 1), 50)),
    };
    if (after) params.after = after;
    const json = await this.get(`/${this.cfg.igUserId}/conversations`, params);
    return {
      data: (json.data as unknown[]) ?? [],
      paging: json.paging ?? null,
      next_cursor: cursorFromPaging(json.paging),
    };
  }

  async getConversationMessages(conversationId: string, limit = 20) {
    const json = await this.get(`/${conversationId}`, {
      fields: `messages.limit(${Math.min(Math.max(limit, 1), 50)}){id,created_time,from,to,message}`,
    });
    return json;
  }

  async sendDm(recipientIgsid: string, text: string) {
    const path =
      this.cfg.facebookPageId && !/^(IGAA|IGQV)/i.test(this.cfg.accessToken)
        ? `/${this.cfg.facebookPageId}/messages`
        : `/${this.cfg.igUserId}/messages`;

    const payload = {
      recipient: { id: recipientIgsid },
      message: { text },
    };

    const res = await fetch(`${this.base()}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.cfg.accessToken}`,
      },
      body: JSON.stringify(payload),
    });
    const json = await parseJson(res);
    throwIfError(json, "Falha ao enviar DM");
    return json;
  }

  async mediaInsights(mediaId: string) {
    try {
      return await this.get(`/${mediaId}/insights`, {
        metric: "impressions,reach,saved,likes,comments,shares,total_interactions,views,plays",
      });
    } catch (e1) {
      try {
        return await this.get(`/${mediaId}/insights`, {
          metric: "reach,saved,likes,comments,shares,total_interactions",
        });
      } catch {
        throw e1;
      }
    }
  }

  async accountInsights(period: "day" | "week" | "days_28" = "day") {
    const metricSets = [
      "reach,follower_count,website_clicks,profile_views,accounts_engaged,total_interactions,views",
      "reach,follower_count,profile_views",
      "reach,impressions,profile_views,follower_count",
    ];
    const errors: string[] = [];
    for (const metric of metricSets) {
      try {
        const json = await this.get(`/${this.cfg.igUserId}/insights`, {
          metric,
          period,
        });
        return { period, ...json };
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    throw new Error(
      `Account insights indisponível (permissão/app review?). Tentativas: ${errors.join(" || ")}`
    );
  }

  /** Snapshot para auditoria estratégica (Prompt 1 / 7). */
  async auditSnapshot(mediaLimit = 24) {
    const profile = await this.getProfile();
    const media = await this.listMedia(mediaLimit);
    const items = (media.data as Array<Record<string, unknown>>) ?? [];

    const withInsights: Array<Record<string, unknown>> = [];
    for (const m of items.slice(0, 12)) {
      const id = String(m.id ?? "");
      if (!id) continue;
      let insights: unknown = null;
      let insights_error: string | null = null;
      try {
        insights = await this.mediaInsights(id);
      } catch (e) {
        insights_error = e instanceof Error ? e.message : String(e);
      }
      withInsights.push({ ...m, insights, insights_error });
    }

    const ranked = [...items].sort((a, b) => {
      const la = Number(a.like_count ?? 0) + Number(a.comments_count ?? 0);
      const lb = Number(b.like_count ?? 0) + Number(b.comments_count ?? 0);
      return lb - la;
    });

    let account_insights: unknown = null;
    let account_insights_error: string | null = null;
    try {
      account_insights = await this.accountInsights("day");
    } catch (e) {
      account_insights_error = e instanceof Error ? e.message : String(e);
    }

    return {
      profile,
      media_count_returned: items.length,
      top_3_by_engagement: ranked.slice(0, 3),
      worst_3_by_engagement: ranked.slice(-3).reverse(),
      recent_with_insights: withInsights,
      account_insights,
      account_insights_error,
      next_cursor: media.next_cursor,
      generated_at: new Date().toISOString(),
    };
  }

  /** Métricas agregadas para a reunião semanal (Prompt 7). */
  async weeklyMetrics(mediaLimit = 30) {
    const profile = await this.getProfile();
    const media = await this.listMedia(mediaLimit);
    const items = (media.data as Array<Record<string, unknown>>) ?? [];

    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weekItems = items.filter((m) => {
      const ts = m.timestamp ? Date.parse(String(m.timestamp)) : 0;
      return ts >= weekAgo;
    });

    const sum = (arr: Array<Record<string, unknown>>, key: string) =>
      arr.reduce((acc, m) => acc + Number(m[key] ?? 0), 0);

    let account_insights: unknown = null;
    let account_insights_error: string | null = null;
    try {
      account_insights = await this.accountInsights("day");
    } catch (e) {
      account_insights_error = e instanceof Error ? e.message : String(e);
    }

    const ranked = [...weekItems].sort((a, b) => {
      const la = Number(a.like_count ?? 0) + Number(a.comments_count ?? 0);
      const lb = Number(b.like_count ?? 0) + Number(b.comments_count ?? 0);
      return lb - la;
    });

    return {
      profile: {
        username: profile.username,
        followers_count: profile.followers_count,
        media_count: profile.media_count,
      },
      window_days: 7,
      posts_published: weekItems.length,
      likes_total: sum(weekItems, "like_count"),
      comments_total: sum(weekItems, "comments_count"),
      by_media_type: weekItems.reduce<Record<string, number>>((acc, m) => {
        const t = String(m.media_type ?? "UNKNOWN");
        acc[t] = (acc[t] ?? 0) + 1;
        return acc;
      }, {}),
      top_3: ranked.slice(0, 3).map((m) => ({
        id: m.id,
        caption: String(m.caption ?? "").slice(0, 120),
        media_type: m.media_type,
        like_count: m.like_count,
        comments_count: m.comments_count,
        permalink: m.permalink,
      })),
      worst_3: ranked
        .slice(-3)
        .reverse()
        .map((m) => ({
          id: m.id,
          caption: String(m.caption ?? "").slice(0, 120),
          media_type: m.media_type,
          like_count: m.like_count,
          comments_count: m.comments_count,
          permalink: m.permalink,
        })),
      account_insights,
      account_insights_error,
      note: "Leads/vendas/retenção/alcance da conta dependem de App Review ou preenchimento manual no Prompt 7.",
      generated_at: new Date().toISOString(),
    };
  }
}
