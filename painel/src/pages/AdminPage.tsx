import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { PageShell } from "../components/layout/PageShell";
import {
  api,
  getAuthToken,
  clearAuthToken,
  DEFAULT_AGENDA_CONFIG,
  type Config,
  type ContaInstagramRes,
  type ContaInstagramInput,
  type EmpresaPerfilRes,
} from "../api/client";

const AGENDA_DIAS: { id: number; label: string }[] = [
  { id: 1, label: "Seg" },
  { id: 2, label: "Ter" },
  { id: 3, label: "Qua" },
  { id: 4, label: "Qui" },
  { id: 5, label: "Sex" },
  { id: 6, label: "Sáb" },
  { id: 0, label: "Dom" },
];

function emptyEmpresa(): EmpresaPerfilRes {
  return {
    nome: "",
    nome_fantasia: "",
    segmento: "",
    cidade: "",
    tom_voz: "",
    sobre: "",
    objetivo_qualificacao: "",
    handoff_whatsapp: "",
    link_produto_servico: "",
    agenda_config: { ...DEFAULT_AGENDA_CONFIG },
    criterios_qualificacao: "",
    agenda_local: "",
    postador_brand: {
      cor_primaria: "#111827",
      cor_secundaria: "#6b7280",
      cor_destaque: "#d4af37",
      logo_url: "",
      usar_logo_em_posts: false,
    },
  };
}

function mergeEmpresa(e?: Partial<EmpresaPerfilRes>): EmpresaPerfilRes {
  const base = emptyEmpresa();
  if (!e) return base;
  return {
    ...base,
    ...e,
    agenda_config: { ...DEFAULT_AGENDA_CONFIG, ...e.agenda_config },
    postador_brand: { ...base.postador_brand!, ...e.postador_brand },
  };
}

function emptyContaForm() {
  return {
    nome: "",
    ig_user_id: "",
    access_token: "",
    agent_access_token: "",
    agent_ativo: false,
    agent_nome: "",
    agent_prompt_comentarios: "",
    agent_prompt_direct: "",
  };
}

