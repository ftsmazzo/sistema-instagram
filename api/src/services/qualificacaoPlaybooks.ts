/**
 * Playbooks de qualificação — configuram Empresa em poucos cliques.
 * Os campos preenchidos alimentam buildDefaultPromptDirect e buildDefaultPromptWhatsapp.
 */

import {
  formatAgendaForPrompt,
  formatCriteriosForPrompt,
  parseAgendaConfig,
  type AgendaConfig,
} from "./empresaConfigHelpers.js";

export type QualificacaoPlaybookId =
  | "servicos_b2b"
  | "imobiliario"
  | "beleza_estetica"
  | "saude_clinica"
  | "ecommerce"
  | "educacao";

export type QualificacaoCriterio = {
  id: string;
  label: string;
  /** Como o agente deve descobrir isso na conversa (humano, não checklist). */
  pergunta_guia: string;
  obrigatorio: boolean;
};

export type QualificacaoPlaybook = {
  id: QualificacaoPlaybookId;
  label: string;
  descricao: string;
  emoji: string;
  segmento_keywords: string[];
  segmento: string;
  tom_voz: string;
  sobre_exemplo: string;
  objetivo_qualificacao: string;
  criterios: QualificacaoCriterio[];
  /** O que significa “deu certo” para o negócio. */
  resultado_esperado: string;
};

