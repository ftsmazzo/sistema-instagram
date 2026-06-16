import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PageShell } from "../components/layout/PageShell";
import {
  api,
  getAuthToken,
  type LeadListItemRes,
  type WhatsappConnectionRes,
  type WhatsappConnectionState,
  type WhatsappObjetivo,
} from "../api/client";

const OBJETIVOS: { id: WhatsappObjetivo; label: string }[] = [
  { id: "link_produto", label: "Enviar link de produto/imóvel" },
  { id: "agendar_visita", label: "Agendar visita" },
  { id: "handoff_humano", label: "Encaminhar para humano" },
];

const DEFAULT_OBJETIVOS: WhatsappObjetivo[] = ["link_produto", "agendar_visita", "handoff_humano"];

type AgentForm = {
  agent_ativo: boolean;
  agent_nome: string;
  agent_prompt: string;
  objetivos: WhatsappObjetivo[];
  delay_primeira_msg_minutos: number;
};

function emptyAgentForm(): AgentForm {
  return {
    agent_ativo: false,
    agent_nome: "",
    agent_prompt: "",
    objetivos: [...DEFAULT_OBJETIVOS],
    delay_primeira_msg_minutos: 20,
  };
}

function connectionLabel(state: WhatsappConnectionState | undefined): string {
  if (state === "open") return "Conectado";
  if (state === "connecting") return "Aguardando leitura do QR";
  return "Desconectado";
}

function connectionBadgeClass(state: WhatsappConnectionState | undefined): string {
  if (state === "open") return "bg-emerald-100 text-emerald-800";
  if (state === "connecting") return "bg-amber-100 text-amber-900";
  return "bg-gray-100 text-gray-700";
}

