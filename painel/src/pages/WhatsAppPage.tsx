import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageShell } from "../components/layout/PageShell";
import {
  api,
  getAuthToken,
  type LeadListItemRes,
  type WhatsappInstanceRes,
  type WhatsappObjetivo,
} from "../api/client";

const OBJETIVOS: { id: WhatsappObjetivo; label: string }[] = [
  { id: "link_produto", label: "Enviar link de produto/imóvel" },
  { id: "agendar_visita", label: "Agendar visita" },
  { id: "handoff_humano", label: "Encaminhar para humano" },
];

function emptyForm() {
  return {
    instance_name: "",
    evolution_base_url: "",
    agent_ativo: false,
    agent_nome: "",
    agent_prompt: "",
    objetivos: ["link_produto", "agendar_visita", "handoff_humano"] as WhatsappObjetivo[],
    status: "pending",
    delay_primeira_msg_minutos: 20,
  };
}

function instanceToForm(instance: WhatsappInstanceRes | null) {
  if (!instance) return emptyForm();
  return {
    instance_name: instance.instance_name,
    evolution_base_url: instance.evolution_base_url,
    agent_ativo: instance.agent_ativo,
    agent_nome: instance.agent_nome,
    agent_prompt: instance.agent_prompt,
    objetivos: instance.objetivos?.length
      ? instance.objetivos
      : (["link_produto", "agendar_visita", "handoff_humano"] as WhatsappObjetivo[]),
    status: instance.status,
    delay_primeira_msg_minutos: instance.delay_primeira_msg_minutos ?? 20,
  };
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
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [leads, setLeads] = useState<LeadListItemRes[]>([]);
  const [leadsTotal, setLeadsTotal] = useState(0);

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
        const [wa, leadsRes] = await Promise.all([
          api.agentes.getWhatsapp(),
          api.agentes.getLeads({ limit: 20, with_whatsapp: true }),
        ]);
        if (cancelled) return;
        setForm(instanceToForm(wa.instance));
        setLeads(leadsRes.leads);
        setLeadsTotal(leadsRes.total);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao carregar WhatsApp.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleObjetivo = (id: WhatsappObjetivo) => {
    setForm((f) => {
      const has = f.objetivos.includes(id);
      const next = has ? f.objetivos.filter((o) => o !== id) : [...f.objetivos, id];
      return { ...f, objetivos: next.length ? next : f.objetivos };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.agentes.putWhatsapp(form);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

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
      description="Instância Evolution, objetivos do agente e leads com WhatsApp capturados pelo Instagram."
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
              Configuração salva. Na Fase 2 conectaremos o workflow n8n a{" "}
              <code className="rounded bg-white/80 px-1">GET /api/internal/whatsapp-agent-config</code>.
            </div>
          )}

          <section className="card space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Instância Evolution</h2>
              <p className="mt-1 text-sm text-gray-600">
                Mesmos dados usados no n8n para enviar mensagens. A API key fica na credencial Evolution do n8n.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Nome da instância</span>
                <input
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={form.instance_name}
                  onChange={(e) => setForm((f) => ({ ...f, instance_name: e.target.value }))}
                  placeholder="ex.: maquina-vendas"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">URL base Evolution</span>
                <input
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={form.evolution_base_url}
                  onChange={(e) => setForm((f) => ({ ...f, evolution_base_url: e.target.value }))}
                  placeholder="https://sua-evolution.easypanel.host"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.agent_ativo}
                onChange={(e) => setForm((f) => ({ ...f, agent_ativo: e.target.checked }))}
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
                value={form.delay_primeira_msg_minutos}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    delay_primeira_msg_minutos: Math.min(1440, Math.max(0, Number(e.target.value) || 0)),
                  }))
                }
              />
              <span className="mt-1 block text-xs text-gray-500">
                Após a boas-vindas no Zap. Se o lead responder antes, a IA entra na hora (Fase 2). 0 = imediato.
              </span>
            </label>

            <label className="block text-sm">
              <span className="font-medium text-gray-700">Nome do agente (opcional)</span>
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={form.agent_nome}
                onChange={(e) => setForm((f) => ({ ...f, agent_nome: e.target.value }))}
                placeholder="Usa nome da empresa se vazio"
              />
            </label>

            <label className="block text-sm">
              <span className="font-medium text-gray-700">Prompt do agente WhatsApp (opcional)</span>
              <textarea
                className="mt-1 min-h-[120px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={form.agent_prompt}
                onChange={(e) => setForm((f) => ({ ...f, agent_prompt: e.target.value }))}
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
                      checked={form.objetivos.includes(o.id)}
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
              disabled={saving}
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

          <section className="rounded-lg border border-dashed border-gray-300 bg-gray-50/80 px-4 py-3 text-sm text-gray-700">
            <p className="font-medium text-gray-900">Teste da Fase 1 (API)</p>
            <p className="mt-1">
              Após salvar acima, o n8n pode chamar:{" "}
              <code className="rounded bg-white px-1">
                GET /api/internal/whatsapp-agent-config?instance=NOME&phone=5516999998888
              </code>{" "}
              com header <code className="rounded bg-white px-1">X-Internal-Secret</code>.
            </p>
          </section>
        </div>
      )}
    </PageShell>
  );
}
