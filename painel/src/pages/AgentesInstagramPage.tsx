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

function contaSummary(c: ContaInstagramRes, isDefault: boolean): string {
  const parts = [c.nome || c.ig_user_id];
  if (c.agent_ativo) parts.push("Agente ativo");
  if (isDefault) parts.push("Padrão");
  if (c.has_token) parts.push("Token ok");
  return parts.join(" · ");
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
      setError("Nome e ig_user_id são obrigatórios.");
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
    if (!confirm("Remover esta conta?")) return;
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

  const cancelEdit = () => {
    setEditId(null);
    setForm(emptyContaForm());
  };

  if (loading) {
    return (
      <PageShell title="Agentes Instagram" description="Carregando…" wide>
        <div className="card h-36 animate-pulse bg-slate-100/80" aria-hidden />
      </PageShell>
    );
  }

  return (
    <PageShell wide title="Agentes Instagram" description="Conta Instagram e agente de comentário/Direct.">
      {needLogin && (
        <div className="alert-info mb-6">
          <Link to="/login" className="btn-primary inline-flex">
            Fazer login
          </Link>
        </div>
      )}

      {error && <div className="alert-error mb-6">{error}</div>}

      {!needLogin && (
        <section className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-semibold text-slate-900">Conta Instagram</h2>
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

          {editId ? (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/40 p-4">
              <input
                type="text"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                className="input-field"
                placeholder="Nome"
              />
              <input
                type="text"
                value={form.ig_user_id}
                onChange={(e) => setForm((f) => ({ ...f, ig_user_id: e.target.value }))}
                className="input-field font-mono text-sm"
                placeholder="ig_user_id"
              />
              <input
                type="password"
                value={form.access_token}
                onChange={(e) => setForm((f) => ({ ...f, access_token: e.target.value }))}
                className="input-field font-mono text-sm"
                placeholder={editId === "new" ? "Token de Página (EAA…)" : "Token (vazio = mantém)"}
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.agent_ativo}
                  onChange={(e) => setForm((f) => ({ ...f, agent_ativo: e.target.checked }))}
                />
                Agente ativo
              </label>
              <input
                type="text"
                value={form.agent_nome}
                onChange={(e) => setForm((f) => ({ ...f, agent_nome: e.target.value }))}
                className="input-field"
                placeholder="Nome do assistente (opcional)"
              />
              <input
                type="password"
                value={form.agent_access_token}
                onChange={(e) => setForm((f) => ({ ...f, agent_access_token: e.target.value }))}
                className="input-field font-mono text-sm"
                placeholder="Token agente (opcional)"
              />
              <textarea
                value={form.agent_prompt_comentarios}
                onChange={(e) => setForm((f) => ({ ...f, agent_prompt_comentarios: e.target.value }))}
                className="textarea-field min-h-[72px] font-mono text-xs"
                placeholder="Refinamentos — comentários (opcional)"
              />
              <textarea
                value={form.agent_prompt_direct}
                onChange={(e) => setForm((f) => ({ ...f, agent_prompt_direct: e.target.value }))}
                className="textarea-field min-h-[72px] font-mono text-xs"
                placeholder="Refinamentos — Direct (opcional)"
              />
              <div className="flex flex-wrap gap-2 pt-1">
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
                  {saving ? "Salvando…" : editId === "new" ? "Adicionar" : "Salvar"}
                </button>
                <button type="button" onClick={cancelEdit} className="btn-secondary">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <ul className="space-y-2">
              {contas.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/40 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{c.nome || c.ig_user_id}</p>
                    <p className="text-xs text-slate-500">{contaSummary(c, defaultId === c.id)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {defaultId !== c.id && (
                      <button
                        type="button"
                        onClick={() => handleSetDefault(c.id)}
                        disabled={saving}
                        className="btn-ghost text-xs"
                      >
                        Padrão
                      </button>
                    )}
                    <button type="button" onClick={() => startEdit(c)} disabled={saving} className="btn-secondary text-sm">
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveConta(c.id)}
                      disabled={saving}
                      className="btn-ghost text-sm text-red-600"
                    >
                      Excluir
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </PageShell>
  );
}
