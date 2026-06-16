import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { api, getAuthToken, type AgendadoItem, type ContaInstagramRes, type Config, type PostadorNicheParams, type PostadorNicheRes } from "../api/client";
import { PageShell } from "../components/layout/PageShell";

const STORAGE_KEY = "postador_ia";

const PROVIDERS = [
  { id: "openai", label: "OpenAI (GPT)" },
  { id: "claude", label: "Claude (Anthropic)" },
] as const;

const MODELS_OPENAI = [
  { id: "gpt-4.1", label: "GPT-4.1" },
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gpt-4o-mini", label: "GPT-4o mini" },
];

const MODELS_CLAUDE = [
  { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
  { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
  { id: "claude-3-opus-20240229", label: "Claude 3 Opus" },
];

function loadSavedIA(): { provider: string; model: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { provider?: string; model?: string };
      if (parsed.provider && parsed.model) return { provider: parsed.provider, model: parsed.model };
    }
  } catch {
    // ignore
  }
  return { provider: "openai", model: "gpt-4.1" };
}

function saveIA(provider: string, model: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ provider, model }));
  } catch {
    // ignore
  }
}

type Step = "form" | "review" | "published";
/** Passos do assistente antes de gerar (só em step === "form") */
type WizardStep = 1 | 2 | 3 | 4;
type ContentMode = "descricao" | "link";

