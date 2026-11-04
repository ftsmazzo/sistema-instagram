import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { InstagramGraph } from "./graph.js";
import { TILLI_PROMPTS } from "./prompts.js";

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }, null, 2) }],
    isError: true,
  };
}

export function createInstagramMcpServer(): McpServer {
  const server = new McpServer({
    name: "instagram-maquina-de-vendas",
    version: "1.1.0",
  });

  let graph: InstagramGraph | null = null;
  const api = () => {
    if (!graph) graph = new InstagramGraph(loadConfig());
    return graph;
  };

  for (const p of TILLI_PROMPTS) {
    server.registerPrompt(
      p.name,
      {
        title: p.title,
        description: p.description,
      },
      async () => ({
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: p.body,
            },
          },
        ],
      })
    );
  }

  server.tool(
    "ig_get_profile",
    "Retorna o perfil da conta Instagram Business/Creator configurada (username, bio, seguidores).",
    {},
    async () => {
      try {
        return ok(await api().getProfile());
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.tool(
    "ig_list_media",
    "Lista posts recentes (id, caption, tipo, permalink, likes/comentários). Use after para paginar.",
    {
      limit: z.number().int().min(1).max(50).optional().describe("Quantidade (padrão 12)"),
      after: z.string().optional().describe("Cursor next_cursor da página anterior"),
    },
    async ({ limit, after }) => {
      try {
        return ok(await api().listMedia(limit ?? 12, after));
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.tool(
    "ig_get_media",
    "Detalha um post/mídia pelo media_id do Instagram.",
    { media_id: z.string().min(1).describe("ID da mídia Graph") },
    async ({ media_id }) => {
      try {
        return ok(await api().getMedia(media_id));
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.tool(
    "ig_publish_image",
    "Publica uma imagem no feed. A URL precisa ser HTTPS pública (JPEG/PNG acessível pela Meta).",
    {
      image_url: z.string().url().describe("URL pública da imagem"),
      caption: z.string().max(2200).default("").describe("Legenda do post"),
    },
    async ({ image_url, caption }) => {
      try {
        return ok(await api().publishImage(image_url, caption ?? ""));
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.tool(
    "ig_publish_reel",
    "Publica um Reel. video_url precisa ser HTTPS pública (MP4 acessível pela Meta).",
    {
      video_url: z.string().url().describe("URL pública do vídeo MP4"),
      caption: z.string().max(2200).default("").describe("Legenda"),
      cover_url: z.string().url().optional().describe("URL pública da capa (opcional)"),
    },
    async ({ video_url, caption, cover_url }) => {
      try {
        return ok(await api().publishReel(video_url, caption ?? "", cover_url));
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.tool(
    "ig_publish_carousel",
    "Publica carrossel (2–10 imagens HTTPS públicas).",
    {
      image_urls: z.array(z.string().url()).min(2).max(10).describe("URLs das imagens"),
      caption: z.string().max(2200).default("").describe("Legenda"),
    },
    async ({ image_urls, caption }) => {
      try {
        return ok(await api().publishCarousel(image_urls, caption ?? ""));
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.tool(
    "ig_publish_story",
    "Publica um Story (imagem OU vídeo HTTPS público). Requer permissão de conteúdo.",
    {
      image_url: z.string().url().optional().describe("URL da imagem"),
      video_url: z.string().url().optional().describe("URL do vídeo"),
    },
    async ({ image_url, video_url }) => {
      try {
        return ok(await api().publishStory({ image_url, video_url }));
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.tool(
    "ig_list_comments",
    "Lista comentários de um post. Use after para paginar.",
    {
      media_id: z.string().min(1),
      limit: z.number().int().min(1).max(50).optional(),
      after: z.string().optional(),
    },
    async ({ media_id, limit, after }) => {
      try {
        return ok(await api().listComments(media_id, limit ?? 25, after));
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.tool(
    "ig_reply_comment",
    "Responde a um comentário (reply).",
    {
      comment_id: z.string().min(1),
      message: z.string().min(1).max(1000),
    },
    async ({ comment_id, message }) => {
      try {
        return ok(await api().replyComment(comment_id, message));
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.tool(
    "ig_hide_comment",
    "Oculta ou reexibe um comentário no post.",
    {
      comment_id: z.string().min(1),
      hide: z.boolean().default(true).describe("true=ocultar, false=reexibir"),
    },
    async ({ comment_id, hide }) => {
      try {
        return ok(await api().hideComment(comment_id, hide ?? true));
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.tool(
    "ig_delete_comment",
    "Apaga um comentário (irreversível).",
    { comment_id: z.string().min(1) },
    async ({ comment_id }) => {
      try {
        return ok(await api().deleteComment(comment_id));
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.tool(
    "ig_list_conversations",
    "Lista conversas/DMs recentes (requer permissão de mensagens). Use after para paginar.",
    {
      limit: z.number().int().min(1).max(50).optional(),
      after: z.string().optional(),
    },
    async ({ limit, after }) => {
      try {
        return ok(await api().listConversations(limit ?? 20, after));
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.tool(
    "ig_get_conversation",
    "Lê mensagens de uma conversa pelo conversation_id.",
    {
      conversation_id: z.string().min(1),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async ({ conversation_id, limit }) => {
      try {
        return ok(await api().getConversationMessages(conversation_id, limit ?? 20));
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.tool(
    "ig_send_dm",
    "Envia DM de texto para um Instagram-scoped user id (IGSID). Só funciona dentro da janela 24h / regras Meta.",
    {
      recipient_id: z.string().min(1).describe("IGSID do destinatário"),
      text: z.string().min(1).max(1000),
    },
    async ({ recipient_id, text }) => {
      try {
        return ok(await api().sendDm(recipient_id, text));
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.tool(
    "ig_media_insights",
    "Insights de um post (reach, likes, saves…). Pode exigir permissão de insights.",
    { media_id: z.string().min(1) },
    async ({ media_id }) => {
      try {
        return ok(await api().mediaInsights(media_id));
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.tool(
    "ig_account_insights",
    "Insights da conta (reach, profile_views, followers…). period=day|week|days_28.",
    {
      period: z.enum(["day", "week", "days_28"]).optional().describe("Padrão: day"),
    },
    async ({ period }) => {
      try {
        return ok(await api().accountInsights(period ?? "day"));
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.tool(
    "ig_audit_snapshot",
    "Snapshot para auditoria (Prompt 1): perfil + posts + top/worst + insights. Ideal antes do prompt diagnostico-100k.",
    {
      media_limit: z.number().int().min(5).max(50).optional().describe("Posts a listar (padrão 24)"),
    },
    async ({ media_limit }) => {
      try {
        return ok(await api().auditSnapshot(media_limit ?? 24));
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.tool(
    "ig_weekly_metrics",
    "Métricas dos últimos 7 dias para a reunião semanal (Prompt 7). Prefira com o prompt reuniao-semanal.",
    {
      media_limit: z.number().int().min(10).max(50).optional().describe("Janela de posts a varrer (padrão 30)"),
    },
    async ({ media_limit }) => {
      try {
        return ok(await api().weeklyMetrics(media_limit ?? 30));
      } catch (e) {
        return fail(e);
      }
    }
  );

  return server;
}