function qrImageSrc(conn: WhatsappConnectionRes | null): string | null {
  if (!conn) return null;
  if (conn.qr_base64) return conn.qr_base64;
  if (conn.qr_code) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(conn.qr_code)}`;
  }
  return null;
}

function formatPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits ? `+${digits}` : null;
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    novo: "Novo",
    em_conversa: "Em conversa",
    qualificado: "Qualificado",
    handoff: "Handoff",
    convertido: "Convertido",
    perdido: "Perdido",
  };
  return map[status] ?? status;
}

export function WhatsAppPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);

  const [instanceName, setInstanceName] = useState("");
  const [connection, setConnection] = useState<WhatsappConnectionRes | null>(null);
  const [evolutionConfigured, setEvolutionConfigured] = useState(true);
  const [agentForm, setAgentForm] = useState<AgentForm>(emptyAgentForm);
  const [leads, setLeads] = useState<LeadListItemRes[]>([]);
  const [leadsTotal, setLeadsTotal] = useState(0);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const applyConnection = useCallback((conn: WhatsappConnectionRes) => {
    setConnection(conn);
    if (conn.instance_name) setInstanceName(conn.instance_name);
  }, []);

  const refreshConnection = useCallback(
    async (refreshQr = false) => {
      const conn = await api.agentes.getWhatsappConnection(refreshQr);
      if (!conn.ok) throw new Error(conn.error ?? "Falha ao consultar conexão.");
      applyConnection(conn);
      return conn;
    },
    [applyConnection]
  );

  const loadPage = useCallback(async () => {
    const [wa, leadsRes] = await Promise.all([
      api.agentes.getWhatsapp(),
      api.agentes.getLeads({ limit: 20, with_whatsapp: true }),
    ]);
    setEvolutionConfigured(wa.evolution_configured);
    setInstanceName(wa.instance?.instance_name ?? "");
    setConnection(null);
    setAgentForm({
      agent_ativo: wa.instance?.agent_ativo ?? false,
      agent_nome: wa.instance?.agent_nome ?? "",
      agent_prompt: wa.instance?.agent_prompt ?? "",
      objetivos: wa.instance?.objetivos?.length ? wa.instance.objetivos : [...DEFAULT_OBJETIVOS],
      delay_primeira_msg_minutos: wa.instance?.delay_primeira_msg_minutos ?? 20,
    });
    setLeads(leadsRes.leads);
    setLeadsTotal(leadsRes.total);

    if (wa.connection) {
      applyConnection({
        ok: true,
        configured: true,
        instance_name: wa.instance?.instance_name ?? null,
        connection_state: wa.connection.state,
        profile_name: wa.connection.profile_name,
        phone_number: wa.connection.phone_number,
        profile_picture_url: wa.connection.profile_picture_url,
        webhook_ok: wa.connection.webhook_ok,
      });
    } else if (wa.instance?.instance_name) {
      await refreshConnection(false);
    }
  }, [applyConnection, refreshConnection]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      if (!getAuthToken()) {
        setNeedLogin(true);
        setLoading(false);
        return;
      }
      try {
        await loadPage();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao carregar WhatsApp.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPage]);

  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (connection?.connection_state !== "connecting") return;

    pollRef.current = setInterval(async () => {
      try {
        const conn = await refreshConnection(true);
        if (conn.connection_state === "open") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        /* ignora erro transitório no poll */
      }
    }, 4000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [connection?.connection_state, refreshConnection]);

  const toggleObjetivo = (id: WhatsappObjetivo) => {
    setAgentForm((f) => {
      const has = f.objetivos.includes(id);
      const next = has ? f.objetivos.filter((o) => o !== id) : [...f.objetivos, id];
      return { ...f, objetivos: next.length ? next : f.objetivos };
    });
  };

  const handleConnect = async () => {
    const name = instanceName.trim();
    if (!name) {
      setError("Informe o nome da instância.");
      return;
    }
    setConnecting(true);
    setError(null);
    setSaved(false);
    try {
      const res = await api.agentes.connectWhatsapp(name);
      if (!res.ok) throw new Error(res.error ?? "Falha ao conectar.");
      applyConnection(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao conectar WhatsApp.";
      setError(msg === "Failed to fetch" ? "Falha de rede ao chamar a API. Tente de novo em alguns segundos." : msg);
    } finally {
      setConnecting(false);
    }
  };

  const handleRefreshQr = async () => {
    setError(null);
    try {
      await refreshConnection(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao atualizar QR.");
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setError(null);
    try {
      const res = await api.agentes.disconnectWhatsapp();
      if (!res.ok) throw new Error(res.error ?? "Falha ao desconectar.");
      await refreshConnection(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao desconectar WhatsApp.");
    } finally {
      setDisconnecting(false);
    }
  };

  const handleDeleteInstance = async () => {
    const name = instanceName.trim();
    if (!name) return;
    const ok = window.confirm(
      `Excluir a instância WhatsApp "${name}"?\n\nIsso desconecta e remove a instância no servidor, para você poder cadastrar outra.`
    );
    if (!ok) return;

    setDeleting(true);
    setError(null);
    try {
      const res = await api.agentes.deleteWhatsappInstance();
      if (!res.ok) throw new Error(res.error ?? "Falha ao excluir instância.");
      await loadPage();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao excluir instância.");
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.agentes.putWhatsapp({
        instance_name: instanceName.trim() || undefined,
        ...agentForm,
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const connectionState = connection?.connection_state ?? "close";
  const isConnected = connectionState === "open";
  const isConnecting = connectionState === "connecting";
  const hasInstanceName = Boolean(instanceName.trim());
  const qrSrc = !isConnected ? qrImageSrc(connection) : null;

  if (needLogin) {
    return (
      <PageShell title="WhatsApp" description="Configure o agente WhatsApp da Máquina de Vendas.">
        <div className="card border-amber-200 bg-amber-50/60">
          <p className="font-medium text-amber-950">Faça login para configurar o WhatsApp.</p>
          <Link to="/login" className="mt-3 inline-block text-sm font-semibold text-emerald-700 hover:underline">
            Ir para login
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="WhatsApp"
      description="Conecte seu número e configure o agente de atendimento."
    >
      {loading ? (
        <p className="text-sm text-gray-600">Carregando…</p>
      ) : (
        <div className="space-y-6">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
          )}
          {saved && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Configuração do agente salva.
            </div>
          )}

          {!evolutionConfigured && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Evolution não configurada no servidor. Peça para definir{" "}
              <code className="rounded bg-white/80 px-1">EVOLUTION_BASE_URL</code> e{" "}
              <code className="rounded bg-white/80 px-1">EVOLUTION_GLOBAL_API_KEY</code> na API.
            </div>
          )}

          <section className="card space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Conexão WhatsApp</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Escolha o nome da instância. O servidor cria tudo na Evolution e exibe o QR aqui.
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${connectionBadgeClass(connectionState)}`}
              >
                {connectionLabel(connectionState)}
              </span>
            </div>

            {isConnected ? (
              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                {connection?.profile_picture_url ? (
                  <img
                    src={connection.profile_picture_url}
                    alt=""
                    className="h-14 w-14 rounded-full border border-emerald-200 object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-xl font-bold text-emerald-700">
                    WA
                  </div>
                )}
                <div>
                  <p className="font-semibold text-gray-900">
                    {connection?.profile_name ?? connection?.instance_name ?? "WhatsApp conectado"}
                  </p>
                  <p className="text-sm text-gray-600">
                    Instância: <span className="font-mono">{connection?.instance_name}</span>
                  </p>
                  {formatPhone(connection?.phone_number) && (
                    <p className="text-sm text-gray-600">
                      Número: <span className="font-mono">{formatPhone(connection?.phone_number)}</span>
                    </p>
                  )}
                  {connection?.webhook_ok && (
                    <p className="mt-1 text-xs text-emerald-700">Webhook do agente configurado automaticamente.</p>
                  )}
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    disabled={disconnecting || !evolutionConfigured}
                    className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {disconnecting ? "Desconectando…" : "Desconectar"}
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteInstance}
                    disabled={deleting}
                    className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    {deleting ? "Excluindo…" : "Excluir"}
                  </button>
                </div>
              </div>
            ) : isConnecting ? (
              <div className="grid gap-6 md:grid-cols-[1fr_auto]">
                <div className="space-y-4">
                  <label className="block text-sm">
                    <span className="font-medium text-gray-700">Nome da instância</span>
                    <input
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm md:max-w-sm"
                      value={instanceName}
                      onChange={(e) => setInstanceName(e.target.value)}
                      placeholder="ex.: Agente"
                      disabled={hasInstanceName}
                    />
                    <span className="mt-1 block text-xs text-gray-500">
                      Letras, números, hífen e underscore. Ex.: Agente, maquina-vendas
                    </span>
                  </label>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleConnect}
                      disabled={connecting || !evolutionConfigured || !instanceName.trim()}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {connecting ? "Gerando QR…" : isConnecting ? "Atualizar conexão" : "Gerar QR Code"}
                    </button>
                    {isConnecting && (
                      <button
                        type="button"
                        onClick={handleRefreshQr}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Novo QR
                      </button>
                    )}
                  </div>

                  {isConnecting && (
                    <p className="text-sm text-amber-800">
                      Abra o WhatsApp no celular → Dispositivos conectados → Conectar dispositivo → escaneie o QR.
                      O código expira em ~30 segundos; use &quot;Novo QR&quot; se precisar.
                    </p>
                  )}
                </div>

                {qrSrc && (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-4">
                    <img src={qrSrc} alt="QR Code WhatsApp" className="h-[280px] w-[280px]" />
                    {connection?.pairing_code && (
                      <p className="mt-3 text-center text-sm text-gray-600">
                        Código de pareamento:{" "}
                        <span className="font-mono font-semibold">{connection.pairing_code}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : hasInstanceName ? (
              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                {connection?.profile_picture_url ? (
                  <img
                    src={connection.profile_picture_url}
                    alt=""
                    className="h-14 w-14 rounded-full border border-amber-200 object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-xl font-bold text-amber-700">
                    WA
                  </div>
                )}
                <div>
                  <p className="font-semibold text-gray-900">
                    {connection?.profile_name ?? connection?.instance_name ?? "WhatsApp desconectado"}
                  </p>
                  <p className="text-sm text-gray-600">
                    Instância: <span className="font-mono">{connection?.instance_name ?? instanceName}</span>
                  </p>
                  {formatPhone(connection?.phone_number) && (
                    <p className="text-sm text-gray-600">
                      Número: <span className="font-mono">{formatPhone(connection?.phone_number)}</span>
                    </p>
                  )}
                  <p className="mt-1 text-xs text-amber-800">Instância desconectada. Clique em Reconectar para gerar um novo QR.</p>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleConnect}
                    disabled={connecting || !evolutionConfigured}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {connecting ? "Gerando QR…" : "Reconectar"}
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteInstance}
                    disabled={deleting}
                    className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    {deleting ? "Excluindo…" : "Excluir"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-[1fr_auto]">
                <div className="space-y-4">
                  <label className="block text-sm">
                    <span className="font-medium text-gray-700">Nome da instância</span>
                    <input
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm md:max-w-sm"
                      value={instanceName}
                      onChange={(e) => setInstanceName(e.target.value)}
                      placeholder="ex.: Agente"
                      disabled={false}
                    />
                    <span className="mt-1 block text-xs text-gray-500">
                      Letras, números, hífen e underscore. Ex.: Agente, maquina-vendas
                    </span>
                  </label>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleConnect}
                      disabled={connecting || !evolutionConfigured || !instanceName.trim()}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {connecting ? "Gerando QR…" : "Gerar QR Code"}
                    </button>
                  </div>
                </div>

                {qrSrc && (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-4">
                    <img src={qrSrc} alt="QR Code WhatsApp" className="h-[280px] w-[280px]" />
                    {connection?.pairing_code && (
                      <p className="mt-3 text-center text-sm text-gray-600">
                        Código de pareamento:{" "}
                        <span className="font-mono font-semibold">{connection.pairing_code}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="card space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Agente WhatsApp</h2>
              <p className="mt-1 text-sm text-gray-600">
                Comportamento do assistente após a conexão. Salve quando quiser — não precisa reconectar.
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={agentForm.agent_ativo}
                onChange={(e) => setAgentForm((f) => ({ ...f, agent_ativo: e.target.checked }))}
              />
              <span className="font-medium text-gray-800">Agente WhatsApp ativo</span>
            </label>

            <label className="block text-sm md:max-w-xs">
              <span className="font-medium text-gray-700">Delay da 1ª mensagem da IA (minutos)</span>
              <input
                type="number"
                min={0}
                max={1440}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={agentForm.delay_primeira_msg_minutos}
                onChange={(e) =>
                  setAgentForm((f) => ({
                    ...f,
                    delay_primeira_msg_minutos: Math.min(1440, Math.max(0, Number(e.target.value) || 0)),
                  }))
                }
              />
              <span className="mt-1 block text-xs text-gray-500">
                Após a boas-vindas no Zap. Se o lead responder antes, a IA entra na hora. 0 = imediato.
              </span>
            </label>

            <label className="block text-sm">
              <span className="font-medium text-gray-700">Nome do agente (opcional)</span>
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={agentForm.agent_nome}
                onChange={(e) => setAgentForm((f) => ({ ...f, agent_nome: e.target.value }))}
                placeholder="Usa nome da empresa se vazio"
              />
            </label>

            <label className="block text-sm">
              <span className="font-medium text-gray-700">Prompt do agente WhatsApp (opcional)</span>
              <textarea
                className="mt-1 min-h-[120px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={agentForm.agent_prompt}
                onChange={(e) => setAgentForm((f) => ({ ...f, agent_prompt: e.target.value }))}
                placeholder="Vazio = template padrão com tom da empresa (Administração)"
              />
            </label>

            <fieldset>
              <legend className="text-sm font-medium text-gray-700">Objetivos programáveis</legend>
              <div className="mt-2 flex flex-wrap gap-3">
                {OBJETIVOS.map((o) => (
                  <label key={o.id} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={agentForm.objetivos.includes(o.id)}
                      onChange={() => toggleObjetivo(o.id)}
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !instanceName.trim()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? "Salvando…" : "Salvar configuração"}
            </button>
          </section>

          <section className="card">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Leads com WhatsApp</h2>
                <p className="text-sm text-gray-600">{leadsTotal} no CRM — capturados pelo agente Instagram.</p>
              </div>
            </div>

            {leads.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum lead com WhatsApp ainda. Teste o Direct no Instagram.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-600">
                      <th className="py-2 pr-4 font-medium">Nome</th>
                      <th className="py-2 pr-4 font-medium">Instagram</th>
                      <th className="py-2 pr-4 font-medium">WhatsApp</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 pr-4 font-medium">Objetivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead) => (
                      <tr key={lead.id} className="border-b border-gray-100">
                        <td className="py-2 pr-4">{lead.nome ?? "—"}</td>
                        <td className="py-2 pr-4">{lead.username_instagram ? `@${lead.username_instagram}` : "—"}</td>
                        <td className="py-2 pr-4 font-mono text-xs">{lead.whatsapp ?? "—"}</td>
                        <td className="py-2 pr-4">
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{statusLabel(lead.status)}</span>
                        </td>
                        <td className="py-2 pr-4 text-gray-600">{lead.objetivo ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </PageShell>
  );
}
