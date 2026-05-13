import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageShell } from "../components/layout/PageShell";
import {
  api,
  getAuthToken,
  clearAuthToken,
  type Config,
  type ContaInstagramRes,
  type ContaInstagramInput,
  type EmpresaPerfilRes,
} from "../api/client";

function emptyEmpresa(): EmpresaPerfilRes {
  return {
    nome: "",
    nome_fantasia: "",
    segmento: "",
    cidade: "",
    tom_voz: "",
    sobre: "",
    objetivo_qualificacao: "",
  };
}

function mergeEmpresa(e?: Partial<EmpresaPerfilRes>): EmpresaPerfilRes {
  return { ...emptyEmpresa(), ...e };
}

function emptyContaForm() {
  return {
    nome: "",
    ig_user_id: "",
    access_token: "",
  };
}

export function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [empresa, setEmpresa] = useState<EmpresaPerfilRes>(emptyEmpresa);
  const [editId, setEditId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(emptyContaForm);
  /** Dados vêm de /api/me/workspace (organização + contas no PostgreSQL). */
  const [useWorkspace, setUseWorkspace] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);
  /** API com META_APP_ID + SECRET + redirect (botão conectar). */
  const [metaOAuth, setMetaOAuth] = useState(false);
  const [metaOAuthMode, setMetaOAuthMode] = useState<"facebook" | "instagram">("facebook");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const status = await api.getAuthStatus();
        if (cancelled) return;
        setMetaOAuth(Boolean(status.metaOAuthConfigured));
        if (status.metaOAuthMode === "instagram" || status.metaOAuthMode === "facebook") {
          setMetaOAuthMode(status.metaOAuthMode);
        }
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

  useEffect(() => {
    const mo = searchParams.get("meta_oauth");
    if (!mo) return;
    if (mo === "ok") {
      setError(null);
      const t = getAuthToken();
      if (t) {
        void api.getMeWorkspace().then((data) => {
          setConfig(data);
          setEmpresa(mergeEmpresa(data.empresa));
        });
      }
    } else if (mo === "err") {
      const r = searchParams.get("reason");
      const base = r ? decodeURIComponent(r.replace(/\+/g, " ")) : "Não foi possível conectar ao Facebook.";
      const extra =
        /invalid platform app/i.test(base)
          ? "\n\nDesbloqueio: na API defina META_OAUTH_MODE=facebook (ou remova a variável), reinicie o serviço. No app Meta adicione o produto «Facebook Login» e o mesmo redirect OAuth (…/api/auth/meta/callback). O login passa pelo Facebook e continua a gravar Instagram no workspace."
          : "";
      setError(base + extra);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("meta_oauth");
    next.delete("reason");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

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
            ...contas.map((c) => ({ id: c.id, nome: c.nome, ig_user_id: c.ig_user_id })),
            {
              nome: form.nome.trim(),
              ig_user_id: form.ig_user_id.trim(),
              access_token: form.access_token.trim() || undefined,
            },
          ]
        : contas.map((c) =>
            c.id === editId
              ? {
                  id: c.id,
                  nome: form.nome.trim(),
                  ig_user_id: form.ig_user_id.trim(),
                  access_token: form.access_token.trim() || undefined,
                }
              : { id: c.id, nome: c.nome, ig_user_id: c.ig_user_id }
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
    const list = contas.filter((c) => c.id !== id).map((c) => ({ id: c.id, nome: c.nome, ig_user_id: c.ig_user_id }));
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
            placeholder="Ex.: imobiliária, clínica, e-commerce"
          />
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
            placeholder="O que o agente deve descobrir no lead (ex.: interesse em compra, agendar visita, orçamento)."
          />
          <button type="button" onClick={handleSaveEmpresa} disabled={saving} className="btn-primary">
            Salvar dados da empresa
          </button>
        </div>

        <div>
          <h2 className="font-display text-xl font-semibold text-slate-900">Contas Instagram para postar</h2>
          <p className="mt-2 text-sm text-slate-600">Adicione várias contas e escolha qual usar ao publicar no Postador.</p>

          {useWorkspace && metaOAuth && (
            <div className="card mt-4 space-y-3 border-indigo-200/80 bg-indigo-50/40">
              <div>
                <h3 className="font-semibold text-slate-900">Conectar com Facebook / Instagram</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Abre o login da Meta: escolha a <strong>página</strong> que tem o Instagram comercial vinculado. Os tokens de
                  postagem e de agente serão preenchidos automaticamente (o mesmo token de página, com as permissões do app).
                </p>
              </div>
              <button type="button" onClick={handleConectarMeta} disabled={saving} className="btn-primary">
                {saving ? "Redirecionando…" : "Conectar conta Meta"}
              </button>
              {metaOAuthMode === "instagram" && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-950">
                  <strong>Erro «Invalid platform app» no Instagram?</strong> O app ainda não é aceite no fluxo{" "}
                  <code className="rounded bg-white/90 px-1">instagram.com/oauth</code>. Na API use{" "}
                  <code className="rounded bg-white/90 px-1">META_OAUTH_MODE=facebook</code>, reinicie, e no Meta adicione{" "}
                  <strong>Facebook Login</strong> com o mesmo <code className="rounded bg-white/90 px-1">redirect_uri</code>. O
                  botão abre o login Facebook e liga a página com Instagram como antes.
                </div>
              )}
              <p className="text-xs text-slate-500">
                Na API: <code className="rounded bg-white/80 px-1">META_OAUTH_REDIRECT_URI</code> igual ao callback (ex.:{" "}
                <code className="rounded bg-white/80 px-1">…/api/auth/meta/callback</code>),{" "}
                <code className="rounded bg-white/80 px-1">PAINEL_PUBLIC_URL</code>. Se você usou o login da empresa no produto
                Instagram (URL <code className="rounded bg-white/80 px-1">instagram.com/oauth/authorize</code>), defina também{" "}
                <code className="rounded bg-white/80 px-1">META_OAUTH_MODE=instagram</code>.
              </p>
            </div>
          )}

          <ul className="mb-6 mt-4 space-y-3">
            {contas.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/90 bg-slate-50/80 p-4 shadow-sm"
              >
                <span className="font-semibold text-slate-800">{c.nome || "Sem nome"}</span>
                <span className="text-sm text-slate-500">({c.ig_user_id})</span>
                {c.has_token && <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Token postagem</span>}

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
                placeholder="ID do usuário Instagram (ig_user_id)"
              />
              <input
                type="password"
                value={form.access_token}
                onChange={(e) => setForm((f) => ({ ...f, access_token: e.target.value }))}
                className="input-field font-mono text-sm"
                placeholder={editId === "new" ? "Token de publicação Graph API (obrigatório)" : "Token postagem (vazio = manter)"}
              />

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

          {!editId && (
            <button
              type="button"
              onClick={() => {
                setEditId("new");
                setForm(emptyContaForm());
              }}
              className="btn-secondary border-indigo-300 font-semibold text-indigo-700 hover:border-indigo-400 hover:bg-indigo-50"
            >
              + Adicionar conta Instagram
            </button>
          )}
        </div>
      </div>
      )}
    </PageShell>
  );
}
