import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { join } from "path";
import { gerarCaption as gerarCaptionIA, refazerCaption as refazerCaptionIA, gerarJornadaPorLink } from "../services/caption.js";
import { uploadMedia, getUploadsDir, isStorageConfigured } from "../services/storage.js";
import { rasparPaginaImovel, montarDescricaoParaCaption, baixarEEnviarParaCloudinary } from "../services/imovel.js";
import { publishToInstagram, publishCarouselToInstagram } from "../services/instagram.js";
import { gerarImagemComIA } from "../services/imageGen.js";
import { adicionarTextoCarrossel } from "../services/carouselTexto.js";
import { getContaParaPublicar } from "../store/config.js";
import { resolveConfigStore, getOrgIdFromRequest } from "../context/workspaceConfig.js";
import { upsertPostagemFromPostador } from "../store/crmPostagens.js";
import { appendCronograma, listCronograma } from "../store/cronograma.js";
import { listAgendados, addAgendado, getAgendado, deleteAgendado } from "../store/agendados.js";

function extFromMimetype(mimetype: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
  };
  return map[mimetype.toLowerCase()] ?? ".bin";
}

const SAFE_FILENAME = /^[a-zA-Z0-9._-]+$/;

async function recordCrmPostagemAposPublicar(
  fastify: FastifyInstance,
  orgId: string | null,
  creds: { contaId: string },
  p: {
    id_media: string;
    caption: string;
    media_type: string | null;
    media_url: string | null;
    link_post: string | null;
    data_post: string;
  }
): Promise<void> {
  if (!orgId) return;
  try {
    await upsertPostagemFromPostador({
      organizationId: orgId,
      instagramAccountId: creds.contaId,
      idPost: p.id_media,
      caption: p.caption,
      mediaType: p.media_type,
      mediaUrl: p.media_url,
      linkPost: p.link_post,
      dataPost: p.data_post,
    });
  } catch (err) {
    fastify.log.error({ err }, "crm postagens após publicar");
  }
}

/**
 * Postador: IA no backend, armazenamento (Cloudinary / local / MinIO), Graph API para publicar.
 */
