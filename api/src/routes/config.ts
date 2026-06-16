import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { loadConfig, saveConfig, type ContaInstagramInput, type EmpresaPerfil } from "../store/config.js";
import { toContaInstagramPublic } from "../util/instagramPublic.js";

export async function configRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  // GET – obter configuração (contas sem token; para o painel)
  app.get("/", async (_request, reply) => {
    const config = await loadConfig();
    const contas = config.contas_instagram.map(toContaInstagramPublic);
    return reply.send({
      empresa: config.empresa ?? {
        nome: "",
        nome_fantasia: "",
        segmento: "",
        cidade: "",
        tom_voz: "",
        sobre: "",
        objetivo_qualificacao: "",
        handoff_whatsapp: "",
        link_produto_servico: "",
        agenda_config: { dias_semana: [1, 2, 3, 4, 5], horario_inicio: "09:00", horario_fim: "18:00", duracao_minutos: 60 },
        criterios_qualificacao: "",
      },
      contas_instagram: contas,
      instagram_default_id: config.instagram_default_id ?? null,
      // Retrocompat: primeira conta como "instagram" para quem ainda espera um único
      instagram: contas[0]
        ? { connected: Boolean(contas[0].has_token), ig_user_id: contas[0].ig_user_id }
        : { connected: false },
    });
  });

  // PUT – salvar configuração (empresa, lista de contas, conta padrão)
  app.put("/", async (request, reply) => {
    const body = request.body as {
      empresa?: Partial<EmpresaPerfil>;
      contas_instagram?: ContaInstagramInput[];
      instagram_default_id?: string | null;
      // Retrocompat: um único instagram vira uma conta
      instagram?: { access_token?: string; ig_user_id?: string };
    };
    const update: Parameters<typeof saveConfig>[0] = {};
    if (body.empresa && typeof body.empresa === "object") {
      update.empresa = body.empresa;
    }
    if (body.instagram_default_id !== undefined) {
      update.instagram_default_id = body.instagram_default_id ?? null;
    }
    if (body.contas_instagram) {
      update.contas_instagram = body.contas_instagram;
    } else if (body.instagram && (body.instagram.access_token || body.instagram.ig_user_id)) {
      // Uma única conta vinda do formulário antigo
      const config = await loadConfig();
      const existing = config.contas_instagram[0];
      update.contas_instagram = [
        {
          id: existing?.id,
          nome: existing?.nome ?? "Conta principal",
          ig_user_id: body.instagram.ig_user_id?.trim() ?? existing?.ig_user_id ?? "",
          access_token: body.instagram.access_token?.trim() ?? "",
        },
      ];
    }
    const saved = await saveConfig(update);
    const contas = saved.contas_instagram.map(toContaInstagramPublic);
    return reply.send({
      saved: true,
      received: {
        empresa: saved.empresa,
        contas_instagram: contas,
        instagram_default_id: saved.instagram_default_id,
        instagram: contas[0]
          ? { connected: Boolean(contas[0].has_token), ig_user_id: contas[0].ig_user_id }
          : { connected: false },
      },
    });
  });
}
