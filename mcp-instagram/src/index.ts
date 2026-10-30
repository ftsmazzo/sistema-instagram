#!/usr/bin/env node
/**
 * MCP Instagram — transporte stdio (opcional / local)
 */
import { config as loadDotenv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createInstagramMcpServer } from "./server.js";

const here = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: join(here, "..", ".env") });

async function main() {
  loadConfig();
  const server = createInstagramMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
