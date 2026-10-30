/**
 * MCP Instagram remoto (Streamable HTTP) — EasyPanel / Claude Connectors
 * Auth: Authorization: Bearer <MCP_API_KEY>
 */
import { randomUUID } from "node:crypto";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { config as loadDotenv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Request, Response } from "express";
import { loadConfig } from "./config.js";
import { createInstagramMcpServer } from "./server.js";

const here = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: join(here, "..", ".env") });

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const MCP_API_KEY = (process.env.MCP_API_KEY || "").trim();

// Valida credenciais Instagram na subida
loadConfig();
if (!MCP_API_KEY) {
  console.error("Defina MCP_API_KEY (Bearer para Claude/Cursor conectar).");
  process.exit(1);
}

const app = createMcpExpressApp({ host: HOST });
const sessions = new Map<string, { transport: StreamableHTTPServerTransport }>();

function unauthorized(res: Response) {
  res.status(401).json({ error: "Unauthorized. Use Authorization: Bearer <MCP_API_KEY>." });
}

function checkAuth(req: Request, res: Response): boolean {
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7).trim() : "";
  if (!token || token !== MCP_API_KEY) {
    unauthorized(res);
    return false;
  }
  return true;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "instagram-maquina-de-vendas-mcp" });
});

app.post("/mcp", async (req, res) => {
  if (!checkAuth(req, res)) return;
  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId && sessions.has(sessionId)) {
      const { transport } = sessions.get(sessionId)!;
      await transport.handleRequest(req, res, req.body);
      return;
    }

    if (!sessionId && isInitializeRequest(req.body)) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, { transport });
        },
      });
      transport.onclose = () => {
        const id = transport.sessionId;
        if (id) sessions.delete(id);
      };
      const server = createInstagramMcpServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Bad Request: No valid session ID provided" },
      id: null,
    });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/mcp", async (req, res) => {
  if (!checkAuth(req, res)) return;
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !sessions.has(sessionId)) {
    res.status(400).send("Invalid or missing mcp-session-id");
    return;
  }
  const { transport } = sessions.get(sessionId)!;
  await transport.handleRequest(req, res);
});

app.delete("/mcp", async (req, res) => {
  if (!checkAuth(req, res)) return;
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (sessionId && sessions.has(sessionId)) {
    const { transport } = sessions.get(sessionId)!;
    await transport.close();
    sessions.delete(sessionId);
  }
  res.status(204).end();
});

app.listen(PORT, HOST, () => {
  console.log(`MCP Instagram HTTP em http://${HOST}:${PORT}/mcp`);
});
