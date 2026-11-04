#!/usr/bin/env node
/**
 * Ponte Claude Desktop (stdio) → MCP Instagram HTTP (EasyPanel).
 *
 * Env:
 *   MCP_REMOTE_URL  https://mcp-instagram-mcp.kxryyk.easypanel.host/mcp
 *   MCP_TOKEN       valor de MCP_API_KEY (sem "Bearer ")
 *
 * Alternativa: AUTH_HEADER="Bearer <token>" (como mcp-remote).
 */
import { createInterface } from "node:readline";

const url = (process.env.MCP_REMOTE_URL || "").trim().replace(/\/$/, "");
const tokenRaw = (process.env.MCP_TOKEN || "").trim();
const authHeader =
  (process.env.AUTH_HEADER || "").trim() ||
  (tokenRaw ? (tokenRaw.startsWith("Bearer ") ? tokenRaw : `Bearer ${tokenRaw}`) : "");

let sessionId = null;

function write(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

function reply(id, result) {
  write({ jsonrpc: "2.0", id: id ?? null, result });
}

function fail(id, code, message) {
  write({
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message },
  });
}

function parseBody(texto) {
  const t = texto.trim();
  if (!t) return null;
  if (t.startsWith("event:") || t.includes("\ndata:")) {
    const lines = t.split(/\r?\n/);
    const datas = [];
    for (const line of lines) {
      if (line.startsWith("data:")) datas.push(line.slice(5).trim());
    }
    if (datas.length === 0) return null;
    return JSON.parse(datas[datas.length - 1]);
  }
  return JSON.parse(t);
}

async function remoto(body) {
  if (!url || !authHeader) {
    throw new Error("Defina MCP_REMOTE_URL e MCP_TOKEN (ou AUTH_HEADER).");
  }
  const headers = {
    Authorization: authHeader,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const newSession = res.headers.get("mcp-session-id");
  if (newSession) sessionId = newSession;

  if (res.status === 202) return null;

  const texto = await res.text();
  let json;
  try {
    json = parseBody(texto);
  } catch {
    throw new Error(`Resposta inválida (${res.status}): ${texto.slice(0, 240)}`);
  }
  if (!res.ok) {
    const msg =
      json?.error?.message ||
      json?.error ||
      (typeof json?.erro === "string" ? json.erro : null) ||
      `HTTP ${res.status}`;
    throw new Error(String(msg));
  }
  return json;
}

async function handle(msg) {
  const method = msg.method || "";
  const id = msg.id;
  const params = msg.params || {};

  if (method === "notifications/initialized" || id === undefined) {
    if (method === "notifications/initialized") {
      try {
        await remoto({ jsonrpc: "2.0", method, params });
      } catch {
        /* ignore */
      }
    }
    return;
  }

  if (method === "ping") {
    reply(id, {});
    return;
  }

  try {
    const remotoRes = await remoto({
      jsonrpc: "2.0",
      id: id ?? 1,
      method,
      params,
    });
    if (remotoRes === null) return;
    if (remotoRes.result !== undefined) {
      reply(id, remotoRes.result);
      return;
    }
    if (remotoRes.error) {
      fail(id, remotoRes.error.code ?? -32000, remotoRes.error.message || "erro remoto");
      return;
    }
    reply(id, remotoRes);
  } catch (erro) {
    fail(id, -32000, erro instanceof Error ? erro.message : String(erro));
  }
}

if (!url || !authHeader) {
  console.error("mcp-stdio: defina MCP_REMOTE_URL e MCP_TOKEN");
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (linha) => {
  const texto = linha.trim();
  if (!texto) return;
  let msg;
  try {
    msg = JSON.parse(texto);
  } catch {
    fail(null, -32700, "JSON inválido");
    return;
  }
  void handle(msg);
});
