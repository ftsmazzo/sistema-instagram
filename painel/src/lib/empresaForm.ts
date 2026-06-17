import { DEFAULT_AGENDA_CONFIG, type EmpresaPerfilRes } from "../api/client";

export const AGENDA_DIAS: { id: number; label: string }[] = [
  { id: 1, label: "Seg" },
  { id: 2, label: "Ter" },
  { id: 3, label: "Qua" },
  { id: 4, label: "Qui" },
  { id: 5, label: "Sex" },
  { id: 6, label: "Sáb" },
  { id: 0, label: "Dom" },
];

export function emptyEmpresa(): EmpresaPerfilRes {
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
  };
}

export function mergeEmpresa(e?: Partial<EmpresaPerfilRes>): EmpresaPerfilRes {
  const base = emptyEmpresa();
  if (!e) return base;
  return {
    ...base,
    ...e,
    agenda_config: { ...DEFAULT_AGENDA_CONFIG, ...e.agenda_config },
  };
}
