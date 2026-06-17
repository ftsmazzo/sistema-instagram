import type { CrmCadenciaEtapa } from "./crmCadenciaConfig.js";
import { BELEZA_SEGMENTO_KEYWORDS, PROFISSIONAIS_SEGMENTO_KEYWORDS } from "./segmentoNichos.js";

export type CadenciaPreset = {
  id: string;
  label: string;
  segmentos: string[];
  etapas: CrmCadenciaEtapa[];
};

export const CADENCIA_PRESETS: CadenciaPreset[] = [
  {
    id: "imobiliaria",
    label: "Imobiliária — visita e proposta",
    segmentos: ["imob", "imóvel", "imovel", "corretor", "incorporadora"],
    etapas: [
      {
        horas_apos_parada: 24,
        mensagem:
          "Oi {nome}! Sobre {objetivo} — ainda posso te enviar opções ou agendar uma visita? Me avisa o melhor horário 🙂",
      },
      {
        horas_apos_parada: 72,
        mensagem:
          "Oi {nome}, tudo bem? Vi que você demonstrou interesse em {objetivo}. Tenho novidades que podem encaixar no que você busca — quer que eu te mande?",
      },
      {
        horas_apos_parada: 168,
        mensagem:
          "Último contato por aqui, {nome}. Se {objetivo} ainda fizer sentido, responda que retomo com proposta/visita. Abraço da {empresa}!",
      },
    ],
  },
  {
    id: "clinica",
    label: "Clínica / saúde — agendar consulta",
    segmentos: ["clínica", "clinica", "saúde", "saude", "médic", "medic", "odont", "fisioter", "psicolog", "nutric"],
    etapas: [
      {
        horas_apos_parada: 24,
        mensagem:
          "Oi {nome}! Posso reservar um horário para você sobre {objetivo}? A {empresa} tem agenda esta semana — prefere manhã ou tarde?",
      },
      {
        horas_apos_parada: 72,
        mensagem:
          "Oi {nome}, passando para lembrar da sua consulta sobre {objetivo}. Ainda posso encaixar você — me confirma se quer agendar?",
      },
      {
        horas_apos_parada: 168,
        mensagem:
          "Oi {nome}, última mensagem por aqui. Se ainda quiser cuidar de {objetivo}, é só responder. Fico à disposição, {empresa}.",
      },
    ],
  },
  {
    id: "beleza",
    label: "Beleza — barbearia, salão e estética",
    segmentos: [...BELEZA_SEGMENTO_KEYWORDS],
    etapas: [
      {
        horas_apos_parada: 24,
        mensagem:
          "Oi {nome}! Vi seu interesse em {objetivo} — posso reservar um horário na {empresa}? Me diz se prefere manhã, tarde ou fim de semana 🙂",
      },
      {
        horas_apos_parada: 72,
        mensagem:
          "Oi {nome}, tudo bem? Ainda tenho horários essa semana para {objetivo}. Quer que eu te encaixe? Me avisa o melhor dia!",
      },
      {
        horas_apos_parada: 168,
        mensagem:
          "Último contato por aqui, {nome}. Se {objetivo} ainda fizer sentido, responde que te mando os horários disponíveis. {empresa} 💇",
      },
    ],
  },
  {
    id: "profissionais",
    label: "Profissionais liberais — advogado, contador e similares",
    segmentos: [...PROFISSIONAIS_SEGMENTO_KEYWORDS, "financeiro"],
    etapas: [
      {
        horas_apos_parada: 24,
        mensagem:
          "Oi {nome}! Sobre {objetivo} — posso agendar uma conversa rápida para entender seu caso e te orientar? Prefere call ou mensagem?",
      },
      {
        horas_apos_parada: 72,
        mensagem:
          "Oi {nome}, retomando nosso contato sobre {objetivo}. A {empresa} pode te passar um panorama inicial — quer que eu te explique os próximos passos?",
      },
      {
        horas_apos_parada: 168,
        mensagem:
          "Última mensagem por aqui, {nome}. Se {objetivo} ainda for uma prioridade, responda que priorizo seu atendimento. {empresa}",
      },
    ],
  },
  {
    id: "servicos",
    label: "Serviços B2B — orçamento e call",
    segmentos: ["serviço", "servico", "consultoria", "agência", "agencia", "software", "b2b"],
    etapas: [
      {
        horas_apos_parada: 24,
        mensagem:
          "Oi {nome}! Sobre {objetivo} — posso te mandar um resumo ou agendar uma call rápida de 15 min? Qual funciona melhor?",
      },
      {
        horas_apos_parada: 72,
        mensagem:
          "Oi {nome}, retomando nossa conversa sobre {objetivo}. A {empresa} preparou material que pode te ajudar na decisão — quer receber?",
      },
      {
        horas_apos_parada: 168,
        mensagem:
          "Fechando o ciclo por aqui, {nome}. Se {objetivo} ainda for prioridade, me chama que priorizo seu atendimento.",
      },
    ],
  },
  {
    id: "ecommerce",
    label: "E-commerce — fechar compra",
    segmentos: ["e-commerce", "ecommerce", "loja", "produto", "varejo"],
    etapas: [
      {
        horas_apos_parada: 24,
        mensagem:
          "Oi {nome}! Vi seu interesse em {objetivo}. Posso te passar condição especial ou tirar dúvida sobre entrega/pagamento?",
      },
      {
        horas_apos_parada: 48,
        mensagem:
          "Oi {nome}! Ainda pensando em {objetivo}? Tenho um cupom/link exclusivo se quiser fechar hoje — me avisa 🙂",
      },
      {
        horas_apos_parada: 120,
        mensagem:
          "Última chance por aqui, {nome}! Se {objetivo} ainda interessa, responde que te ajudo a finalizar. {empresa}",
      },
    ],
  },
];

export function matchCadenciaPreset(segmento: string): CadenciaPreset | null {
  const s = segmento.toLowerCase().trim();
  if (!s) return null;
  for (const preset of CADENCIA_PRESETS) {
    if (preset.segmentos.some((k) => s.includes(k))) return preset;
  }
  return null;
}

export function getCadenciaPresetById(id: string): CadenciaPreset | null {
  return CADENCIA_PRESETS.find((p) => p.id === id) ?? null;
}