export const QUALIFICACAO_PLAYBOOKS: QualificacaoPlaybook[] = [
  {
    id: "servicos_b2b",
    emoji: "⚡",
    label: "Serviços & Tecnologia",
    descricao: "Software, automação, agência, consultoria — lead com dor clara e decisão.",
    segmento_keywords: [
      "software",
      "saas",
      "automação",
      "automacao",
      "agência",
      "agencia",
      "consultoria",
      "marketing",
      "ia",
      "inteligência artificial",
      "b2b",
      "serviço",
      "servico",
      "tecnologia",
    ],
    segmento: "Serviços & tecnologia B2B",
    tom_voz: "consultivo, direto e humano — especialista que ouve antes de vender",
    sobre_exemplo:
      "Ajudamos empresas a vender e atender melhor com automação e presença digital (Instagram, WhatsApp e IA).",
    objetivo_qualificacao:
      "Entender a dor do negócio, urgência e encaminhar para uma conversa no WhatsApp com quem pode fechar.",
    criterios: [
      {
        id: "nome",
        label: "Nome para contato",
        pergunta_guia: "Como prefere ser chamado?",
        obrigatorio: true,
      },
      {
        id: "dor",
        label: "Problema ou objetivo principal",
        pergunta_guia: "O que você quer resolver agora no seu negócio?",
        obrigatorio: true,
      },
      {
        id: "urgencia",
        label: "Prazo ou urgência",
        pergunta_guia: "É para agora ou você está só pesquisando?",
        obrigatorio: true,
      },
      {
        id: "whatsapp",
        label: "WhatsApp",
        pergunta_guia: "Posso te mandar os próximos passos no zap?",
        obrigatorio: true,
      },
    ],
    resultado_esperado:
      "Lead com dor clara + prazo definido + WhatsApp — pronto para demo ou proposta no Zap.",
  },
  {
    id: "imobiliario",
    emoji: "🏠",
    label: "Imobiliário",
    descricao: "Corretor, construtora, locação — interesse, região e perfil do imóvel.",
    segmento_keywords: ["imobili", "corretor", "imóvel", "imovel", "construtora", "aluguel", "locação"],
    segmento: "Imobiliário",
    tom_voz: "acolhedor e objetivo — corretor de confiança, sem pressão",
    sobre_exemplo: "Atuamos com compra, venda e locação de imóveis na região, com atendimento personalizado.",
    objetivo_qualificacao:
      "Descobrir tipo de imóvel, região, faixa de valor e levar para visita ou proposta no WhatsApp.",
    criterios: [
      { id: "nome", label: "Nome", pergunta_guia: "Como posso te chamar?", obrigatorio: true },
      {
        id: "interesse",
        label: "Comprar, alugar ou vender",
        pergunta_guia: "Você busca comprar, alugar ou está vendendo um imóvel?",
        obrigatorio: true,
      },
      {
        id: "regiao",
        label: "Região ou bairro",
        pergunta_guia: "Qual região ou bairro faz sentido pra você?",
        obrigatorio: true,
      },
      {
        id: "perfil",
        label: "Perfil do imóvel",
        pergunta_guia: "Quantos quartos ou qual tipo de imóvel você imagina?",
        obrigatorio: false,
      },
      {
        id: "whatsapp",
        label: "WhatsApp",
        pergunta_guia: "Te mando opções que combinam com você no WhatsApp?",
        obrigatorio: true,
      },
    ],
    resultado_esperado: "Interesse + região + contato no Zap — agendar visita ou enviar opções.",
  },
  {
    id: "beleza_estetica",
    emoji: "✨",
    label: "Beleza & Estética",
    descricao: "Clínica estética, salão, spa — procedimento, expectativa e agendamento.",
    segmento_keywords: ["beleza", "estética", "estetica", "salão", "salao", "spa", "harmonização", "cabelo"],
    segmento: "Beleza & estética",
    tom_voz: "caloroso e profissional — acolhe inseguranças sem julgar",
    sobre_exemplo: "Cuidamos da sua autoestima com procedimentos personalizados e equipe especializada.",
    objetivo_qualificacao:
      "Entender o que a pessoa quer melhorar, expectativa e agendar avaliação ou procedimento via WhatsApp.",
    criterios: [
      { id: "nome", label: "Nome", pergunta_guia: "Posso te chamar assim ou prefere outro nome?", obrigatorio: true },
      {
        id: "procedimento",
        label: "Procedimento ou interesse",
        pergunta_guia: "O que você gostaria de tratar ou conhecer melhor?",
        obrigatorio: true,
      },
      {
        id: "expectativa",
        label: "Expectativa ou primeira vez",
        pergunta_guia: "Já fez algo parecido antes ou seria a primeira vez?",
        obrigatorio: false,
      },
      {
        id: "whatsapp",
        label: "WhatsApp",
        pergunta_guia: "Quer que eu te passe valores e horários no zap?",
        obrigatorio: true,
      },
    ],
    resultado_esperado: "Interesse no procedimento + WhatsApp — agendar avaliação.",
  },
  {
    id: "saude_clinica",
    emoji: "🩺",
    label: "Saúde & Clínica",
    descricao: "Consultório, clínica, odonto — queixa, convênio e agendamento.",
    segmento_keywords: ["clínica", "clinica", "saúde", "saude", "médico", "medico", "odont", "dentista", "psico"],
    segmento: "Saúde & clínica",
    tom_voz: "empático e claro — transmite segurança, sem diagnóstico pelo chat",
    sobre_exemplo: "Atendimento humanizado com foco em bem-estar e acompanhamento profissional.",
    objetivo_qualificacao:
      "Entender motivo da busca, disponibilidade e agendar consulta pelo WhatsApp (sem orientação médica no Direct).",
    criterios: [
      { id: "nome", label: "Nome", pergunta_guia: "Como prefere ser chamado?", obrigatorio: true },
      {
        id: "motivo",
        label: "Motivo do contato",
        pergunta_guia: "O que te levou a nos procurar?",
        obrigatorio: true,
      },
      {
        id: "convenio",
        label: "Particular ou convênio",
        pergunta_guia: "Seria particular ou por convênio?",
        obrigatorio: false,
      },
      {
        id: "whatsapp",
        label: "WhatsApp",
        pergunta_guia: "Posso te ajudar a agendar pelo WhatsApp?",
        obrigatorio: true,
      },
    ],
    resultado_esperado: "Motivo claro + WhatsApp — secretaria agenda consulta no Zap.",
  },
  {
    id: "ecommerce",
    emoji: "🛒",
    label: "E-commerce & Loja",
    descricao: "Loja online ou física — produto, entrega e fechamento no Zap.",
    segmento_keywords: ["ecommerce", "e-commerce", "loja", "varejo", "produto", "moda"],
    segmento: "E-commerce & varejo",
    tom_voz: "próximo e prestativo — vendedor que ajuda a escolher, não empurra",
    sobre_exemplo: "Produtos selecionados com entrega rápida e atendimento pelo WhatsApp.",
    objetivo_qualificacao: "Descobrir o que o lead quer comprar, dúvidas e levar para fechamento no WhatsApp.",
    criterios: [
      { id: "nome", label: "Nome", pergunta_guia: "Como posso te chamar?", obrigatorio: true },
      {
        id: "produto",
        label: "Produto ou necessidade",
        pergunta_guia: "Qual produto ou tipo de item você está buscando?",
        obrigatorio: true,
      },
      {
        id: "entrega",
        label: "Cidade ou entrega",
        pergunta_guia: "É para qual cidade ou você prefere retirar?",
        obrigatorio: false,
      },
      {
        id: "whatsapp",
        label: "WhatsApp",
        pergunta_guia: "Te mando fotos, preço e formas de pagamento no zap?",
        obrigatorio: true,
      },
    ],
    resultado_esperado: "Produto definido + WhatsApp — fechar pedido ou enviar catálogo no Zap.",
  },
  {
    id: "educacao",
    emoji: "📚",
    label: "Educação & Cursos",
    descricao: "Cursos, mentorias, escolas — objetivo, nível e matrícula.",
    segmento_keywords: ["curso", "educação", "educacao", "escola", "mentoria", "treinamento", "aula"],
    segmento: "Educação & cursos",
    tom_voz: "motivador e claro — mentor que entende o momento do aluno",
    sobre_exemplo: "Formação prática para quem quer evoluir na carreira ou aprender uma nova habilidade.",
    objetivo_qualificacao:
      "Entender objetivo de aprendizado, nível e encaminhar para matrícula ou aula experimental no WhatsApp.",
    criterios: [
      { id: "nome", label: "Nome", pergunta_guia: "Como você prefere ser chamado?", obrigatorio: true },
      {
        id: "objetivo",
        label: "Objetivo com o curso",
        pergunta_guia: "O que você quer alcançar com essa formação?",
        obrigatorio: true,
      },
      {
        id: "nivel",
        label: "Nível ou experiência",
        pergunta_guia: "Você já tem alguma experiência na área ou está começando?",
        obrigatorio: false,
      },
      {
        id: "whatsapp",
        label: "WhatsApp",
        pergunta_guia: "Quer que eu te explique as turmas e valores no zap?",
        obrigatorio: true,
      },
    ],
    resultado_esperado: "Objetivo claro + WhatsApp — matrícula ou aula experimental.",
  },
];