export function AdminPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [empresa, setEmpresa] = useState<EmpresaPerfilRes>(emptyEmpresa);
  const [editId, setEditId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(emptyContaForm);
  /** Dados vêm de /api/me/workspace (organização + contas no PostgreSQL). */
  const [useWorkspace, setUseWorkspace] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const status = await api.getAuthStatus();
        if (cancelled) return;
        if (status.authMode === "workspace" && status.hasUsers) {
          const token = getAuthToken();
          if (!token) {
            setNeedLogin(true);
            setUseWorkspace(true);
            setConfig(null);
            return;
          }
          try {
            const data = await api.getMeWorkspace();
            if (cancelled) return;
            setConfig(data);
            setEmpresa(mergeEmpresa(data.empresa));
            setUseWorkspace(true);
            setNeedLogin(false);
          } catch {
            clearAuthToken();
            setNeedLogin(true);
            setConfig(null);
            setUseWorkspace(true);
          }
        } else {
          const data = await api.getConfig();
          if (cancelled) return;
          setConfig(data);
          setEmpresa(mergeEmpresa(data.empresa));
          setUseWorkspace(false);
          setNeedLogin(false);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao carregar");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const contas = config?.contas_instagram ?? [];
  const defaultId = config?.instagram_default_id ?? null;

  const handleSaveEmpresa = () => {
    setSaving(true);
    setError(null);
    const p =
      useWorkspace && getAuthToken()
        ? api.putMeWorkspace({ empresa })
        : api.putConfig({ empresa });
    p.then((res) =>
      setConfig((c) => (c ? { ...c, empresa: res.received?.empresa ?? c.empresa } : null))
    )
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao salvar"))
      .finally(() => setSaving(false));
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Envie PNG ou JPG com fundo transparente.");
      return;
    }
    setLogoUploading(true);
    setError(null);
    try {
      const up = await api.postador.uploadMidia(file);
      setEmpresa((x) => ({
        ...x,
        postador_brand: {
          ...x.postador_brand!,
          logo_url: up.media_url,
          usar_logo_em_posts: true,
        },
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar logo.");
    } finally {
      setLogoUploading(false);
      e.target.value = "";
    }
  };

  const handleSetDefault = (id: string) => {
    setSaving(true);
    setError(null);
    const p =
      useWorkspace && getAuthToken()
        ? api.putMeWorkspace({ instagram_default_id: id })
        : api.putConfig({ instagram_default_id: id });
    p.then((res) =>
      setConfig((c) => (c ? { ...c, instagram_default_id: res.received?.instagram_default_id ?? id } : null))
    )
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao salvar"))
      .finally(() => setSaving(false));
  };

  const handleSaveConta = () => {
    if (!form.nome.trim() || !form.ig_user_id.trim()) {
      setError("Nome e ID do usuário são obrigatórios.");
      return;
    }
    setSaving(true);
    setError(null);
    const list: ContaInstagramInput[] =
      editId === "new"
        ? [
            ...contas.map((c) => ({
              id: c.id,
              nome: c.nome,
              ig_user_id: c.ig_user_id,
              agent_ativo: c.agent_ativo,
              agent_nome: c.agent_nome,
              agent_prompt_comentarios: c.agent_prompt_comentarios,
              agent_prompt_direct: c.agent_prompt_direct,
            })),
            {
              nome: form.nome.trim(),
              ig_user_id: form.ig_user_id.trim(),
              access_token: form.access_token.trim() || undefined,
              agent_access_token: form.agent_access_token.trim() || undefined,
              agent_ativo: form.agent_ativo,
              agent_nome: form.agent_nome.trim(),
              agent_prompt_comentarios: form.agent_prompt_comentarios.trim(),
              agent_prompt_direct: form.agent_prompt_direct.trim(),
            },
          ]
        : contas.map((c) =>
            c.id === editId
              ? {
                  id: c.id,
                  nome: form.nome.trim(),
                  ig_user_id: form.ig_user_id.trim(),
                  access_token: form.access_token.trim() || undefined,
                  agent_access_token: form.agent_access_token.trim() || undefined,
                  agent_ativo: form.agent_ativo,
                  agent_nome: form.agent_nome.trim(),
                  agent_prompt_comentarios: form.agent_prompt_comentarios.trim(),
                  agent_prompt_direct: form.agent_prompt_direct.trim(),
                }
              : {
                  id: c.id,
                  nome: c.nome,
                  ig_user_id: c.ig_user_id,
                  agent_ativo: c.agent_ativo,
                  agent_nome: c.agent_nome,
                  agent_prompt_comentarios: c.agent_prompt_comentarios,
                  agent_prompt_direct: c.agent_prompt_direct,
                }
          );
    const p =
      useWorkspace && getAuthToken()
        ? api.putMeWorkspace({ contas_instagram: list })
        : api.putConfig({ contas_instagram: list });
    p.then((res) => {
      setConfig((c) => (c ? { ...c, contas_instagram: res.received?.contas_instagram ?? c.contas_instagram } : null));
      setEditId(null);
      setForm(emptyContaForm());
    })
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao salvar"))
      .finally(() => setSaving(false));
  };

  const handleRemoveConta = (id: string) => {
    if (!confirm("Remover esta conta? O token será perdido.")) return;
    const list = contas
      .filter((c) => c.id !== id)
      .map((c) => ({
        id: c.id,
        nome: c.nome,
        ig_user_id: c.ig_user_id,
        agent_ativo: c.agent_ativo,
        agent_nome: c.agent_nome,
        agent_prompt_comentarios: c.agent_prompt_comentarios,
        agent_prompt_direct: c.agent_prompt_direct,
      }));
    setSaving(true);
    setError(null);
    const body = {
      contas_instagram: list,
      instagram_default_id: defaultId === id ? (list[0]?.id ?? null) : defaultId,
    };
    const p = useWorkspace && getAuthToken() ? api.putMeWorkspace(body) : api.putConfig(body);
    p.then((res) =>
      setConfig((c) =>
        c ? { ...c, contas_instagram: res.received?.contas_instagram ?? [], instagram_default_id: res.received?.instagram_default_id ?? null } : null
      )
    )
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao remover"))
      .finally(() => setSaving(false));
  };

  const startEdit = (conta: ContaInstagramRes) => {
    setEditId(conta.id);
    setForm({
      nome: conta.nome,
      ig_user_id: conta.ig_user_id,
      access_token: "",
      agent_access_token: "",
      agent_ativo: Boolean(conta.agent_ativo),
      agent_nome: conta.agent_nome ?? "",
      agent_prompt_comentarios: conta.agent_prompt_comentarios ?? "",
      agent_prompt_direct: conta.agent_prompt_direct ?? "",
    });
  };



  if (loading) {
    return (
      <PageShell title="Administração" description="Carregando configuração…" wide>
        <div className="card h-36 animate-pulse bg-slate-100/80" aria-hidden />
      </PageShell>
    );
  }

  return (
    <PageShell
      wide
      title="Administração"
      description={
        useWorkspace
          ? "Workspace da sua organização: empresa e contas Instagram usadas no Postador e integrações."
          : "Dados da empresa e contas Instagram para postar (modo legado, sem login)."
      }
    >
      {needLogin && (
        <div className="alert-info mb-6">
          <p className="font-semibold">Login necessário</p>
          <p className="mt-1 opacity-90">As contas Instagram estão vinculadas ao seu usuário e organização.</p>
          <Link to="/login" className="btn-primary mt-4 inline-flex">
            Ir para login
          </Link>
        </div>
      )}

      {error && <div className="alert-error mb-6">{error}</div>}

      {!needLogin && (
      <div className="space-y-8">
        <div className="card space-y-4">
          <h2 className="font-display text-xl font-semibold text-slate-900">Dados da empresa</h2>
          <p className="text-sm text-slate-600">
            Esses campos alimentam a API (<code className="rounded bg-slate-100 px-1 text-xs">empresa_perfil</code> no{" "}
            <code className="rounded bg-slate-100 px-1 text-xs">agent-config</code>) para montar contexto no n8n sem repetir tudo nos prompts.
          </p>
          <label className="label-field">Nome (razão social / registro)</label>
          <input
            type="text"
            value={empresa.nome}
            onChange={(e) => setEmpresa((x) => ({ ...x, nome: e.target.value }))}
            className="input-field"
            placeholder="Ex.: Fabrica IA"
          />
          <label className="label-field">Nome fantasia / marca</label>
          <input
            type="text"
            value={empresa.nome_fantasia}
            onChange={(e) => setEmpresa((x) => ({ ...x, nome_fantasia: e.target.value }))}
            className="input-field"
            placeholder="Como a marca aparece para o público"
          />
          <label className="label-field">Segmento</label>
          <input
            type="text"
            value={empresa.segmento}
            onChange={(e) => setEmpresa((x) => ({ ...x, segmento: e.target.value }))}
            className="input-field"
            placeholder="Ex.: clínica, e-commerce, consultoria, serviços"
          />

          <div className="mt-6 rounded-lg border border-indigo-200 bg-indigo-50/50 p-4 space-y-3">
            <p className="text-sm font-semibold text-indigo-900">Brand kit — Postador</p>
            <p className="text-xs text-indigo-800">
              Paleta e logo usados em molduras, carrossel e composição produto + fundo criativo.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label-field text-xs">Cor primária</label>
                <input
                  type="color"
                  value={empresa.postador_brand?.cor_primaria ?? "#111827"}
                  onChange={(e) =>
                    setEmpresa((x) => ({
                      ...x,
                      postador_brand: { ...x.postador_brand!, cor_primaria: e.target.value },
                    }))
                  }
                  className="h-10 w-full rounded border border-gray-300 cursor-pointer"
                />
              </div>
              <div>
                <label className="label-field text-xs">Cor secundária</label>
                <input
                  type="color"
                  value={empresa.postador_brand?.cor_secundaria ?? "#6b7280"}
                  onChange={(e) =>
                    setEmpresa((x) => ({
                      ...x,
                      postador_brand: { ...x.postador_brand!, cor_secundaria: e.target.value },
                    }))
                  }
                  className="h-10 w-full rounded border border-gray-300 cursor-pointer"
                />
              </div>
              <div>
                <label className="label-field text-xs">Cor destaque</label>
                <input
                  type="color"
                  value={empresa.postador_brand?.cor_destaque ?? "#d4af37"}
                  onChange={(e) =>
                    setEmpresa((x) => ({
                      ...x,
                      postador_brand: { ...x.postador_brand!, cor_destaque: e.target.value },
                    }))
                  }
                  className="h-10 w-full rounded border border-gray-300 cursor-pointer"
                />
              </div>
            </div>
            <label className="label-field">URL do logo (PNG transparente)</label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="url"
                value={empresa.postador_brand?.logo_url ?? ""}
                onChange={(e) =>
                  setEmpresa((x) => ({
                    ...x,
                    postador_brand: { ...x.postador_brand!, logo_url: e.target.value },
                  }))
                }
                className="input-field flex-1 min-w-[200px]"
                placeholder="https://.../logo.png"
              />
              <label className="inline-flex cursor-pointer items-center rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100">
                {logoUploading ? "Enviando..." : "Enviar arquivo"}
                <input
                  type="file"
                  accept="image/png,image/webp,image/jpeg"
                  className="sr-only"
                  onChange={handleLogoUpload}
                  disabled={logoUploading || saving}
                />
              </label>
            </div>
            {empresa.postador_brand?.logo_url?.trim() && (
              <img
                src={empresa.postador_brand.logo_url}
                alt="Preview logo"
                className="mt-2 h-12 w-auto rounded border border-gray-200 bg-white p-1"
              />
            )}
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={empresa.postador_brand?.usar_logo_em_posts ?? false}
                onChange={(e) =>
                  setEmpresa((x) => ({
                    ...x,
                    postador_brand: { ...x.postador_brand!, usar_logo_em_posts: e.target.checked },
                  }))
                }
              />
              Incluir logo nos criativos (canto superior)
            </label>
          </div>

          <label className="label-field">Cidade / região de atuação</label>
          <input
            type="text"
            value={empresa.cidade}
            onChange={(e) => setEmpresa((x) => ({ ...x, cidade: e.target.value }))}
            className="input-field"
          />
          <label className="label-field">Tom de voz (curto)</label>
          <input
            type="text"
            value={empresa.tom_voz}
            onChange={(e) => setEmpresa((x) => ({ ...x, tom_voz: e.target.value }))}
            className="input-field"
            placeholder="Ex.: cordial e direto; sem jargão excessivo"
          />
          <label className="label-field">Sobre a empresa</label>
          <textarea
            value={empresa.sobre}
            onChange={(e) => setEmpresa((x) => ({ ...x, sobre: e.target.value }))}
            className="textarea-field min-h-[100px]"
            placeholder="1–3 frases: o que faz, para quem, diferencial."
          />
          <label className="label-field">Objetivo de qualificação (multi-segmento)</label>
          <textarea
            value={empresa.objetivo_qualificacao}
            onChange={(e) => setEmpresa((x) => ({ ...x, objetivo_qualificacao: e.target.value }))}
            className="textarea-field min-h-[88px]"
            placeholder="O que o agente deve descobrir no lead (ex.: interesse em compra, agendar reunião, orçamento)."
          />
          <label className="label-field">Link padrão de produto/serviço</label>
          <input
            type="url"
            value={empresa.link_produto_servico ?? ""}
            onChange={(e) => setEmpresa((x) => ({ ...x, link_produto_servico: e.target.value }))}
            className="input-field text-sm"
            placeholder="https://… — página de detalhes que o agente pode enviar ao lead"
          />
          <label className="label-field">Critérios de qualificação (um por linha)</label>
          <textarea
            value={empresa.criterios_qualificacao ?? ""}
            onChange={(e) => setEmpresa((x) => ({ ...x, criterios_qualificacao: e.target.value }))}
            className="textarea-field min-h-[88px] font-mono text-sm"
            placeholder={"Nome do lead\nInteresse / necessidade\nPrazo ou urgência\nOrçamento ou perfil"}
          />
          <fieldset className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/50 p-3">
            <legend className="px-1 text-sm font-medium text-gray-800">Agenda de compromissos</legend>
            <p className="text-xs text-gray-600">Usado pelo agente WhatsApp ao agendar visita, reunião ou demonstração.</p>
            <div className="flex flex-wrap gap-2">
              {AGENDA_DIAS.map((d) => {
                const on = empresa.agenda_config.dias_semana.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() =>
                      setEmpresa((x) => {
                        const cur = x.agenda_config.dias_semana;
                        const next = on ? cur.filter((n) => n !== d.id) : [...cur, d.id].sort((a, b) => a - b);
                        return {
                          ...x,
                          agenda_config: { ...x.agenda_config, dias_semana: next.length ? next : cur },
                        };
                      })
                    }
                    className={`rounded-md px-2.5 py-1 text-xs font-medium ring-1 ${
                      on ? "bg-violet-100 text-violet-900 ring-violet-300" : "bg-white text-gray-600 ring-gray-300"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm">
                <span className="text-gray-700">Início</span>
                <input
                  type="time"
                  value={empresa.agenda_config.horario_inicio}
                  onChange={(e) =>
                    setEmpresa((x) => ({
                      ...x,
                      agenda_config: { ...x.agenda_config, horario_inicio: e.target.value },
                    }))
                  }
                  className="input-field mt-1"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-700">Fim</span>
                <input
                  type="time"
                  value={empresa.agenda_config.horario_fim}
                  onChange={(e) =>
                    setEmpresa((x) => ({
                      ...x,
                      agenda_config: { ...x.agenda_config, horario_fim: e.target.value },
                    }))
                  }
                  className="input-field mt-1"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-700">Duração (min)</span>
                <input
                  type="number"
                  min={15}
                  max={480}
                  step={15}
                  value={empresa.agenda_config.duracao_minutos}
                  onChange={(e) =>
                    setEmpresa((x) => ({
                      ...x,
                      agenda_config: {
                        ...x.agenda_config,
                        duracao_minutos: Math.min(480, Math.max(15, Number(e.target.value) || 60)),
                      },
                    }))
                  }
                  className="input-field mt-1"
                />
              </label>
            </div>
          </fieldset>
          <label className="label-field">Local do compromisso (reunião / visita)</label>
          <input
            type="text"
            value={empresa.agenda_local ?? ""}
            onChange={(e) => setEmpresa((x) => ({ ...x, agenda_local: e.target.value }))}
            className="input-field"
            placeholder="Ex.: Google Meet, endereço da loja, link de videochamada"
          />
          <label className="label-field">WhatsApp do consultor humano (fechamento)</label>
          <input
            type="text"
            value={empresa.handoff_whatsapp ?? ""}
            onChange={(e) => setEmpresa((x) => ({ ...x, handoff_whatsapp: e.target.value }))}
            className="input-field font-mono text-sm"
            placeholder="ex.: 16999998888 — recebe alerta quando lead for qualificado"
          />
          <button type="button" onClick={handleSaveEmpresa} disabled={saving} className="btn-primary">
            Salvar dados da empresa
          </button>
        </div>

        <div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold text-slate-900">Contas Instagram</h2>
              <p className="mt-2 text-sm text-slate-600 max-w-2xl">
                Cada organização cadastra aqui o Instagram que vai postar e responder comentários/DM.
                {useWorkspace
                  ? " Para escalar: cada cliente entra no painel com o login dele e adiciona a própria conta — você não precisa fazer isso por ele."
                  : " Cole o token Graph API e o ID da conta comercial."}
              </p>
            </div>
            {!editId && (
              <button
                type="button"
                onClick={() => {
                  setEditId("new");
                  setForm(emptyContaForm());
                }}
                disabled={saving || needLogin}
                className="btn-primary shrink-0"
              >
                + Adicionar conta
              </button>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
            <p className="font-medium text-slate-900">Como conectar (sem botão Meta)</p>
            <ol className="mt-2 list-decimal pl-5 space-y-1">
              <li>Instagram comercial (Business/Creator) vinculado à Página do Facebook.</li>
              <li>Token de Página com permissões de postagem e mensagens (app Meta do cliente ou seu setup).</li>
              <li>
                <strong>ig_user_id</strong> — ID numérico da conta Instagram comercial (Graph API).
              </li>
              <li>Preencha abaixo e salve. Postador e agente passam a usar esta conta.</li>
            </ol>
          </div>

          <ul className="mb-6 mt-4 space-y-3">
            {contas.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/90 bg-slate-50/80 p-4 shadow-sm"
              >
                <span className="font-semibold text-slate-800">{c.nome || "Sem nome"}</span>
                <span className="text-sm text-slate-500">({c.ig_user_id})</span>
                {c.has_token && <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Token postagem</span>}
                {c.has_agent_token && (
                  <span className="rounded-md bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">Token agente</span>
                )}
                {c.agent_ativo && (
                  <span className="rounded-md bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">Agente ativo</span>
                )}
                {defaultId === c.id && (
                  <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">Padrão</span>
                )}
                <div className="ml-auto flex flex-wrap gap-2">
                  {defaultId !== c.id && (
                    <button type="button" onClick={() => handleSetDefault(c.id)} disabled={saving} className="btn-ghost text-indigo-600 hover:text-indigo-700">
                      Definir padrão
                    </button>
                  )}
                  <button type="button" onClick={() => startEdit(c)} disabled={saving} className="btn-ghost">
                    Editar
                  </button>
                  <button type="button" onClick={() => handleRemoveConta(c.id)} disabled={saving} className="btn-ghost text-red-600 hover:text-red-700">
                    Excluir
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {(editId === "new" || editId) && (
            <div className="card space-y-4 bg-slate-50/50">
              <h3 className="font-display text-lg font-semibold text-slate-900">{editId === "new" ? "Nova conta" : "Editar conta"}</h3>
              <input
                type="text"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                className="input-field"
                placeholder="Nome (ex.: Conta principal)"
              />
              <input
                type="text"
                value={form.ig_user_id}
                onChange={(e) => setForm((f) => ({ ...f, ig_user_id: e.target.value }))}
                className="input-field font-mono text-sm"
                placeholder="ID numérico Instagram comercial (ex.: 17841400000000000)"
              />
              <p className="text-xs text-slate-500 -mt-2">
                Graph API → conta Instagram Business. Não é o @usuario.
              </p>
              <input
                type="password"
                value={form.access_token}
                onChange={(e) => setForm((f) => ({ ...f, access_token: e.target.value }))}
                className="input-field font-mono text-sm"
                placeholder={editId === "new" ? "Token de Página (long-lived) — obrigatório" : "Vazio = mantém token atual"}
              />
              <p className="text-xs text-slate-500 -mt-2">
                Permissões: instagram_basic, instagram_content_publish, pages_show_list (mínimo para Postador).
              </p>

              <div className="rounded-xl border border-violet-200/90 bg-violet-50/50 p-4 space-y-3">
                <h4 className="font-semibold text-slate-900">Agente Instagram (comentários + Direct)</h4>
                <p className="text-xs text-slate-600">
                  Marque <strong>Agente ativo</strong> para o n8n processar webhooks desta conta. Os campos abaixo são
                  refinamentos opcionais: o sistema mantém um prompt-base profissional e usa seu texto apenas como complemento.
                </p>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={form.agent_ativo}
                    onChange={(e) => setForm((f) => ({ ...f, agent_ativo: e.target.checked }))}
                    className="rounded border-slate-300"
                  />
                  Agente ativo nesta conta
                </label>
                <label className="label-field">Nome do assistente (ex.: Bella, Ana)</label>
                <input
                  type="text"
                  value={form.agent_nome}
                  onChange={(e) => setForm((f) => ({ ...f, agent_nome: e.target.value }))}
                  className="input-field"
                  placeholder="Opcional — senão usa nome fantasia da empresa"
                />
                <label className="label-field">Token do agente (Graph API)</label>
                <input
                  type="password"
                  value={form.agent_access_token}
                  onChange={(e) => setForm((f) => ({ ...f, agent_access_token: e.target.value }))}
                  className="input-field font-mono text-sm"
                  placeholder="Token agente (vazio = usa token de postagem)"
                />
                <p className="text-xs text-slate-500 -mt-2">
                  Para comentários/DM inclua instagram_manage_comments e instagram_manage_messages no token.
                </p>
                <label className="label-field">Refinamentos — comentários (opcional)</label>
                <textarea
                  value={form.agent_prompt_comentarios}
                  onChange={(e) => setForm((f) => ({ ...f, agent_prompt_comentarios: e.target.value }))}
                  className="textarea-field min-h-[80px] font-mono text-xs"
                  placeholder="Tom, regras extras e estilo. Vazio = apenas prompt-base interno."
                />
                <label className="label-field">Refinamentos — Direct (opcional)</label>
                <textarea
                  value={form.agent_prompt_direct}
                  onChange={(e) => setForm((f) => ({ ...f, agent_prompt_direct: e.target.value }))}
                  className="textarea-field min-h-[80px] font-mono text-xs"
                  placeholder="Complementos de abordagem e normas. Vazio = apenas prompt-base interno."
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSaveConta}
                  disabled={saving || !form.nome.trim() || !form.ig_user_id.trim() || (editId === "new" && !form.access_token.trim())}
                  className="btn-primary"
                >
                  {saving ? "Salvando..." : editId === "new" ? "Adicionar conta" : "Salvar alterações"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditId(null);
                    setForm(emptyContaForm());
                  }}
                  className="btn-secondary"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {contas.length === 0 && !editId && (
            <p className="text-sm text-slate-500">Nenhuma conta ainda. Clique em «+ Adicionar conta».</p>
          )}
        </div>
      </div>
      )}
    </PageShell>
  );
}
