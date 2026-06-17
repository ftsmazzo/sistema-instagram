import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ContaInstagramRes, type PostagemListItemRes } from "../api/client";
import { PageShell } from "../components/layout/PageShell";

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function captionPreview(caption: string | null, max = 120): string {
  const t = (caption ?? "").trim();
  if (!t) return "(sem legenda)";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function PostThumb({ mediaUrl, mediaType }: { mediaUrl: string | null; mediaType: string | null }) {
  const [broken, setBroken] = useState(false);
  const label = mediaType ?? "mídia";

  if (!mediaUrl || broken) {
    return (
      <div className="flex h-24 w-24 flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-100 px-1 text-center text-[10px] text-slate-400">
        <span>{broken ? "indisponível" : label}</span>
      </div>
    );
  }

  return (
    <img
      src={mediaUrl}
      alt=""
      className="h-24 w-24 rounded-lg border border-slate-200 bg-slate-100 object-cover"
      onError={() => setBroken(true)}
    />
  );
}

export function PostagensPage() {
  const [postagens, setPostagens] = useState<PostagemListItemRes[]>([]);
  const [total, setTotal] = useState(0);
  const [contas, setContas] = useState<ContaInstagramRes[]>([]);
  const [contaId, setContaId] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [postsRes, cfg] = await Promise.all([
        api.postagens.list({
          limit: 50,
          instagram_account_id: contaId || undefined,
        }),
        api.getMeWorkspace(),
      ]);
      setPostagens(postsRes.postagens);
      setTotal(postsRes.total);
      const list = cfg.contas_instagram ?? [];
      setContas(list);
      if (!contaId && list[0]?.id) setContaId(list[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar posts.");
      if (!silent) {
        setPostagens([]);
        setTotal(0);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [contaId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    setMessage(null);
    setError(null);
    try {
      const res = await api.postagens.sync({
        instagram_account_id: contaId || undefined,
        limit: 50,
      });
      setMessage(
        `${res.synced} post(s) sincronizado(s) da conta ${res.account_nome}. Os agentes passam a usar a legenda destes posts.`
      );
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na sincronização.");
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (p: PostagemListItemRes) => {
    const preview = captionPreview(p.caption_post, 60);
    if (
      !window.confirm(
        `Remover este post do CRM?\n\n"${preview}"\n\nComentários e leads já capturados não serão apagados.`
      )
    ) {
      return;
    }
    setDeletingId(p.id);
    setError(null);
    try {
      await api.postagens.delete(p.id);
      setMessage("Post removido do CRM.");
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao remover post.");
    } finally {
      setDeletingId(null);
    }
  };

  const semConta = contas.length === 0;

  return (
    <PageShell
      title="Posts do Instagram"
      description={
        <>
          Sincronize os posts que você já publicou no Instagram. Eles alimentam o contexto dos agentes de{" "}
          <strong className="text-slate-700">comentário</strong>, <strong className="text-slate-700">Direct</strong> e{" "}
          <strong className="text-slate-700">WhatsApp</strong>. Remova entradas inválidas ou posts que já foram apagados no Instagram.
        </>
      }
    >
      {semConta && (
        <div className="alert-warn mb-6 text-sm">
          Nenhuma conta Instagram cadastrada.{" "}
          <Link to="/admin" className="font-semibold text-amber-900 underline">
            Configure em Administração
          </Link>{" "}
          (token + ig_user_id) antes de sincronizar.
        </div>
      )}

      <div className="card mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          {contas.length > 1 && (
            <div>
              <label className="label-field" htmlFor="conta-sync">
                Conta Instagram
              </label>
              <select
                id="conta-sync"
                className="input-field min-w-[220px]"
                value={contaId}
                onChange={(e) => setContaId(e.target.value)}
              >
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome || c.ig_user_id}
                  </option>
                ))}
              </select>
            </div>
          )}
          {contas.length === 1 && (
            <p className="text-sm text-slate-600">
              Conta: <strong>{contas[0].nome || contas[0].ig_user_id}</strong>
            </p>
          )}
        </div>
        <button
          type="button"
          className="btn-primary shrink-0"
          disabled={syncing || semConta}
          onClick={() => void handleSync()}
        >
          {syncing ? "Sincronizando…" : "Sincronizar do Instagram"}
        </button>
      </div>

      {message && <div className="alert-success mb-4 text-sm">{message}</div>}
      {error && <div className="alert-error mb-4 text-sm">{error}</div>}

      <p className="mb-4 text-sm text-slate-600">
        {total} post(s) no CRM
        {loading ? " · carregando…" : null}
      </p>

      {loading ? (
        <p className="text-sm text-slate-500">Carregando posts…</p>
      ) : postagens.length === 0 ? (
        <div className="card border-dashed border-slate-300 bg-slate-50/50 p-8 text-center">
          <p className="text-slate-700 font-medium">Nenhum post sincronizado ainda.</p>
          <p className="mt-2 text-sm text-slate-500">
            Clique em <strong>Sincronizar do Instagram</strong> para importar as publicações recentes via Graph API.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {postagens.map((p) => (
            <li
              key={p.id_post}
              className="card flex flex-col gap-4 sm:flex-row sm:items-start transition-shadow hover:shadow-md"
            >
              <div className="shrink-0">
                <PostThumb mediaUrl={p.media_url} mediaType={p.media_type} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                    {p.media_type ?? "POST"}
                  </span>
                  <span className="text-xs text-slate-500">{formatDate(p.data_post)}</span>
                </div>
                <p className="mt-2 text-sm text-slate-800 leading-relaxed">{captionPreview(p.caption_post)}</p>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-medium text-slate-500">
                  <span>{p.comentarios_count} comentário(s)</span>
                  <span>{p.leads_count} lead(s)</span>
                  {p.link_post && (
                    <a
                      href={p.link_post}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:text-indigo-800"
                    >
                      Ver no Instagram →
                    </a>
                  )}
                  <button
                    type="button"
                    className="ml-auto text-red-600 hover:text-red-800 disabled:opacity-50"
                    disabled={deletingId === p.id}
                    onClick={() => void handleDelete(p)}
                  >
                    {deletingId === p.id ? "Removendo…" : "Remover do CRM"}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
