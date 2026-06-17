import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageShell } from "../components/layout/PageShell";
import {
  ConfigSectionCard,
  comercialSummary,
  perfilSummary,
  qualificacaoSummary,
} from "../components/config/ConfigSectionCard";
import { useWorkspaceConfig } from "../hooks/useWorkspaceConfig";
import { AGENDA_DIAS, emptyEmpresa, mergeEmpresa } from "../lib/empresaForm";
import { api, getAuthToken, type EmpresaPerfilRes } from "../api/client";

type EmpresaSection = "perfil" | "qualificacao" | "comercial";

export function AdminPage() {
  const { config, setConfig, loading, error, setError, useWorkspace, needLogin } = useWorkspaceConfig();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editingSection, setEditingSection] = useState<EmpresaSection | null>(null);
  const [empresa, setEmpresa] = useState<EmpresaPerfilRes>(emptyEmpresa);
  const savedEmpresa = mergeEmpresa(config?.empresa);

  useEffect(() => {
    if (config?.empresa) setEmpresa(mergeEmpresa(config.empresa));
  }, [config?.empresa]);

  const cancelEdit = () => {
    setEmpresa(savedEmpresa);
    setEditingSection(null);
  };

  const startEdit = (section: EmpresaSection) => {
    setEmpresa(savedEmpresa);
    setEditingSection(section);
  };

  const handleSaveEmpresa = (onSuccess?: () => void) => {
    setSaving(true);
    setError(null);
    const p =
      useWorkspace && getAuthToken()
        ? api.putMeWorkspace({ empresa })
        : api.putConfig({ empresa });
    p.then((res) => {
      setConfig((c) => (c ? { ...c, empresa: res.received?.empresa ?? c.empresa } : null));
      setSaved(true);
      onSuccess?.();
    })
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao salvar"))
      .finally(() => setSaving(false));
  };

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 4000);
    return () => clearTimeout(t);
  }, [saved]);

  if (loading) {
    return (
      <PageShell title="Empresa" description="Carregando configuração…" wide>
        <div className="card h-36 animate-pulse bg-slate-100/80" aria-hidden />
      </PageShell>
    );
  }

  return (
    <PageShell
      wide
      title="Empresa"
      description="Perfil, qualificação e atendimento comercial."
    >
      {needLogin && (
        <div className="alert-info mb-6">
          <p className="font-semibold">Login necessário</p>
          <p className="mt-1 opacity-90">As configurações estão vinculadas à sua organização.</p>
          <Link to="/login" className="btn-primary mt-4 inline-flex">
            Ir para login
          </Link>
        </div>
      )}

      {error && <div className="alert-error mb-6">{error}</div>}
      {saved && (
        <div className="alert-success mb-6 text-sm">Configurações salvas.</div>
      )}

      {!needLogin && (
        <div className="space-y-6">
          <ConfigSectionCard
            title="Perfil da empresa"
            description="Contexto da marca que os agentes usam para falar como sua empresa."
            editing={editingSection === "perfil"}
            onEdit={() => startEdit("perfil")}
            onCancel={cancelEdit}
            onSave={() => handleSaveEmpresa(() => setEditingSection(null))}
            saving={saving}
            summary={perfilSummary(savedEmpresa)}
          >
            <label className="label-field">Nome (razão social / registro)</label>
            <input
              type="text"
              value={empresa.nome}
              onChange={(e) => setEmpresa((x) => ({ ...x, nome: e.target.value }))}
              className="input-field"
              placeholder="Ex.: Fabrica IA Ltda"
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
              placeholder="Ex.: clínica, e-commerce, imobiliária"
            />
            <label className="label-field">Cidade / região de atuação</label>
            <input
              type="text"
              value={empresa.cidade}
              onChange={(e) => setEmpresa((x) => ({ ...x, cidade: e.target.value }))}
              className="input-field"
            />
            <label className="label-field">Tom de voz</label>
            <input
              type="text"
              value={empresa.tom_voz}
              onChange={(e) => setEmpresa((x) => ({ ...x, tom_voz: e.target.value }))}
              className="input-field"
              placeholder="Ex.: cordial e direto, consultivo"
            />
            <label className="label-field">Sobre a empresa</label>
            <textarea
              value={empresa.sobre}
              onChange={(e) => setEmpresa((x) => ({ ...x, sobre: e.target.value }))}
              className="textarea-field min-h-[100px]"
              placeholder="1–3 frases: o que faz, para quem, diferencial."
            />
          </ConfigSectionCard>

          <ConfigSectionCard
            title="Qualificação de leads"
            description="O que o agente deve descobrir antes de passar para WhatsApp ou consultor humano."
            editing={editingSection === "qualificacao"}
            onEdit={() => startEdit("qualificacao")}
            onCancel={cancelEdit}
            onSave={() => handleSaveEmpresa(() => setEditingSection(null))}
            saving={saving}
            summary={qualificacaoSummary(savedEmpresa)}
          >
            <label className="label-field">Objetivo de qualificação</label>
            <textarea
              value={empresa.objetivo_qualificacao}
              onChange={(e) => setEmpresa((x) => ({ ...x, objetivo_qualificacao: e.target.value }))}
              className="textarea-field min-h-[88px]"
              placeholder="Ex.: descobrir interesse real, urgência e obter WhatsApp com naturalidade."
            />
            <label className="label-field">Critérios (um por linha)</label>
            <textarea
              value={empresa.criterios_qualificacao ?? ""}
              onChange={(e) => setEmpresa((x) => ({ ...x, criterios_qualificacao: e.target.value }))}
              className="textarea-field min-h-[88px] font-mono text-sm"
              placeholder={"Nome do lead\nInteresse / necessidade\nPrazo ou urgência\nOrçamento ou perfil"}
            />
          </ConfigSectionCard>

          <ConfigSectionCard
            title="Atendimento comercial"
            description="Links, agenda e handoff usados pelos agentes WhatsApp e Instagram Direct."
            editing={editingSection === "comercial"}
            onEdit={() => startEdit("comercial")}
            onCancel={cancelEdit}
            onSave={() => handleSaveEmpresa(() => setEditingSection(null))}
            saving={saving}
            summary={comercialSummary(savedEmpresa)}
          >
            <label className="label-field">Link de produto / serviço</label>
            <input
              type="url"
              value={empresa.link_produto_servico ?? ""}
              onChange={(e) => setEmpresa((x) => ({ ...x, link_produto_servico: e.target.value }))}
              className="input-field text-sm"
              placeholder="https://… — página que o agente pode enviar ao lead"
            />
            <label className="label-field">Local do compromisso</label>
            <input
              type="text"
              value={empresa.agenda_local ?? ""}
              onChange={(e) => setEmpresa((x) => ({ ...x, agenda_local: e.target.value }))}
              className="input-field"
              placeholder="Ex.: Google Meet, endereço da loja, link de videochamada"
            />
            <label className="label-field">WhatsApp do consultor humano</label>
            <input
              type="text"
              value={empresa.handoff_whatsapp ?? ""}
              onChange={(e) => setEmpresa((x) => ({ ...x, handoff_whatsapp: e.target.value }))}
              className="input-field font-mono text-sm"
              placeholder="16999998888 — recebe alerta quando lead for qualificado"
            />
            <fieldset className="space-y-2 rounded-lg border border-slate-200 bg-white/60 p-4">
              <legend className="px-1 text-sm font-semibold text-slate-800">Horários para agendamento</legend>
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
                        on ? "bg-violet-100 text-violet-900 ring-violet-300" : "bg-white text-slate-600 ring-slate-300"
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-sm">
                  <span className="text-slate-700">Início</span>
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
                  <span className="text-slate-700">Fim</span>
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
                  <span className="text-slate-700">Duração (min)</span>
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
          </ConfigSectionCard>
        </div>
      )}
    </PageShell>
  );
}
