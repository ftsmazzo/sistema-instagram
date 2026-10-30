#!/usr/bin/env node
/**
 * MCP Instagram — Máquina de Vendas (Meta Graph API)
 * Transporte: stdio (Claude Desktop / Cursor)
 */
import { config as loadDotenv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { InstagramGraph } from "./graph.js";

// Carrega mcp-instagram/.env se existir (não sobrescreve env já definido no Claude/Cursor)
const here = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: join(here, "..", ".env") });

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

const server = new McpServer({
  name: "instagram-maquina-de-vendas",
  version: "1.0.0",
});

let graph: InstagramGraph | null = null;

function api(): InstagramGraph {
  if (!graph) graph = new InstagramGraph(loadConfig());
  return graph;
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
  "Lista posts recentes da conta (id, caption, tipo, permalink, likes/comentários).",
  { limit: z.number().int().min(1).max(50).optional().describe("Quantidade (padrão 12)") },
  async ({ limit }) => {
    try {
      return ok(await api().listMedia(limit ?? 12));
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
  "ig_list_comments",
  "Lista comentários de um post.",
  {
    media_id: z.string().min(1),
    limit: z.number().int().min(1).max(50).optional(),
  },
  async ({ media_id, limit }) => {
    try {
      return ok(await api().listComments(media_id, limit ?? 25));
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
  "ig_list_conversations",
  "Lista conversas/DMs recentes da conta (requer permissão de mensagens).",
  { limit: z.number().int().min(1).max(50).optional() },
  async ({ limit }) => {
    try {
      return ok(await api().listConversations(limit ?? 20));
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
  "Envia DM de texto para um Instagram-scoped user id (IGSID). Só funciona dentro da janela de 24h / regras da Meta.",
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
  "Insights de um post (impressions, reach, etc.). Pode exigir permissão de insights aprovada.",
  { media_id: z.string().min(1) },
  async ({ media_id }) => {
    try {
      return ok(await api().mediaInsights(media_id));
    } catch (e) {
      return fail(e);
    }
  }
);

async function main() {
  // Valida env cedo para falha clara no Claude Desktop
  loadConfig();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