export function Postador() {
  const [descricao, setDescricao] = useState("");
  const [urlImovel, setUrlImovel] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [criarMidiaIA, setCriarMidiaIA] = useState(false);
  const [tipoMidiaIA, setTipoMidiaIA] = useState<"imagem" | "video">("imagem");
  const [provedorImagem, setProvedorImagem] = useState<"openai" | "gemini">("gemini");
  const [provedorVideo, setProvedorVideo] = useState<"slideshow" | "veo" | "sora">("slideshow");
  const [duracaoVideo, setDuracaoVideo] = useState<4 | 8 | 12>(8);
  const [ultimoCustoVideo, setUltimoCustoVideo] = useState<number | null>(null);
  const [instrucoesImagem, setInstrucoesImagem] = useState("");
  const [textosCarrossel, setTextosCarrossel] = useState<string[]>([]);
  const [caption, setCaption] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [mediaType, setMediaType] = useState<"IMAGE" | "REELS" | "CAROUSEL" | undefined>(undefined);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [contentMode, setContentMode] = useState<ContentMode>("descricao");
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [step, setStep] = useState<Step>("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [linkPost, setLinkPost] = useState<string | null>(null);
  const [agendadoSuccess, setAgendadoSuccess] = useState<string | null>(null);
  const [dataAgendamento, setDataAgendamento] = useState("");
  const [promptImagemIA, setPromptImagemIA] = useState("");
  const [jornadaQueue, setJornadaQueue] = useState<any[]>([]);
  const [jornadaIndex, setJornadaIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [contasInstagram, setContasInstagram] = useState<ContaInstagramRes[]>([]);
  const [contaPadraoId, setContaPadraoId] = useState<string | null>(null);
  const [contaSelecionadaId, setContaSelecionadaId] = useState<string | null>(null);

  const [provider, setProvider] = useState(loadSavedIA().provider);
  const [model, setModel] = useState(loadSavedIA().model);

  const [niches, setNiches] = useState<PostadorNicheRes[]>([]);
  const [nicheId, setNicheId] = useState("");
  const [templateKey, setTemplateKey] = useState("");
  const [segmento, setSegmento] = useState("");
  const [marcaNome, setMarcaNome] = useState("");

  const modelsList = provider === "claude" ? MODELS_CLAUDE : MODELS_OPENAI;
  const currentModelInList = modelsList.some((m) => m.id === model);
  const effectiveModel = currentModelInList ? model : modelsList[0]?.id ?? model;

  const nichePack = niches.find((n) => n.id === nicheId);
  const templatesDoNicho = nichePack?.templates ?? [];

  const nicheParams = (): PostadorNicheParams => ({
    niche_id: nicheId || undefined,
    template_id: templateKey || undefined,
    segmento: segmento || undefined,
    marca_nome: marcaNome || undefined,
  });

  useEffect(() => {
    saveIA(provider, model);
  }, [provider, model]);

  useEffect(() => {
    if (!currentModelInList && modelsList.length) setModel(modelsList[0].id);
  }, [provider]);

  useEffect(() => {
    if (previewUrls.length > 1 && textosCarrossel.length !== previewUrls.length) {
      setTextosCarrossel((prev) => {
        const next = [...prev];
        while (next.length < previewUrls.length) next.push("");
        return next.slice(0, previewUrls.length);
      });
    }
  }, [previewUrls.length]);

  useEffect(() => {
    const applyConfig = (c: Config) => {
      const contas = c.contas_instagram ?? [];
      setContasInstagram(contas);
      const defaultId = c.instagram_default_id ?? contas[0]?.id ?? null;
      setContaPadraoId(defaultId);
      setContaSelecionadaId((prev) => (prev && contas.some((x) => x.id === prev)) ? prev : defaultId);
      const seg = c.empresa?.segmento?.trim() ?? "";
      const marca = (c.empresa?.nome_fantasia || c.empresa?.nome || "").trim();
      setSegmento(seg);
      setMarcaNome(marca);
      api.postador
        .getNiches(seg || undefined)
        .then((res) => {
          setNiches(res.niches);
          const suggested = res.suggested_niche_id ?? res.niches[0]?.id ?? "";
          setNicheId((prevNiche) => {
            const id = prevNiche && res.niches.some((n) => n.id === prevNiche) ? prevNiche : suggested;
            const pack = res.niches.find((n) => n.id === id) ?? res.niches[0];
            setTemplateKey((tplPrev) =>
              tplPrev && pack?.templates.some((t) => t.key === tplPrev)
                ? tplPrev
                : pack?.templates[0]?.key ?? ""
            );
            return id;
          });
        })
        .catch(() => {
          /* niches opcionais */
        });
    };
    (async () => {
      try {
        const status = await api.getAuthStatus();
        if (status.database && status.authMode === "workspace" && getAuthToken()) {
          const c = await api.getMeWorkspace();
          applyConfig(c);
          return;
        }
      } catch {
        /* segue para legado */
      }
      try {
        const c = await api.getConfig();
        applyConfig(c);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const handleGerarCaption = async () => {
    if (!descricao.trim()) {
      setError("Informe a descrição do que deseja postar.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      let urlGerada: string | null = null;
      let tipoGerado: "IMAGE" | "REELS" | undefined;
      if (criarMidiaIA) {
        const prompt = (instrucoesImagem || descricao).trim();
        if (tipoMidiaIA === "video") {
          const imageUrls: string[] = [];
          for (const f of arquivos.filter((a) => a.type.startsWith("image/"))) {
            const up = await api.postador.uploadMidia(f);
            imageUrls.push(up.media_url);
          }
          const resVid = await api.postador.gerarVideo({
            prompt,
            provider: provedorVideo,
            image_urls: imageUrls.length ? imageUrls : undefined,
            duration_seconds: duracaoVideo,
            auto_imagem_slideshow: provedorVideo === "slideshow",
            ...nicheParams(),
          });
          urlGerada = resVid.media_url;
          tipoGerado = "REELS";
          setUltimoCustoVideo(resVid.custo_estimado_usd);
        } else {
          const resImg = await api.postador.gerarImagem(prompt, provedorImagem, nicheParams());
          urlGerada = resImg.media_url;
          setUltimoCustoVideo(null);
        }
      }
      const files = arquivos.length ? arquivos : undefined;
      const res = await api.postador.gerarCaption(
        descricao.trim(),
        files,
        provider,
        effectiveModel,
        nicheParams()
      );
      setCaption(res.caption);
      setMediaUrl(res.media_url ?? urlGerada ?? null);
      setMediaUrls(res.media_urls ?? (urlGerada ? [urlGerada] : []));
      const tipo =
        tipoGerado ??
        (res.media_type === "REELS" ? "REELS" : res.media_type === "CAROUSEL" ? "CAROUSEL" : "IMAGE");
      setMediaType(tipo);
      if (tipo === "CAROUSEL" && res.media_urls?.length) {
        setPreviewUrls(res.media_urls);
      } else if (res.media_url) {
        setPreviewUrls([res.media_url]);
      } else if (urlGerada) {
        setPreviewUrls([urlGerada]);
      } else if (arquivos.length === 1 && arquivos[0].type.startsWith("image/")) {
        setPreviewUrls([URL.createObjectURL(arquivos[0])]);
      } else {
        setPreviewUrls([]);
      }
      const numPreviews = (tipo === "CAROUSEL" && res.media_urls?.length) ? res.media_urls.length : (res.media_url || urlGerada || (arquivos.length === 1 && arquivos[0]?.type.startsWith("image/"))) ? 1 : 0;
      setTextosCarrossel(new Array(numPreviews).fill(""));
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar caption.");
    } finally {
      setLoading(false);
    }
  };

  const handleRefazer = async () => {
    if (!caption || !feedback.trim()) {
      setError("Digite o que deseja alterar ou melhorar no caption.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await api.postador.refazerCaption(caption, feedback.trim(), undefined, provider, effectiveModel, nicheParams());
      setCaption(res.caption);
      setFeedback("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao refazer caption.");
    } finally {
      setLoading(false);
    }
  };

  const temMidiaParaPublicar = mediaUrl || mediaUrls.length > 0;
  const isCarousel = mediaType === "CAROUSEL" && mediaUrls.length > 1;

  const avancarFilaJornada = () => {
    if (jornadaQueue.length === 0) return false;
    const proximoIndex = jornadaIndex;
    if (proximoIndex < jornadaQueue.length) {
      const next = jornadaQueue[proximoIndex];
      setCaption(next.caption);
      setMediaType(next.media_type);
      if (next.media_type === "CAROUSEL" && next.media_urls) {
        setMediaUrls(next.media_urls);
        setMediaUrl(null);
        setPreviewUrls(next.media_urls);
        setTextosCarrossel(new Array(next.media_urls.length).fill(""));
      } else {
        setMediaUrl(next.media_url || null);
        setMediaUrls(next.media_url ? [next.media_url] : []);
        setPreviewUrls(next.media_url ? [next.media_url] : []);
        setTextosCarrossel(next.media_url ? [""] : []);
      }
      setJornadaIndex(proximoIndex + 1);
      setDataAgendamento(""); 
      setFeedback("");
      window.scrollTo(0, 0);
      return true;
    }
    setJornadaQueue([]);
    setJornadaIndex(0);
    return false;
  };

  const handlePublicar = async () => {
    if (!caption) return;
    if (!temMidiaParaPublicar) {
      setError("É necessário pelo menos uma imagem ou vídeo para publicar.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const payload = isCarousel
        ? { caption, media_urls: mediaUrls, media_type: "CAROUSEL" as const, conta_id: contaSelecionadaId }
        : { caption, media_url: mediaUrl!, media_type: (mediaType ?? "IMAGE") as "IMAGE" | "REELS", conta_id: contaSelecionadaId };
      const res = await api.postador.publicar(payload);
      setLinkPost(res.link_post ?? null);
      if (!avancarFilaJornada()) {
        setStep("published");
      } else {
        setAgendadoSuccess("Post publicado! Agora revise o próximo post da jornada.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao publicar.");
    } finally {
      setLoading(false);
    }
  };

  const handleSalvarAgendar = async () => {
    if (!caption) return;
    if (!temMidiaParaPublicar) {
      setError("Salve com pelo menos uma mídia para poder agendar.");
      return;
    }
    setError(null);
    setAgendadoSuccess(null);
    setLoading(true);
    try {
      const dateIso = dataAgendamento ? new Date(dataAgendamento).toISOString() : undefined;
      const payload = isCarousel
        ? { caption, media_urls: mediaUrls, media_type: "CAROUSEL" as const, data_agendamento: dateIso, conta_id: contaSelecionadaId }
        : { caption, media_url: mediaUrl!, media_type: (mediaType ?? "IMAGE") as "IMAGE" | "REELS", data_agendamento: dateIso, conta_id: contaSelecionadaId };
      await api.postador.saveAgendado(payload);
      if (!avancarFilaJornada()) {
        setAgendadoSuccess(dateIso ? "Post agendado com sucesso para a data informada." : "Post salvo. Você pode publicá-lo na seção «Posts agendados».");
        setStep("form");
        setWizardStep(1);
      } else {
        setAgendadoSuccess(`Post ${jornadaIndex} salvo! Revisando agora o ${jornadaIndex + 1} de ${jornadaQueue.length}.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar agendado.");
    } finally {
      setLoading(false);
    }
  };

  const handleGerarPorUrl = async () => {
    const raw = urlImovel.trim();
    if (!raw) {
      setError("Cole o link da página de produto ou serviço.");
      return;
    }
    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, "")}`;
    setError(null);
    setLoading(true);
    try {
      const res = await api.postador.gerarPorUrl(normalized, provider, effectiveModel, nicheParams());
      if (res.jornada && res.jornada.length > 0) {
        setJornadaQueue(res.jornada);
        setJornadaIndex(1);
        
        const first = res.jornada[0];
        setCaption(first.caption);
        setMediaType(first.media_type);
        if (first.media_type === "CAROUSEL" && first.media_urls) {
          setMediaUrls(first.media_urls);
          setMediaUrl(null);
          setPreviewUrls(first.media_urls);
          setTextosCarrossel(new Array(first.media_urls.length).fill(""));
        } else {
          setMediaUrl(first.media_url || null);
          setMediaUrls(first.media_url ? [first.media_url] : []);
          setPreviewUrls(first.media_url ? [first.media_url] : []);
          setTextosCarrossel(first.media_url ? [""] : []);
        }
        setStep("review");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar jornada a partir do link.");
    } finally {
      setLoading(false);
    }
  };

  const handleGerarCTAParaImagem = async (index: number) => {
    if (!caption) return;
    setLoading(true);
    try {
      const res = await api.postador.gerarCTA(caption, provider, effectiveModel, nicheParams());
      setTextosCarrossel(prev => {
        const next = [...prev];
        next[index] = res.cta;
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar CTA.");
    } finally {
      setLoading(false);
    }
  };

  const handleExcluirImagem = () => {
    setMediaUrl(null);
    setMediaUrls([]);
    setPreviewUrls([]);
  };

  const handleGerarImagemIA = async () => {
    const prompt = promptImagemIA.trim();
    if (!prompt) {
      setError("Descreva a CENA visual (produto + ambiente + luz), não a ficha técnica inteira.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await api.postador.gerarImagem(prompt, provedorImagem, nicheParams());
      setMediaUrl(res.media_url);
      setMediaUrls([res.media_url]);
      setPreviewUrls([res.media_url]);
      setPromptImagemIA("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar imagem.");
    } finally {
      setLoading(false);
    }
  };

  const handleAplicarMolduraFeed = async () => {
    const text = textosCarrossel[0]?.trim();
    if (!mediaUrl && !mediaUrls[0]) {
      setError("Nenhuma imagem para aplicar moldura.");
      return;
    }
    if (!text) {
      setError("Digite ou gere um texto para a moldura visual.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const url = mediaUrl ?? mediaUrls[0];
      const res = await api.postador.carouselAdicionarTexto([url], [text], nicheParams());
      const newUrl = res.image_urls[0] ?? url;
      setMediaUrl(newUrl);
      setMediaUrls([newUrl]);
      setPreviewUrls([newUrl]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao aplicar moldura.");
    } finally {
      setLoading(false);
    }
  };

  const handleAplicarTextoCarrossel = async () => {
    if (mediaUrls.length < 2) return;
    setError(null);
    setLoading(true);
    try {
      const res = await api.postador.carouselAdicionarTexto(mediaUrls, textosCarrossel, nicheParams());
      const urls = res.image_urls ?? [];
      setMediaUrls(urls);
      setPreviewUrls(urls);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao adicionar texto nas imagens.");
    } finally {
      setLoading(false);
    }
  };

  const handleIncluirImagem = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Envie apenas imagens (JPEG, PNG, etc.).");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await api.postador.uploadMidia(file);
      setMediaUrl(res.media_url);
      setMediaUrls([res.media_url]);
      setPreviewUrls([res.media_url]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar imagem.");
    } finally {
      setLoading(false);
    }
    e.target.value = "";
  };

  const handleNovoPost = () => {
    setDescricao("");
    setUrlImovel("");
    setArquivos([]);
    setCriarMidiaIA(false);
    setInstrucoesImagem("");
    setCaption(null);
    setMediaUrl(null);
    setMediaUrls([]);
    setMediaType(undefined);
    setPreviewUrls([]);
    setContentMode("descricao");
    setWizardStep(1);
    setFeedback("");
    setLinkPost(null);
    setAgendadoSuccess(null);
    setDataAgendamento("");
    setPromptImagemIA("");
    setStep("form");
    setError(null);
  };

  const podeAvancarPasso1 = contasInstagram.length === 0 || Boolean(contaSelecionadaId);

  const wizardLabels = [
    { n: 1 as const, title: "Conta", short: "1" },
    { n: 2 as const, title: "Nicho", short: "2" },
    { n: 3 as const, title: "IA da legenda", short: "3" },
    { n: 4 as const, title: "Conteúdo", short: "4" },
  ];

  return (
    <PageShell
      title="Postador"
      description="Siga os passos: conta, nicho, modelo de IA e conteúdo. Legendas curtas e imagens 4:5 para o feed."
      wide
    >
      {error && <div className="alert-error mb-6">{error}</div>}
      {agendadoSuccess && <div className="alert-success mb-6">{agendadoSuccess}</div>}

      {step === "form" && (
        <div className="space-y-6">
          {/* Indicador de passos */}
          <nav aria-label="Progresso" className="flex items-center gap-2 flex-wrap">
            {wizardLabels.map(({ n, title, short }, i) => (
              <div key={n} className="flex items-center gap-2">
                {i > 0 && <span className="text-gray-300 hidden sm:inline">→</span>}
                <button
                  type="button"
                  onClick={() => n < wizardStep && setWizardStep(n)}
                  disabled={n > wizardStep || loading}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    wizardStep === n
                      ? "bg-indigo-600 text-white shadow-sm"
                      : n < wizardStep
                        ? "bg-indigo-50 text-indigo-800 hover:bg-indigo-100 cursor-pointer"
                        : "bg-gray-100 text-gray-400 cursor-default"
                  }`}
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs font-bold">{short}</span>
                  {title}
                </button>
              </div>
            ))}
          </nav>

          {/* Passo 1 — Conta */}
          {wizardStep === 1 && (
            <div className="card space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Onde vai publicar?</h2>
              <p className="text-sm text-gray-600">Selecione a conta Instagram. Essa escolha será usada ao publicar ou ao disparar um post agendado daqui.</p>
              {contasInstagram.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="font-medium">Nenhuma conta configurada</p>
                  <p className="mt-1">
                    Cadastre em{" "}
                    <Link to="/admin" className="underline font-medium text-amber-950">
                      Administração
                    </Link>
                    . Você ainda pode gerar legenda para testar, mas não publicará sem conta.
                  </p>
                </div>
              ) : contasInstagram.length === 1 ? (
                <p className="text-sm text-gray-800">
                  Conta: <strong>{contasInstagram[0].nome || contasInstagram[0].ig_user_id}</strong>
                  {contasInstagram[0].has_token ? <span className="ml-2 text-green-600 text-xs">(token ok)</span> : null}
                </p>
              ) : (
                <div>
                  <label htmlFor="wizard-conta" className="block text-sm font-medium text-gray-700 mb-1">
                    Conta Instagram
                  </label>
                  <select
                    id="wizard-conta"
                    value={contaSelecionadaId ?? ""}
                    onChange={(e) => setContaSelecionadaId(e.target.value || null)}
                    disabled={loading}
                    className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    {contasInstagram.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome || c.ig_user_id}
                        {c.id === contaPadraoId ? " (padrão)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setWizardStep(2)}
                  disabled={loading || !podeAvancarPasso1}
                  className="inline-flex items-center px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  Continuar
                </button>
              </div>
            </div>
          )}

          {/* Passo 2 — Nicho e template */}
          {wizardStep === 2 && (
            <div className="card space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Estilo do post</h2>
              <p className="text-sm text-gray-600">
                Escolha o nicho e o template. A legenda e a imagem seguem tom e formato de social media — não textão genérico.
              </p>
              {segmento && (
                <p className="text-xs text-gray-500">
                  Segmento da empresa: <strong>{segmento}</strong>
                  {marcaNome ? <> · Marca: <strong>{marcaNome}</strong></> : null}
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="niche" className="block text-sm font-medium text-gray-700 mb-1">
                    Nicho
                  </label>
                  <select
                    id="niche"
                    value={nicheId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setNicheId(id);
                      const pack = niches.find((n) => n.id === id);
                      setTemplateKey(pack?.templates[0]?.key ?? "");
                    }}
                    disabled={loading || niches.length === 0}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    {niches.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.label}
                      </option>
                    ))}
                  </select>
                  {nichePack && <p className="mt-1 text-xs text-gray-500">{nichePack.descricao}</p>}
                </div>
                <div>
                  <label htmlFor="template" className="block text-sm font-medium text-gray-700 mb-1">
                    Template
                  </label>
                  <select
                    id="template"
                    value={templateKey}
                    onChange={(e) => setTemplateKey(e.target.value)}
                    disabled={loading || templatesDoNicho.length === 0}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    {templatesDoNicho.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label} ({t.formato}, {t.slides} slide{t.slides > 1 ? "s" : ""})
                      </option>
                    ))}
                  </select>
                  {templatesDoNicho.find((t) => t.key === templateKey) && (
                    <p className="mt-1 text-xs text-gray-500">
                      Hook exemplo: «{templatesDoNicho.find((t) => t.key === templateKey)?.hook_exemplo}»
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setWizardStep(1)}
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={() => setWizardStep(3)}
                  disabled={loading || !nicheId}
                  className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  Continuar
                </button>
              </div>
            </div>
          )}

          {/* Passo 3 — IA */}
          {wizardStep === 3 && (
            <div className="card space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Modelo de IA para a legenda</h2>
              <p className="text-sm text-gray-600">Escolha o provedor e o modelo que geram o texto do post (e refinos com «Refazer caption»).</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="provider" className="block text-sm font-medium text-gray-700 mb-1">
                    Provedor
                  </label>
                  <select
                    id="provider"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    disabled={loading}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="model" className="block text-sm font-medium text-gray-700 mb-1">
                    Modelo
                  </label>
                  <select
                    id="model"
                    value={currentModelInList ? model : modelsList[0]?.id ?? ""}
                    onChange={(e) => setModel(e.target.value)}
                    disabled={loading}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    {modelsList.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setWizardStep(2)}
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={() => setWizardStep(4)}
                  disabled={loading}
                  className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                >
                  Continuar
                </button>
              </div>
            </div>
          )}

          {/* Passo 4 — Tipo de conteúdo */}
          {wizardStep === 4 && (
            <div className="card space-y-5">
              <h2 className="text-lg font-semibold text-gray-900">Como montar o post?</h2>
              <p className="text-sm text-gray-600">Escolha uma opção. Só as ações da opção selecionada aparecem abaixo.</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setContentMode("descricao");
                  }}
                  disabled={loading}
                  className={`rounded-xl border-2 p-4 text-left transition-all ${
                    contentMode === "descricao"
                      ? "border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600"
                      : "border-gray-200 hover:border-gray-300 bg-gray-50/50"
                  }`}
                >
                  <span className="block font-semibold text-gray-900">Descrição e mídia</span>
                  <span className="mt-1 block text-sm text-gray-600">Texto livre, upload opcional ou imagem gerada por IA.</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setContentMode("link");
                  }}
                  disabled={loading}
                  className={`rounded-xl border-2 p-4 text-left transition-all ${
                    contentMode === "link"
                      ? "border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600"
                      : "border-gray-200 hover:border-gray-300 bg-gray-50/50"
                  }`}
                >
                  <span className="block font-semibold text-gray-900">Link de produto/serviço</span>
                  <span className="mt-1 block text-sm text-gray-600">Cole a URL da página; o sistema raspa dados e imagem.</span>
                </button>
              </div>

              {contentMode === "descricao" && (
                <div className="space-y-4 pt-2 border-t border-gray-100">
                  <div>
                    <label htmlFor="descricao" className="block text-sm font-medium text-gray-700 mb-1">
                      Descrição do post *
                    </label>
                    <textarea
                      id="descricao"
                      rows={5}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      placeholder="Ex.: Dica de automação para clínicas, lançamento do produto X..."
                      value={descricao}
                      onChange={(e) => setDescricao(e.target.value)}
                      disabled={loading}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="criar-midia-ia"
                      checked={criarMidiaIA}
                      onChange={(e) => setCriarMidiaIA(e.target.checked)}
                      disabled={loading}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <label htmlFor="criar-midia-ia" className="text-sm font-medium text-gray-700">
                      Criar mídia com IA
                    </label>
                  </div>
                  {criarMidiaIA && (
                    <div className="space-y-3 pl-1 border-l-2 border-indigo-100">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de mídia</label>
                        <select
                          value={tipoMidiaIA}
                          onChange={(e) => setTipoMidiaIA(e.target.value as "imagem" | "video")}
                          className="rounded-md border border-gray-300 px-3 py-2 text-sm w-full max-w-md"
                        >
                          <option value="imagem">Imagem (feed 4:5)</option>
                          <option value="video">Vídeo Reels (9:16)</option>
                        </select>
                      </div>
                      {tipoMidiaIA === "imagem" ? (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Provedor de imagem</label>
                          <select
                            value={provedorImagem}
                            onChange={(e) => setProvedorImagem(e.target.value as "openai" | "gemini")}
                            className="rounded-md border border-gray-300 px-3 py-2 text-sm w-full max-w-md"
                          >
                            <option value="gemini">Imagen 4 (Google)</option>
                            <option value="openai">DALL·E / GPT Image (OpenAI)</option>
                          </select>
                        </div>
                      ) : (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Provedor de vídeo (teste)</label>
                            <select
                              value={provedorVideo}
                              onChange={(e) => setProvedorVideo(e.target.value as "slideshow" | "veo" | "sora")}
                              className="rounded-md border border-gray-300 px-3 py-2 text-sm w-full max-w-md"
                            >
                              <option value="slideshow">Slideshow ffmpeg (~US$ 0,02)</option>
                              <option value="veo">Veo Google (~US$ 0,40/8s)</option>
                              <option value="sora">Sora 2 OpenAI (~US$ 0,80/8s)</option>
                            </select>
                            <p className="mt-1 text-xs text-gray-500">
                              {provedorVideo === "slideshow"
                                ? "Usa imagens enviadas ou gera 1 foto Imagen automaticamente."
                                : provedorVideo === "veo"
                                  ? "Texto → vídeo. Pode levar 1–3 min (GEMINI_API_KEY)."
                                  : "Texto → vídeo com áudio. Pode levar 2–5 min (OPENAI_API_KEY)."}
                            </p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Duração</label>
                            <select
                              value={duracaoVideo}
                              onChange={(e) => setDuracaoVideo(Number(e.target.value) as 4 | 8 | 12)}
                              className="rounded-md border border-gray-300 px-3 py-2 text-sm w-full max-w-md"
                            >
                              <option value={4}>4 segundos</option>
                              <option value={8}>8 segundos</option>
                              {provedorVideo !== "veo" && <option value={12}>12 segundos</option>}
                            </select>
                          </div>
                        </>
                      )}
                      <div>
                        <label htmlFor="instrucoes" className="block text-sm font-medium text-gray-700 mb-1">
                          {tipoMidiaIA === "video" ? "Brief do vídeo" : "Instruções para a imagem"} (opcional)
                        </label>
                        <textarea
                          id="instrucoes"
                          rows={2}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                          placeholder="Se vazio, usa a descrição do post"
                          value={instrucoesImagem}
                          onChange={(e) => setInstrucoesImagem(e.target.value)}
                          disabled={loading}
                        />
                      </div>
                      {tipoMidiaIA === "video" && (
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                          Geração de vídeo é lenta (até 5 min). Não feche a página.
                        </p>
                      )}
                    </div>
                  )}

                  {!criarMidiaIA && (
                    <div>
                      <label htmlFor="arquivo" className="block text-sm font-medium text-gray-700 mb-1">
                        Imagem(ns) ou vídeo (opcional — várias imagens = carrossel)
                      </label>
                      <input
                        id="arquivo"
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,video/*"
                        multiple
                        className="block w-full text-sm text-gray-600 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
                        onChange={(e) => setArquivos(Array.from(e.target.files ?? []))}
                        disabled={loading}
                      />
                      {arquivos.length > 0 && (
                        <p className="mt-1 text-sm text-gray-500">
                          {arquivos.length} arquivo(s): {arquivos.map((f) => f.name).join(", ")}
                        </p>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleGerarCaption}
                    disabled={loading || !descricao.trim()}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {loading
                      ? tipoMidiaIA === "video" && criarMidiaIA
                        ? "Gerando vídeo (pode levar alguns minutos)..."
                        : "Gerando..."
                      : "Gerar legenda e seguir para revisão"}
                  </button>
                </div>
              )}

              {contentMode === "link" && (
                <div className="space-y-4 pt-2 border-t border-gray-100">
                  <div>
                    <label htmlFor="url-produto" className="block text-sm font-medium text-gray-700 mb-1">
                      URL da página de detalhes
                    </label>
                    <input
                      id="url-produto"
                      type="text"
                      inputMode="url"
                      value={urlImovel}
                      onChange={(e) => setUrlImovel(e.target.value)}
                      placeholder="https://loja.com/produto ou www.loja.com/produto"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      disabled={loading}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Lojas Wix, Shopify e similares: cole o link da página do produto (com ou sem https). A API extrai título, preço, fotos e gera a legenda.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleGerarPorUrl}
                    disabled={loading || !urlImovel.trim()}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {loading ? "Processando..." : "Gerar post e seguir para revisão"}
                  </button>
                </div>
              )}

              <div className="flex justify-start pt-2">
                <button
                  type="button"
                  onClick={() => setWizardStep(3)}
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Voltar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {step === "review" && caption && (
        <div className="space-y-4">
          {jornadaQueue.length > 0 && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm mb-6">
              <p className="text-sm font-bold text-indigo-900 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white text-[10px]">
                  {jornadaIndex}
                </span>
                Revisão da Jornada: Post {jornadaIndex} de {jornadaQueue.length}
              </p>
              <p className="mt-1 text-xs text-indigo-700">Aplique os textos nas imagens e edite a legenda. Ao salvar, o próximo post será carregado.</p>
            </div>
          )}
          {contasInstagram.length > 0 && contaSelecionadaId && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <span>
                Publicar em:{" "}
                <strong>{contasInstagram.find((c) => c.id === contaSelecionadaId)?.nome || contaSelecionadaId}</strong>
              </span>
              <button
                type="button"
                onClick={() => {
                  setStep("form");
                  setWizardStep(1);
                }}
                className="text-indigo-600 hover:underline text-xs font-medium"
              >
                Alterar conta
              </button>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Caption para aprovação</label>
            <pre className="w-full rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800 whitespace-pre-wrap font-sans max-h-64 overflow-y-auto">
              {caption}
            </pre>
          </div>

          <div>
            <span className="block text-sm font-medium text-gray-700 mb-1">Mídia do post</span>
            {mediaType === "REELS" && previewUrls[0] && (
              <video
                src={previewUrls[0]}
                controls
                className="max-h-80 w-full max-w-sm rounded-md border border-gray-200 bg-black"
              />
            )}
            {mediaType === "REELS" && !previewUrls[0] && (
              <p className="text-sm text-gray-600 py-2">Vídeo Reels (sem preview).</p>
            )}
            {ultimoCustoVideo != null && mediaType === "REELS" && (
              <p className="text-xs text-gray-500 mt-1">
                Custo estimado deste vídeo (dev): ~US$ {ultimoCustoVideo.toFixed(2)}
              </p>
            )}
            {previewUrls.length > 1 && (
              <>
                <div className="flex gap-2 flex-wrap">
                  {previewUrls.map((url, i) => (
                    <img key={i} src={url} alt={`Slide ${i + 1}`} className="h-32 w-32 object-cover rounded-md border border-gray-200" />
                  ))}
                </div>
                <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-sm font-medium text-gray-700 mb-2">Textos para o Carrossel (Opcional)</p>
                  <p className="text-xs text-gray-500 mb-4">Adicione títulos atrativos para as imagens. O sistema aplicará um design profissional automaticamente com o texto inserido.</p>
                  <div className="space-y-2 mb-2">
                    {previewUrls.map((_, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-sm text-gray-500 w-8">#{i + 1}</span>
                        <input
                          type="text"
                          value={textosCarrossel[i] ?? ""}
                          onChange={(e) => setTextosCarrossel((prev) => {
                            const next = [...prev];
                            next[i] = e.target.value;
                            return next;
                          })}
                          placeholder={`Texto da imagem ${i + 1}`}
                          className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                          disabled={loading}
                        />
                        <button
                          type="button"
                          onClick={() => handleGerarCTAParaImagem(i)}
                          disabled={loading || !caption}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 shadow-sm transition-colors"
                          title="Gerar CTA criativo com IA"
                        >
                          {loading ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleAplicarTextoCarrossel}
                    disabled={loading}
                    className="px-3 py-1.5 text-sm font-medium rounded-md text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200"
                  >
                    {loading ? "Aplicando..." : "Aplicar texto nas imagens"}
                  </button>
                </div>
              </>
            )}
            {previewUrls.length === 1 && mediaType !== "REELS" && (
              <>
                <img src={previewUrls[0]} alt="Preview" className="max-h-64 rounded-md border border-gray-200" />
                <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                  <p className="text-sm font-medium text-gray-700">Moldura visual (opcional)</p>
                  <p className="text-xs text-gray-500">
                    Deixa o post com cara de social media: gradiente + headline na paleta do nicho.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={textosCarrossel[0] ?? ""}
                      onChange={(e) =>
                        setTextosCarrossel((prev) => {
                          const next = [...prev];
                          next[0] = e.target.value;
                          return next;
                        })
                      }
                      placeholder="Headline curta na imagem"
                      className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => handleGerarCTAParaImagem(0)}
                      disabled={loading || !caption}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                      title="Gerar headline com IA"
                    >
                      ⚡
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleAplicarMolduraFeed}
                    disabled={loading || !(textosCarrossel[0]?.trim())}
                    className="px-3 py-1.5 text-sm font-medium rounded-md text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 disabled:opacity-50"
                  >
                    {loading ? "Aplicando..." : "Aplicar moldura na imagem"}
                  </button>
                </div>
              </>
            )}
            {previewUrls.length === 1 && mediaType === "IMAGE" && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleExcluirImagem}
                  disabled={loading}
                  className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md text-red-700 bg-red-50 hover:bg-red-100 border border-red-200"
                >
                  Excluir imagem
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder="Prompt visual curto (ex.: frasco honey em mármore, luz dourada)"
                    className="rounded-md border border-gray-300 px-2 py-1.5 text-sm flex-1 min-w-[160px]"
                    value={promptImagemIA}
                    onChange={(e) => setPromptImagemIA(e.target.value)}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={handleGerarImagemIA}
                    disabled={loading}
                    className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200"
                  >
                    {loading ? "Gerando..." : "Gerar imagem com IA"}
                  </button>
                </div>
                <label className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-300 cursor-pointer">
                  Incluir imagem
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={handleIncluirImagem}
                    disabled={loading}
                  />
                </label>
              </div>
            )}
          </div>

          {contasInstagram.length > 1 && (
            <div>
              <label htmlFor="conta-post" className="block text-sm font-medium text-gray-700 mb-1">Publicar na conta</label>
              <select
                id="conta-post"
                value={contaSelecionadaId ?? ""}
                onChange={(e) => setContaSelecionadaId(e.target.value || null)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:ring-1 focus:ring-indigo-500"
              >
                {contasInstagram.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome || c.ig_user_id}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-wrap gap-3 items-center">
            {!temMidiaParaPublicar && (
              <p className="text-amber-700 text-sm">Adicione uma imagem ou vídeo para publicar (ou use «Gerar imagem com IA» / «Incluir imagem»).</p>
            )}
            <button
              type="button"
              onClick={handlePublicar}
              disabled={loading || !temMidiaParaPublicar}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Publicando..." : "Aprovar e publicar"}
            </button>
            <div className="flex flex-col gap-1">
              <label htmlFor="dataAgendamento" className="text-xs font-medium text-gray-700">Agendar para (opcional)</label>
              <input 
                id="dataAgendamento"
                type="datetime-local" 
                value={dataAgendamento} 
                onChange={(e) => setDataAgendamento(e.target.value)} 
                className="rounded-md border border-gray-300 px-3 py-2 text-sm h-10 text-gray-900 focus:ring-1 focus:ring-indigo-500" 
                disabled={loading} 
              />
            </div>
            <button
              type="button"
              onClick={handleSalvarAgendar}
              disabled={loading || !temMidiaParaPublicar}
              className="inline-flex items-center mt-5 px-4 h-10 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {dataAgendamento ? "Agendar" : "Salvar rascunho"}
            </button>
            <div className="flex-1 min-w-[200px] flex flex-col gap-2">
              <textarea
                rows={2}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="O que deseja alterar no caption?"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                disabled={loading}
              />
              <button
                type="button"
                onClick={handleRefazer}
                disabled={loading}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                Refazer caption
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "published" && (
        <div className="rounded-md bg-green-50 border border-green-200 p-4">
          <p className="text-green-800 font-medium">Post publicado com sucesso.</p>
          {linkPost && (
            <p className="mt-2">
              <a href={linkPost} target="_blank" rel="noopener noreferrer" className="text-green-700 underline">
                Ver no Instagram
              </a>
            </p>
          )}
          <button
            type="button"
            onClick={handleNovoPost}
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-green-700 bg-green-100 hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
          >
            Criar outro post
          </button>
        </div>
      )}

      <AgendadosList contas={contasInstagram} contaPadraoId={contaPadraoId} onPublished={handleNovoPost} />
    </PageShell>
  );
}

function AgendadosList({
  contas,
  contaPadraoId,
  onPublished,
}: {
  contas: ContaInstagramRes[];
  contaPadraoId: string | null;
  onPublished?: () => void;
}) {
  const [list, setList] = useState<AgendadoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contaIdParaPublicar, setContaIdParaPublicar] = useState<string | null>(contaPadraoId ?? contas[0]?.id ?? null);

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    api.postador
      .getAgendados()
      .then((r) => setList((r.agendados ?? []).filter(a => a.status !== 'published')))
      .catch(() => setList([]))
      .finally(() => { if (!silent) setLoading(false); });
  };

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const defaultId = contaPadraoId ?? contas[0]?.id ?? null;
    setContaIdParaPublicar((prev) => (prev && contas.some((c) => c.id === prev)) ? prev : defaultId);
  }, [contas, contaPadraoId]);

  const handlePublicar = async (id: string) => {
    setPublishingId(id);
    try {
      await api.postador.publicarAgendado(id, contaIdParaPublicar);
      if (selectedId === id) setSelectedId(null);
      load();
      onPublished?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao publicar");
    } finally {
      setPublishingId(null);
    }
  };

  if (list.length === 0 && !loading) return null;

  return (
    <div className="mt-12 border-t border-slate-200/90 pt-10">
      <h2 className="font-display text-xl font-semibold text-slate-900">Posts agendados</h2>
      <p className="mt-1 text-sm text-slate-600">Selecione um post e clique em «Publicar agora» para publicar.</p>
      {contas.length > 1 && (
        <div className="mb-4 mt-4">
          <label htmlFor="agendado-conta" className="label-field">
            Publicar na conta
          </label>
          <select
            id="agendado-conta"
            value={contaIdParaPublicar ?? ""}
            onChange={(e) => setContaIdParaPublicar(e.target.value || null)}
            className="input-field max-w-md py-2 text-sm"
          >
            {contas.map((c) => (
              <option key={c.id} value={c.id}>{c.nome || c.ig_user_id}</option>
            ))}
          </select>
        </div>
      )}
      {loading ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : (
        <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
          {list.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2.5 text-sm"
            >
              <input
                type="radio"
                name="agendado"
                id={`ag-${item.id}`}
                checked={selectedId === item.id}
                onChange={() => setSelectedId(item.id)}
                className="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500/30"
              />
              <label htmlFor={`ag-${item.id}`} className="min-w-0 flex-1 cursor-pointer">
                <span className="shrink-0 text-xs font-medium text-slate-400">
                  {new Date(item.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="ml-2 max-w-[280px] truncate text-slate-800" title={item.caption}>
                  {item.caption.length > 45 ? `${item.caption.slice(0, 45)}…` : item.caption}
                </span>
                {item.media_type === "CAROUSEL" && item.media_urls && (
                  <span className="ml-1 text-slate-400">({item.media_urls.length} imagens)</span>
                )}
              </label>
              <button
                type="button"
                onClick={() => handlePublicar(item.id)}
                disabled={publishingId !== null}
                className="btn-primary shrink-0 py-1.5 px-3 text-xs disabled:cursor-not-allowed"
              >
                {publishingId === item.id ? "Publicando…" : "Publicar agora"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Excluir este agendamento?")) {
                    api.postador.deleteAgendado(item.id)
                      .then(() => load())
                      .catch(e => alert("Erro ao excluir: " + e.message));
                  }
                }}
                className="btn-ghost shrink-0 rounded-lg py-1.5 px-3 text-xs text-red-600 hover:bg-red-50"
              >
                Excluir
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