export const postadorRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/postador/media/:filename — serve arquivos do armazenamento local (self-hosted)
  fastify.get<{ Params: { filename: string } }>("/media/:filename", async (request, reply) => {
    const { filename } = request.params;
    if (!filename || !SAFE_FILENAME.test(filename) || filename.includes("..")) {
      return reply.status(400).send({ error: "Nome de arquivo inválido." });
    }
    const dir = getUploadsDir();
    const path = join(dir, filename);
    try {
      const st = await stat(path);
      if (!st.isFile()) return reply.status(404).send({ error: "Não encontrado." });
      const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
      const types: Record<string, string> = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
        ".mp4": "video/mp4", ".mov": "video/quicktime",
      };
      const contentType = types[ext] ?? "application/octet-stream";
      return reply.header("Content-Type", contentType).header("Cache-Control", "public, max-age=86400").send(createReadStream(path));
    } catch {
      return reply.status(404).send({ error: "Não encontrado." });
    }
  });

  // GET /api/postador/cronograma — lista de posts finalizados (para cronograma/histórico)
  fastify.get("/cronograma", async (_request, reply) => {
    const list = await listCronograma();
    return reply.send({ cronograma: list, total: list.length });
  });

  // GET /api/postador/agendados — lista de posts salvos para agendar
  fastify.get("/agendados", async (_request, reply) => {
    const list = await listAgendados();
    return reply.send({ agendados: list, total: list.length });
  });

  // POST /api/postador/agendados — salvar post para agendar (caption, media_url ou media_urls, media_type)
  fastify.post("/agendados", async (request, reply) => {
    const body = request.body as {
      caption?: string;
      media_url?: string;
      media_urls?: string[];
      media_type?: string;
      data_agendamento?: string;
      conta_id?: string;
    };
    const caption = (body?.caption ?? "").trim();
    const media_url = body?.media_url?.trim() || null;
    const media_urls = Array.isArray(body?.media_urls) ? body.media_urls.filter((u) => typeof u === "string" && u.trim()) : null;
    const media_type = body?.media_type === "REELS" ? "REELS" : body?.media_type === "CAROUSEL" ? "CAROUSEL" : "IMAGE";
    const data_agendamento = body?.data_agendamento?.trim() || null;
    const conta_id = body?.conta_id?.trim() || null;

    if (!caption) {
      return reply.status(400).send({ error: "Campo 'caption' é obrigatório para salvar o agendado." });
    }
    if (media_type === "CAROUSEL") {
      if (!media_urls?.length || media_urls.length > 10) {
        return reply.status(400).send({ error: "Carrossel precisa de 1 a 10 URLs de imagem em 'media_urls'." });
      }
    } else if (!media_url) {
      return reply.status(400).send({ error: "Informe 'media_url' (imagem ou vídeo) para salvar o agendado." });
    }

    try {
      const item = await addAgendado({
        caption,
        media_url: media_type === "CAROUSEL" ? null : media_url,
        media_urls: media_type === "CAROUSEL" ? media_urls : null,
        media_type,
        data_agendamento,
        conta_id,
        status: data_agendamento ? 'pendente' : 'draft'
      });
      return reply.send({ ok: true, agendado: item });
    } catch (err) {
      fastify.log.error({ err }, "agendados POST");
      return reply.status(500).send({ error: "Erro ao salvar agendado." });
    }
  });

  // DELETE /api/postador/agendados/:id
  fastify.delete<{ Params: { id: string } }>("/agendados/:id", async (request, reply) => {
    const { id } = request.params;
    const ok = await deleteAgendado(id);
    if (!ok) return reply.status(404).send({ error: "Agendado não encontrado." });
    return reply.send({ ok: true });
  });

  // POST /api/postador/agendados/:id/publicar — publicar um agendado agora (body: conta_id opcional)
  fastify.post<{ Params: { id: string } }>("/agendados/:id/publicar", async (request, reply) => {
    const { id } = request.params;
    const body = request.body as { conta_id?: string };
    const agendado = await getAgendado(id);
    if (!agendado) {
      return reply.status(404).send({ error: "Agendado não encontrado." });
    }

    const config = await resolveConfigStore(fastify, request);
    const creds = getContaParaPublicar(config, body?.conta_id);
    if (!creds) {
      return reply.status(400).send({
        error: "Nenhuma conta Instagram configurada ou conta não encontrada. Configure em Administração.",
      });
    }
    const { token, igUserId } = creds;
    const orgId = await getOrgIdFromRequest(fastify, request);

    try {
      if (agendado.media_type === "CAROUSEL" && agendado.media_urls?.length) {
        const result = await publishCarouselToInstagram(agendado.caption, agendado.media_urls, token, igUserId);
        const dataPost = new Date().toISOString();
        await appendCronograma({
          caption: agendado.caption,
          media_url: null,
          media_type: "CAROUSEL",
          id_container: result.id_container,
          link_post: result.link_post,
          data_post: dataPost,
        });
        await recordCrmPostagemAposPublicar(fastify, orgId, creds, {
          id_media: result.id_media,
          caption: agendado.caption,
          media_type: "CAROUSEL",
          media_url: agendado.media_urls[0] ?? null,
          link_post: result.link_post,
          data_post: dataPost,
        });
        await deleteAgendado(id);
        return reply.send({ ok: true, id_container: result.id_container, id_media: result.id_media, link_post: result.link_post, message: "Carrossel publicado." });
      }
      const mediaUrl = agendado.media_url;
      if (!mediaUrl) {
        return reply.status(400).send({ error: "Agendado sem mídia." });
      }
      const result = await publishToInstagram(agendado.caption, mediaUrl, agendado.media_type === "REELS" ? "REELS" : "IMAGE", token, igUserId);
      const dataPost = new Date().toISOString();
      await appendCronograma({
        caption: agendado.caption,
        media_url: mediaUrl,
        media_type: agendado.media_type,
        id_container: result.id_container,
        link_post: result.link_post,
        data_post: dataPost,
      });
      await recordCrmPostagemAposPublicar(fastify, orgId, creds, {
        id_media: result.id_media,
        caption: agendado.caption,
        media_type: agendado.media_type,
        media_url: mediaUrl,
        link_post: result.link_post,
        data_post: dataPost,
      });
      await deleteAgendado(id);
      return reply.send({ ok: true, id_container: result.id_container, id_media: result.id_media, link_post: result.link_post, message: "Post publicado." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao publicar.";
      fastify.log.error({ err }, "agendados publicar");
      return reply.status(500).send({ error: msg });
    }
  });

  // POST /api/postador/upload-midia — multipart: um arquivo de imagem/vídeo; retorna { media_url } (Cloudinary ou MinIO)
  fastify.post("/upload-midia", async (request, reply) => {
    const contentType = request.headers["content-type"] ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return reply.status(400).send({ error: "Envie um arquivo via multipart/form-data." });
    }
    let mediaUrl: string | undefined;
    const parts = request.parts();
    for await (const part of parts) {
      if (part.type === "file") {
        const mimetype = part.mimetype ?? "application/octet-stream";
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const buffer = Buffer.concat(chunks);
        const ext = extFromMimetype(mimetype);
        mediaUrl = await uploadMedia(buffer, mimetype, ext);
        break;
      }
    }
    if (!mediaUrl) {
      return reply.status(400).send({ error: "Nenhum arquivo enviado ou armazenamento não configurado." });
    }
    return reply.send({ media_url: mediaUrl });
  });

  // POST /api/postador/gerar-imagem — gera imagem com IA (openai = DALL·E, gemini = Imagen) e retorna URL (Cloudinary)
  fastify.post("/gerar-imagem", async (request, reply) => {
    const body = request.body as { prompt?: string; provider?: string };
    const prompt = (body?.prompt ?? "").trim();
    const provider = (body?.provider === "gemini" ? "gemini" : "openai") as "openai" | "gemini";
    if (!prompt) {
      return reply.status(400).send({ error: "Campo 'prompt' é obrigatório (descrição da imagem desejada)." });
    }
    try {
      const media_url = await gerarImagemComIA(prompt, provider);
      return reply.send({ media_url });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao gerar imagem.";
      if (msg.includes("OPENAI_API_KEY") || msg.includes("GEMINI_API_KEY") || msg.includes("Cloudinary")) {
        return reply.status(503).send({ error: msg });
      }
      fastify.log.error({ err }, "gerar-imagem");
      return reply.status(500).send({ error: msg });
    }
  });

  // POST /api/postador/carousel-adicionar-texto — overlay de texto em cada imagem usando template SVG
  fastify.post("/carousel-adicionar-texto", async (request, reply) => {
    const body = request.body as { image_urls?: string[]; texts?: string[] };
    const imageUrls = Array.isArray(body?.image_urls) ? body.image_urls.filter((u) => typeof u === "string" && u.trim()) : [];
    const texts = Array.isArray(body?.texts) ? body.texts.map((t) => (typeof t === "string" ? t : "")) : [];
    if (!imageUrls.length) {
      return reply.status(400).send({ error: "Campo 'image_urls' (array) é obrigatório." });
    }
    try {
      const newUrls = await adicionarTextoCarrossel(imageUrls, texts);
      return reply.send({ image_urls: newUrls });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao adicionar texto nas imagens.";
      if (msg.includes("Cloudinary")) return reply.status(503).send({ error: msg });
      fastify.log.error({ err }, "carousel-adicionar-texto");
      return reply.status(500).send({ error: msg });
    }
  });

  // POST /api/postador/por-url — JSON { url, provider?, model? }. Raspa página do imóvel, baixa imagem → Cloudinary, gera caption.
  fastify.post("/por-url", async (request, reply) => {
    const body = request.body as { url?: string; provider?: string; model?: string };
    const url = body?.url?.trim();
    if (!url) {
      return reply.status(400).send({ error: "Campo 'url' é obrigatório (link da página de detalhes do imóvel)." });
    }
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return reply.status(400).send({ error: "URL inválida." });
    }
    const provider = body?.provider?.trim();
    const model = body?.model?.trim();
    const providerNorm = provider === "claude" ? "claude" : undefined;

    try {
      const dados = await rasparPaginaImovel(url);
      const descricao = montarDescricaoParaCaption(dados);
      if (!descricao.trim()) {
        return reply.status(400).send({ error: "Não foi possível extrair dados da página. Verifique se a URL é de um imóvel." });
      }

      const urlsOriginais =
        dados.imageUrls.length > 0 ? dados.imageUrls : dados.imageUrl ? [dados.imageUrl] : [];
      const uploaded: string[] = [];
      if (urlsOriginais.length > 0 && isStorageConfigured()) {
        for (const src of urlsOriginais.slice(0, 10)) {
          try {
            const { url: publicUrl } = await baixarEEnviarParaCloudinary(src);
            uploaded.push(publicUrl);
          } catch (e) {
            fastify.log.warn({ err: e, src: src.slice(0, 80) }, "por-url: imagem da galeria ignorada");
          }
        }
      }

      const journey = await gerarJornadaPorLink(descricao, {
        provider: providerNorm ?? (provider === "openai" ? "openai" : undefined),
        model: model || undefined,
      });

      const responsePosts = journey.map((post, i) => {
        let postUrls: string[] = [];
        if (uploaded.length > 0) {
           if (uploaded.length >= 3) {
             const chunkSize = Math.ceil(uploaded.length / 3);
             postUrls = uploaded.slice(i * chunkSize, (i + 1) * chunkSize);
             // fallback caso a divisão deixe o último vazio
             if (postUrls.length === 0) postUrls = [uploaded[uploaded.length - 1]];
           } else {
             postUrls = [uploaded[i % uploaded.length]];
           }
        }
        
        return {
          post_number: post.post_number,
          estrategia: post.estrategia,
          caption: post.caption,
          media_urls: postUrls.length > 1 ? postUrls : undefined,
          media_url: postUrls.length === 1 ? postUrls[0] : undefined,
          media_type: postUrls.length > 1 ? "CAROUSEL" : "IMAGE"
        };
      });

      return reply.send({ jornada: responsePosts });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao processar URL do imóvel";
      if (msg.includes("OPENAI_API_KEY") || msg.includes("ANTHROPIC_API_KEY")) {
        return reply.status(503).send({ error: msg });
      }
      if (msg.includes("Cloudinary")) {
        return reply.status(503).send({ error: msg });
      }
      fastify.log.error({ err }, "por-url");
      return reply.status(500).send({ error: msg });
    }
  });

  // POST /api/postador/gerar-caption — JSON { descricao, provider?, model? } OU multipart (descricao + arquivo(s) + provider + model)
  // Vários arquivos de imagem → carrossel (media_urls, media_type CAROUSEL). Um vídeo → REELS. Uma imagem → IMAGE.
  fastify.post("/gerar-caption", async (request, reply) => {
    const contentType = request.headers["content-type"] ?? "";
    let descricao = "";
    let mediaType: "IMAGE" | "REELS" | "CAROUSEL" | undefined;
    let mediaUrl: string | undefined;
    let mediaUrls: string[] | undefined;
    let provider: string | undefined;
    let model: string | undefined;
    const uploadedUrls: string[] = [];

    if (contentType.includes("multipart/form-data")) {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === "field") {
          const v = String(part.value ?? "").trim();
          if (part.fieldname === "descricao") descricao = v;
          else if (part.fieldname === "provider") provider = v;
          else if (part.fieldname === "model") model = v;
        }
        if (part.type === "file") {
          const mimetype = part.mimetype ?? "application/octet-stream";
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          const buffer = Buffer.concat(chunks);
          const ext = extFromMimetype(mimetype);
          if (mimetype.startsWith("video/")) {
            if (uploadedUrls.length > 0) {
              return reply.status(400).send({ error: "Não misture vídeo com várias imagens. Envie um vídeo ou apenas imagens para carrossel." });
            }
            mediaType = "REELS";
            mediaUrl = await uploadMedia(buffer, mimetype, ext);
            break;
          }
          if (mimetype.startsWith("image/")) {
            if (mediaType === "REELS") {
              return reply.status(400).send({ error: "Não misture vídeo com imagens." });
            }
            const url = await uploadMedia(buffer, mimetype, ext);
            uploadedUrls.push(url);
          }
        }
      }
      if (uploadedUrls.length > 1) {
        mediaType = "CAROUSEL";
        mediaUrls = uploadedUrls;
      } else if (uploadedUrls.length === 1) {
        mediaType = "IMAGE";
        mediaUrl = uploadedUrls[0];
      }
    } else {
      const body = request.body as { descricao?: string; provider?: string; model?: string };
      descricao = (body?.descricao ?? "").trim();
      provider = body?.provider?.trim();
      model = body?.model?.trim();
    }

    if (!descricao) {
      return reply.status(400).send({ error: "Campo 'descricao' é obrigatório" });
    }

    const providerNorm = provider === "claude" ? "claude" : undefined;
    try {
      const captionTipo =
        mediaType === "CAROUSEL" ? "CAROUSEL" : mediaType === "REELS" ? "REELS" : "IMAGE";
      const caption = await gerarCaptionIA(descricao, captionTipo, {
        provider: providerNorm ?? (provider === "openai" ? "openai" : undefined),
        model: model || undefined,
      });
      const payload: { caption: string; media_url?: string; media_urls?: string[]; media_type?: string } = {
        caption,
        media_type: mediaType,
      };
      if (mediaUrls?.length) payload.media_urls = mediaUrls;
      else if (mediaUrl) payload.media_url = mediaUrl;
      return reply.send(payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao gerar caption";
      if (msg.includes("OPENAI_API_KEY") || msg.includes("ANTHROPIC_API_KEY")) {
        return reply.status(503).send({ error: msg });
      }
      if (msg.includes("MINIO") || msg.includes("CLOUDINARY")) {
        return reply.status(503).send({ error: msg });
      }
      fastify.log.error({ err }, "gerar-caption");
      return reply.status(500).send({ error: msg });
    }
  });

  // POST /api/postador/refazer-caption — JSON: { caption_atual, feedback, provider?, model? }
  fastify.post("/refazer-caption", async (request, reply) => {
    const body = request.body as {
      caption_atual?: string;
      feedback?: string;
      provider?: string;
      model?: string;
    };
    const captionAtual = body?.caption_atual ?? "";
    const feedback = body?.feedback ?? "";
    const provider = body?.provider?.trim();
    const model = body?.model?.trim();

    if (!captionAtual.trim() || !feedback.trim()) {
      return reply.status(400).send({
        error: "Campos 'caption_atual' e 'feedback' são obrigatórios",
      });
    }

    const providerNorm = provider === "claude" ? "claude" : provider === "openai" ? "openai" : undefined;
    try {
      const caption = await refazerCaptionIA(captionAtual, feedback, {
        provider: providerNorm,
        model: model || undefined,
      });
      return reply.send({
        caption,
        media_url: undefined,
        media_type: undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao refazer caption";
      if (msg.includes("OPENAI_API_KEY") || msg.includes("ANTHROPIC_API_KEY")) {
        return reply.status(503).send({ error: msg });
      }
      fastify.log.error({ err }, "refazer-caption");
      return reply.status(500).send({ error: msg });
    }
  });

  // POST /api/postador/publicar — JSON: { caption, media_url?, media_urls?, media_type?, conta_id? }
  // Se media_urls (array com 2+ itens): publica carrossel. conta_id: qual conta Instagram usar.
  fastify.post("/publicar", async (request, reply) => {
    const body = request.body as { caption?: string; media_url?: string; media_urls?: string[]; media_type?: string; conta_id?: string };
    const caption = (body?.caption ?? "").trim();
    const mediaUrl = body?.media_url?.trim();
    const mediaUrls = Array.isArray(body?.media_urls) ? body.media_urls.filter((u) => typeof u === "string" && u.trim()) : [];
    const mediaType = (body?.media_type === "REELS" ? "REELS" : "IMAGE") as "IMAGE" | "REELS";
    const isCarousel = mediaUrls.length > 1;

    if (!caption) {
      fastify.log.info({ reason: "caption_empty" }, "publicar 400");
      return reply.status(400).send({ error: "Campo 'caption' é obrigatório para publicar" });
    }
    if (isCarousel) {
      if (mediaUrls.length > 10) {
        return reply.status(400).send({ error: "Carrossel pode ter no máximo 10 imagens." });
      }
    } else if (!mediaUrl) {
      fastify.log.info({ reason: "media_url_missing" }, "publicar 400");
      return reply.status(400).send({
        error: "Para publicar no feed é necessário uma imagem ou vídeo. Envie um arquivo ao gerar o caption.",
      });
    }

    const config = await resolveConfigStore(fastify, request);
    const creds = getContaParaPublicar(config, body?.conta_id);
    if (!creds) {
      fastify.log.info({ reason: "instagram_credentials_missing" }, "publicar 400");
      return reply.status(400).send({
        error: "Nenhuma conta Instagram configurada ou conta não encontrada. Configure em Administração.",
      });
    }
    const { token, igUserId } = creds;
    const orgId = await getOrgIdFromRequest(fastify, request);

    try {
      if (isCarousel) {
        const result = await publishCarouselToInstagram(caption, mediaUrls, token, igUserId);
        const dataPost = new Date().toISOString();
        await appendCronograma({
          caption,
          media_url: null,
          media_type: "CAROUSEL",
          id_container: result.id_container,
          link_post: result.link_post,
          data_post: dataPost,
        });
        await recordCrmPostagemAposPublicar(fastify, orgId, creds, {
          id_media: result.id_media,
          caption,
          media_type: "CAROUSEL",
          media_url: mediaUrls[0] ?? null,
          link_post: result.link_post,
          data_post: dataPost,
        });
        return reply.send({
          ok: true,
          id_container: result.id_container,
          id_media: result.id_media,
          link_post: result.link_post,
          message: "Carrossel publicado no Instagram.",
        });
      }
      const result = await publishToInstagram(caption, mediaUrl!, mediaType, token, igUserId);
      const dataPost = new Date().toISOString();
      await appendCronograma({
        caption,
        media_url: mediaUrl!,
        media_type: mediaType,
        id_container: result.id_container,
        link_post: result.link_post,
        data_post: dataPost,
      });
      await recordCrmPostagemAposPublicar(fastify, orgId, creds, {
        id_media: result.id_media,
        caption,
        media_type: mediaType,
        media_url: mediaUrl!,
        link_post: result.link_post,
        data_post: dataPost,
      });
      return reply.send({
        ok: true,
        id_container: result.id_container,
        id_media: result.id_media,
        link_post: result.link_post,
        message: "Post publicado no Instagram.",
      });
    } catch (err) {
      let msg = err instanceof Error ? err.message : "Erro ao publicar no Instagram";
      if (msg.includes("Only photo or video")) {
        msg += " A URL da mídia precisa ser pública (HTTPS), acessível sem login, e devolver imagem/vídeo real — teste o link em aba anônima. Se usar armazenamento local na API, confira POSTADOR_MEDIA_BASE_URL e firewall.";
      }
      if (msg.includes("Malformed access token")) {
        msg += " Cole o token de acesso do Instagram novamente em Administração (sem espaços ou quebras de linha no início/fim).";
      }
      fastify.log.error({ err }, "publicar");
      return reply.status(500).send({ error: msg });
    }
  });
};