export function getPlaybook(id: string): QualificacaoPlaybook | null {
  return QUALIFICACAO_PLAYBOOKS.find((p) => p.id === id) ?? null;
}

export function suggestPlaybookId(segmento: string | null | undefined): QualificacaoPlaybookId | null {
  const raw = (segmento ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (!raw.trim()) return null;
  for (const p of QUALIFICACAO_PLAYBOOKS) {
    if (p.segmento_keywords.some((k) => raw.includes(k.normalize("NFD").replace(/\p{M}/gu, "")))) {
      return p.id;
    }
  }
  return null;
}

export function criteriosToText(criterios: QualificacaoCriterio[], onlyIds?: string[]): string {
  const set = onlyIds ? new Set(onlyIds) : null;
  return criterios
    .filter((c) => !set || set.has(c.id))
    .map((c) => c.label)
    .join("\n");
}

export function playbookToEmpresaPatch(
  playbook: QualificacaoPlaybook,
  options?: { criterioIds?: string[]; keepNomeFantasia?: boolean }
): {
  segmento: string;
  tom_voz: string;
  sobre: string;
  objetivo_qualificacao: string;
  criterios_qualificacao: string;
} {
  return {
    segmento: playbook.segmento,
    tom_voz: playbook.tom_voz,
    sobre: playbook.sobre_exemplo,
    objetivo_qualificacao: playbook.objetivo_qualificacao,
    criterios_qualificacao: criteriosToText(
      playbook.criterios,
      options?.criterioIds ?? playbook.criterios.map((c) => c.id)
    ),
  };
}

export function listPlaybooksForApi(segmento?: string) {
  const suggested = suggestPlaybookId(segmento);
  return {
    playbooks: QUALIFICACAO_PLAYBOOKS.map((p) => ({
      id: p.id,
      label: p.label,
      descricao: p.descricao,
      emoji: p.emoji,
      segmento: p.segmento,
      tom_voz: p.tom_voz,
      sobre_exemplo: p.sobre_exemplo,
      objetivo_qualificacao: p.objetivo_qualificacao,
      resultado_esperado: p.resultado_esperado,
      criterios: p.criterios.map((c) => ({
        id: c.id,
        label: c.label,
        pergunta_guia: c.pergunta_guia,
        obrigatorio: c.obrigatorio,
      })),
    })),
    suggested_playbook_id: suggested,
  };
}

export type QualificacaoCanal = "direct" | "whatsapp";

/** Bloco compartilhado de conversão — Direct (ponte) e WhatsApp (qualificação profunda). */
export function buildQualificacaoPromptBlock(
  empresa: {
    objetivo_qualificacao?: string;
    criterios_qualificacao?: string;
    link_produto_servico?: string;
    handoff_whatsapp?: string;
    agenda_config?: AgendaConfig;
    agenda_local?: string;
  },
  canal: QualificacaoCanal = "direct"
): string {
  const objetivo = (empresa.objetivo_qualificacao ?? "").trim();
  const criterios = formatCriteriosForPrompt(empresa.criterios_qualificacao);
  const link = (empresa.link_produto_servico ?? "").trim();
  const handoff = (empresa.handoff_whatsapp ?? "").trim();
  const agenda = formatAgendaForPrompt(parseAgendaConfig(empresa.agenda_config));
  const local = (empresa.agenda_local ?? "").trim();

  const regrasHumanas = [
    "- Descubra cada critério em mensagens separadas, comentando o que o lead disse.",
    "- Não pareça formulário — uma pergunta por vez, tom de conversa real.",
    "- Não invente preço, prazo ou condição que não esteja no contexto.",
  ];

  if (canal === "whatsapp") {
    const linhas = [
      "CONVERSÃO E QUALIFICAÇÃO (canal principal — onde fecha o negócio):",
      objetivo
        ? `- Meta: ${objetivo}`
        : "- Meta: qualificar a fundo e fechar com link, agenda ou consultor humano.",
      criterios
        ? `- Critérios a confirmar neste canal (mesmos do playbook Empresa):\n${criterios}`
        : "- Critérios: necessidade clara, perfil, urgência e próximo passo definido.",
      "- Qualificação pesada acontece AQUI: retome o Direct e complete o que faltou.",
      ...regrasHumanas,
      "- Só avance (link, agenda ou humano) com critérios claros OU pedido explícito do lead.",
      "- NUNCA envie link na 1ª mensagem proativa nem em respostas vagas (ok, obrigado).",
    ];
    if (link) {
      linhas.push(
        `- Link (após qualificação): use enviar_link_produto — ${link}. A ferramenta envia a URL; não repita o link na resposta.`
      );
    } else {
      linhas.push("- Link: use enviar_link_produto só quando o lead pedir ou após qualificação.");
    }
    if (handoff) {
      linhas.push(`- Consultor humano: qualificar_acionar_humano após qualificar — alerta ${handoff}.`);
    } else {
      linhas.push("- Consultor humano: qualificar_acionar_humano quando qualificado ou pedir atendente.");
    }
    if (local) linhas.push(`- Local padrão de compromisso: ${local} — cite na confirmação.`);
    linhas.push(`- Agenda disponível: ${agenda} — use agendar_compromisso com dia_semana + horario.`);
    return linhas.join("\n");
  }

  const linhas = [
    "CONVERSÃO (ponte para o WhatsApp):",
    objetivo
      ? `- Meta: ${objetivo}`
      : "- Meta: conectar, iniciar descoberta e levar ao WhatsApp com naturalidade.",
    criterios
      ? `- Critérios do playbook (inicie no Direct; aprofunde no WhatsApp):\n${criterios}`
      : "- Inicie: nome, interesse claro e WhatsApp — detalhes fecham no Zap.",
    "- No Direct: conexão + descoberta inicial. Não precisa fechar todos os critérios aqui.",
    ...regrasHumanas,
    "- Ao receber WhatsApp novo: confirme em 1 frase, use enviar_whatsapp e pos_boas_vindas_wa.",
  ];
  if (link) linhas.push(`- Link configurado (enviar só no WhatsApp após qualificar): ${link}`);
  if (handoff) linhas.push(`- Consultor humano (acionar no WhatsApp após qualificar): ${handoff}`);
  if (local) linhas.push(`- Local de compromisso (combinar no WhatsApp): ${local}`);
  linhas.push(`- Agenda (fechar no WhatsApp): ${agenda}`);
  return linhas.join("\n");
}
