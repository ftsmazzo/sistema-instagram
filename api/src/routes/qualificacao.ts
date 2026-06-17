import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { listPlaybooksForApi } from "../services/qualificacaoPlaybooks.js";

export async function qualificacaoRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  app.get<{ Querystring: { segmento?: string } }>("/playbooks", async (request, reply) => {
    const segmento = request.query.segmento?.trim();
    return reply.send(listPlaybooksForApi(segmento));
  });
}
