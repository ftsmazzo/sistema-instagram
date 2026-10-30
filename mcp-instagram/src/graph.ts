import { graphBase, type IgConfig } from "./config.js";

type GraphError = { message?: string; code?: number; error_subcode?: number; type?: string };

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
    throw new Error(err.message || fallback);
  }
}

export class InstagramGraph {
  constructor(private readonly cfg: IgConfig) {}

  private base(): string {
    return graphBase(this.cfg.accessToken, this.cfg.graphVersion);
  }

  private async get(path: string, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
    const u = new URL(`${this.base()}${path.startsWith("/") ? path : `/${path}`}`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
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

  async getProfile() {
    return this.get(`/${this.cfg.igUserId}`, {
      fields: "id,username,name,biography,followers_count,follows_count,media_count,profile_picture_url,website",
    });
  }

  async listMedia(limit = 12) {
    const json = await this.get(`/${this.cfg.igUserId}/media`, {
      fields: "id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count",
      limit: String(Math.min(Math.max(limit, 1), 50)),
    });
    return {
      data: (json.data as unknown[]) ?? [],
      paging: json.paging ?? null,
    };
  }

  async getMedia(mediaId: string) {
    return this.get(`/${mediaId}`, {
      fields: "id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count,children{id,media_type,media_url}",
    });
  }

  async publishImage(imageUrl: string, caption: string) {
    const container = await this.postForm(`/${this.cfg.igUserId}/media`, {
      image_url: imageUrl,
      caption,
    });
    const creationId = String(container.id ?? "");
    if (!creationId) throw new Error("Instagram não retornou creation_id");

    const maxWait = 30_000;
    const step = 1500;
    let elapsed = 0;
    while (elapsed < maxWait) {
      await new Promise((r) => setTimeout(r, step));
      elapsed += step;
      const status = await this.get(`/${creationId}`, { fields: "status_code,status" });
      if (status.status_code === "FINISHED") break;
      if (status.status_code === undefined && elapsed >= 3000) break;
      if (status.status_code === "ERROR" || status.status === "ERROR") {
        throw new Error("Processamento da mídia falhou no Instagram (URL pública? JPEG?)");
      }
    }

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

  async listComments(mediaId: string, limit = 25) {
    const json = await this.get(`/${mediaId}/comments`, {
      fields: "id,text,username,timestamp,like_count,replies{id,text,username,timestamp}",
      limit: String(Math.min(Math.max(limit, 1), 50)),
    });
    return { data: (json.data as unknown[]) ?? [], paging: json.paging ?? null };
  }

  async replyComment(commentId: string, message: string) {
    return this.postForm(`/${commentId}/replies`, { message });
  }

  async listConversations(limit = 20) {
    const json = await this.get(`/${this.cfg.igUserId}/conversations`, {
      fields: "id,updated_time,participants,message_count",
      platform: "instagram",
      limit: String(Math.min(Math.max(limit, 1), 50)),
    });
    return { data: (json.data as unknown[]) ?? [], paging: json.paging ?? null };
  }

  async getConversationMessages(conversationId: string, limit = 20) {
    const json = await this.get(`/${conversationId}`, {
      fields: `messages.limit(${Math.min(Math.max(limit, 1), 50)}){id,created_time,from,to,message}`,
    });
    return json;
  }

  async sendDm(recipientIgsid: string, text: string) {
    // Instagram Login: POST /{ig-user-id}/messages
    // Facebook Page token: POST /{page-id}/messages
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
    // Campos comuns; a Meta pode exigir permissões específicas
    return this.get(`/${mediaId}/insights`, {
      metric: "impressions,reach,saved,likes,comments,shares,total_interactions",
    });
  }
}
