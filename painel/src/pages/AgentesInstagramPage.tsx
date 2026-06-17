import { useState } from "react";
import { Link } from "react-router-dom";
import { PageShell } from "../components/layout/PageShell";
import { useWorkspaceConfig } from "../hooks/useWorkspaceConfig";
import {
  api,
  getAuthToken,
  type ContaInstagramRes,
  type ContaInstagramInput,
} from "../api/client";

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

export function AgentesInstagramPage() {
  const { config, setConfig, loading, error, setError, useWorkspace, needLogin } = useWorkspaceConfig();
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(emptyContaForm);

  const contas = config?.contas_instagram ?? [];
  const defaultId = config?.instagram_default_id ?? null;

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
        c
          ? {
              ...c,
              contas_instagram: res.received?.contas_instagram ?? [],
              instagram_default_id: res.received?.instagram_default_id ?? null,
            }
          : null
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
      <PageShell title="Agentes Instagram" description="Carregando…" wide>
        <div className="card h-36 animate-pulse bg-slate-100/80" aria-hidden />
      </PageShell>
    );
  }

  return (
    <PageShell
      wide
      title="Agentes Instagram"
      description="Conta comercial, tokens Graph API e configuração dos agentes de comentário e Direct. Sincronize posts em Posts Instagram."
    >
      {needLogin && (
        <div className="alert-info mb-6">
          <p className="font-semibold">Login necessário</p>
          <Link to="/login" className="btn-primary mt-4 inline-flex">
            Ir para login
          </Link>
        </div>
      )}

      {error && <div className="alert-error mb-6">{error}</div>}

      {!needLogin && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold text-slate-900">Contas Instagram</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Cadastre o Instagram comercial que recebe comentários e DMs. O webhook n8n usa o{" "}
                <code className="rounded bg-slate-100 px-1 text-xs">ig_user_id</code> desta conta.
              </p>
            </div>
            {!editId && (
              <button
                type="button"
                onClick={() => {
                  setEditId("new");
                  setForm(emptyContaForm());
                }}
                disabled={saving}
                className="btn-primary shrink-0"
              >
                + Adicionar conta
              </button>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
            <p className="font-medium text-slate-900">Como conectar (setup manual)</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Instagram Business/Creator vinculado à Página do Facebook.</li>
              <li>Token de Página com permissões de mensagens e comentários.</li>
              <li>
                <strong>ig_user_id</strong> — ID numérico da conta (Graph API), não é o @usuario.
              </li>
              <li>Marque <strong>Agente ativo</strong> para o n8n processar webhooks desta conta.</li>
            </ol>
          </div>

          <ul className="space-y-3">
            {contas.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/90 bg-slate-50/80 p-4 shadow-sm"
              >
                <span className="font-semibold text-slate-800">{c.nome || "Sem nome"}</span>
                <span className="text-sm text-slate-500">({c.ig_user_id})</span>
                {c.has_token && (
                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Token</span>
                )}
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
                    <button
                      type="button"
                      onClick={() => handleSetDefault(c.id)}
                      disabled={saving}
                      className="btn-ghost text-indigo-600 hover:text-indigo-700"
                    >
                      Definir padrão
                    </button>
                  )}
                  <button type="button" onClick={() => startEdit(c)} disabled={saving} className="btn-ghost">
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveConta(c.id)}
                    disabled={saving}
                    className="btn-ghost text-red-600 hover:text-red-700"
                  >
                    Excluir
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {(editId === "new" || editId) && (
            <div className="card space-y-4 bg-slate-50/50">
              <h3 className="font-display text-lg font-semibold text-slate-900">
                {editId === "new" ? "Nova conta" : "Editar conta"}
              </h3>
              <input
                type="text"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                className="input-field"
                placeholder="Nome (ex.: @minhaempresa)"
              />
              <input
                type="text"
                value={form.ig_user_id}
                onChange={(e) => setForm((f) => ({ ...f, ig_user_id: e.target.value }))}
                className="input-field font-mono text-sm"
                placeholder="ID numérico Instagram comercial"
              />
              <input
                type="password"
                value={form.access_token}
                onChange={(e) => setForm((f) => ({ ...f, access_token: e.target.value }))}
                className="input-field font-mono text-sm"
                placeholder={editId === "new" ? "Token Graph API — obrigatório" : "Vazio = mantém token atual"}
              />

              <div className="space-y-3 rounded-xl border border-violet-200/90 bg-violet-50/50 p-4">
                <h4 className="font-semibold text-slate-900">Agente (comentários + Direct)</h4>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={form.agent_ativo}
                    onChange={(e) => setForm((f) => ({ ...f, agent_ativo: e.target.checked }))}
                    className="rounded border-slate-300"
                  />
                  Agente ativo nesta conta
                </label>
                <label className="label-field">Nome do assistente</label>
                <input
                  type="text"
                  value={form.agent_nome}
                  onChange={(e) => setForm((f) => ({ ...f, agent_nome: e.target.value }))}
                  className="input-field"
                  placeholder="Ex.: Ana — opcional"
                />
                <label className="label-field">Token do agente (opcional)</label>
                <input
                  type="password"
                  value={form.agent_access_token}
                  onChange={(e) => setForm((f) => ({ ...f, agent_access_token: e.target.value }))}
                  className="input-field font-mono text-sm"
                  placeholder="Vazio = usa token principal"
                />
                <label className="label-field">Refinamentos — comentários</label>
                <textarea
                  value={form.agent_prompt_comentarios}
                  onChange={(e) => setForm((f) => ({ ...f, agent_prompt_comentarios: e.target.value }))}
                  className="textarea-field min-h-[80px] font-mono text-xs"
                  placeholder="Tom e regras extras. Vazio = prompt-base interno."
                />
                <label className="label-field">Refinamentos — Direct</label>
                <textarea
                  value={form.agent_prompt_direct}
                  onChange={(e) => setForm((f) => ({ ...f, agent_prompt_direct: e.target.value }))}
                  className="textarea-field min-h-[80px] font-mono text-xs"
                  placeholder="Complementos de abordagem. Vazio = prompt-base interno."
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSaveConta}
                  disabled={
                    saving ||
                    !form.nome.trim() ||
                    !form.ig_user_id.trim() ||
                    (editId === "new" && !form.access_token.trim())
                  }
                  className="btn-primary"
                >
                  {saving ? "Salvando…" : editId === "new" ? "Adicionar conta" : "Salvar alterações"}
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
      )}
    </PageShell>
  );
}
