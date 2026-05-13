import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { ensureTables } from "./db/index.js";
import { healthRoutes } from "./routes/health.js";
import { configRoutes } from "./routes/config.js";
import { agentesRoutes } from "./routes/agentes.js";
import { postadorRoutes } from "./routes/postador.js";
import { authRoutes } from "./routes/auth.js";
import { meWorkspaceRoutes } from "./routes/meWorkspace.js";
import { startCronJob } from "./services/cron.js";

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

const JWT_SECRET = process.env.JWT_SECRET?.trim() || "dev-mudar-JWT_SECRET-em-producao";

async function build() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: JWT_SECRET, sign: { expiresIn: "14d" } });
  // multipart registrado apenas nas rotas de upload dentro de postadorRoutes

  await app.register(healthRoutes, { prefix: "/" });
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(meWorkspaceRoutes, { prefix: "/api/me" });
  await app.register(configRoutes, { prefix: "/api/config" });
  await app.register(agentesRoutes, { prefix: "/api/agentes" });
  await app.register(postadorRoutes, { prefix: "/api/postador" });

  startCronJob(app);

  return app;
}

build()
  .then(async (app) => {
    try {
      await ensureTables();
      app.log.info("Tabelas app_config e postador_cronograma verificadas/criadas.");
    } catch (err) {
      if (process.env.DATABASE_URL) {
        app.log.warn({ err }, "Não foi possível criar tabelas no banco (verifique DATABASE_URL). API sobe mesmo assim.");
      }
    }
    return app.listen({ port: PORT, host: HOST });
  })
  .then((address) => {
    console.log(`API FabriaIA rodando em ${address}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
