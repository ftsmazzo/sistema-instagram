export type QualityNivel = "ok" | "aviso" | "erro";

export type QualityIssue = {
  nivel: QualityNivel;
  codigo: string;
  mensagem: string;
};

export type QualityReport = {
  score: number;
  pronto: boolean;
  issues: QualityIssue[];
};

export type ChecarQualidadeInput = {
  caption?: string | null;
  media_type?: "IMAGE" | "REELS" | "CAROUSEL" | string | null;
  media_url?: string | null;
  media_urls?: string[] | null;
};

function contarHashtags(text: string): number {
  const m = text.match(/#[\w\u00C0-\u024F]+/g);
  return m?.length ?? 0;
}

function contarLinhas(text: string): number {
  return text.split(/\n/).filter((l) => l.trim()).length;
}

/** Score de qualidade pré-publicação (legenda + mídia). */
export function checarQualidadePost(input: ChecarQualidadeInput): QualityReport {
  const issues: QualityIssue[] = [];
  let score = 100;

  const caption = (input.caption ?? "").trim();
  const mediaType = input.media_type ?? undefined;
  const urls = [
    ...(input.media_urls ?? []),
    ...(input.media_url ? [input.media_url] : []),
  ].filter(Boolean);

  if (!caption) {
    issues.push({ nivel: "erro", codigo: "caption_vazia", mensagem: "Legenda vazia — adicione caption antes de publicar." });
    score -= 40;
  } else {
    const len = caption.length;
    if (len > 2200) {
      issues.push({ nivel: "erro", codigo: "caption_longa", mensagem: `Legenda com ${len} caracteres (máx. ~2200 no Instagram).` });
      score -= 35;
    } else if (len > 1200) {
      issues.push({ nivel: "aviso", codigo: "caption_textao", mensagem: `Legenda longa (${len} chars). Posts modernos costumam ter 150–400 caracteres.` });
      score -= 15;
    } else if (len < 30) {
      issues.push({ nivel: "aviso", codigo: "caption_curta", mensagem: "Legenda muito curta — considere um hook + CTA para comentários." });
      score -= 8;
    }

    const tags = contarHashtags(caption);
    if (tags > 30) {
      issues.push({ nivel: "erro", codigo: "hashtags_excesso", mensagem: `${tags} hashtags (máx. 30 no Instagram).` });
      score -= 25;
    } else if (tags > 10) {
      issues.push({ nivel: "aviso", codigo: "hashtags_muitas", mensagem: `${tags} hashtags — ideal: 3 a 8 relevantes.` });
      score -= 10;
    } else if (tags === 0) {
      issues.push({ nivel: "aviso", codigo: "hashtags_ausentes", mensagem: "Nenhuma hashtag — adicione 3–5 do nicho para alcance." });
      score -= 5;
    }

    const linhas = contarLinhas(caption);
    if (linhas > 10) {
      issues.push({ nivel: "aviso", codigo: "caption_paragrafos", mensagem: `${linhas} blocos de texto — prefira hook + 2 linhas + CTA.` });
      score -= 10;
    }

    if (!/[.!?👇💬✨]/.test(caption) && !/\?/.test(caption.slice(-80))) {
      issues.push({
        nivel: "aviso",
        codigo: "cta_fraco",
        mensagem: "CTA fraco — termine com pergunta ou convite a comentar (alimenta o agente).",
      });
      score -= 8;
    }
  }

  if (!urls.length) {
    issues.push({ nivel: "erro", codigo: "sem_midia", mensagem: "Nenhuma mídia anexada." });
    score -= 40;
  }

  if (mediaType === "CAROUSEL") {
    const n = input.media_urls?.length ?? urls.length;
    if (n < 2) {
      issues.push({ nivel: "erro", codigo: "carrossel_poucos", mensagem: "Carrossel precisa de pelo menos 2 imagens." });
      score -= 30;
    } else if (n > 10) {
      issues.push({ nivel: "erro", codigo: "carrossel_excesso", mensagem: `${n} slides — Instagram aceita no máximo 10.` });
      score -= 30;
    } else if (n >= 2 && n <= 10) {
      issues.push({ nivel: "ok", codigo: "carrossel_ok", mensagem: `Carrossel com ${n} slides — formato válido.` });
    }
  }

  if (mediaType === "REELS") {
    issues.push({
      nivel: "ok",
      codigo: "reels_ok",
      mensagem: "Reels 9:16 — confira preview antes de publicar.",
    });
  }

  score = Math.max(0, Math.min(100, score));
  const temErro = issues.some((i) => i.nivel === "erro");

  return {
    score,
    pronto: !temErro && score >= 60,
    issues,
  };
}
