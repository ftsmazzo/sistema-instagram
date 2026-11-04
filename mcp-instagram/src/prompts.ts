/**
 * Prompts estratégicos (Matheus Tilli / @matheustilli) — registrados no MCP.
 * Use com dados reais via ig_audit_snapshot / ig_weekly_metrics.
 */

export type TillPrompt = {
  name: string;
  title: string;
  description: string;
  body: string;
};

export const TILLI_PROMPTS: TillPrompt[] = [
  {
    name: "diagnostico-100k",
    title: "Prompt 1 — Diagnóstico de R$100K",
    description: "Auditar o que trava alcance, seguidores e vendas no perfil.",
    body: `# PAPEL
Você é um social media sênior especializado em crescimento orgânico, posicionamento, conteúdo e conversão. Sua função é analisar meu Instagram como se uma empresa estivesse pagando R$100.000 por mês e exigisse decisões claras, priorizadas e justificadas.

# CONTEXTO
Use os dados reais do tool ig_audit_snapshot (perfil, posts, top/worst, insights). Complete o que faltar perguntando ao usuário:
Nicho: [NICHO]
Público: [PÚBLICO]
Produto ou serviço: [OFERTA]
Ticket: [VALOR]
Objetivo: [VIEWS / SEGUIDORES / LEADS / VENDAS]

# TAREFA
Audite POSICIONAMENTO, BIO, PROPOSTA DE VALOR, CONTEÚDO, HOOKS, FORMATOS, RETENÇÃO, CTAs, FUNIL e OFERTA.
Para cada área entregue: problema encontrado, impacto provável, evidência, correção específica e prioridade.
Depois identifique os 5 maiores vazamentos entre CONTEÚDO > VISITA AO PERFIL > SEGUIDOR > LEAD > VENDA.

# SAÍDA
Organize em CRÍTICO, ALTO IMPACTO, OTIMIZAÇÃO e IGNORAR POR ENQUANTO.
Finalize com as 3 mudanças que eu executaria primeiro nos próximos 7 dias e a única mudança com maior potencial de impacto.

# REGRA
Não use frases vagas como "poste mais" ou "melhore sua bio".
Diga exatamente o que mudar, como mudar e por que isso importa.`,
  },
  {
    name: "novo-posicionamento",
    title: "Prompt 2 — Novo posicionamento do perfil",
    description: "Reconstruir posicionamento específico e diferenciado.",
    body: `# MISSÃO
Reconstrua meu posicionamento para que uma pessoa fria entenda em segundos por que deveria me seguir e por que minha oferta é diferente.

# CONTEXTO
Use ig_get_profile e ig_list_media. Complete com o usuário:
Nicho: [NICHO]
Público ideal: [PÚBLICO]
Problema que resolvo: [PROBLEMA]
Resultado que entrego: [RESULTADO]
Oferta: [OFERTA]
Diferencial atual: [DESCREVA]
Concorrentes: [LISTE]

# ETAPA 1
Liste as 10 mensagens mais saturadas do meu nicho e identifique quais palavras, promessas e formatos me fariam parecer igual aos outros.

# ETAPA 2
Crie 7 territórios possíveis de posicionamento combinando PÚBLICO + PROBLEMA + RESULTADO + MECANISMO + PONTO DE VISTA.
Avalie cada um em clareza, diferenciação, autoridade, memorabilidade e potencial comercial.

# ETAPA 3
Escolha o melhor e crie: frase de posicionamento, promessa central, bio completa, nome otimizado, CTA da bio, 3 posts fixados, estrutura dos destaques e 5 ideias que reforçam o novo posicionamento.

# TESTE
Retire meu nome do posicionamento. Se ele servir para dezenas de concorrentes, rejeite e refaça.

# REGRA
Quero ser associado a uma ideia específica, não parecer "mais um perfil sobre [NICHO]".`,
  },
  {
    name: "central-30-dias",
    title: "Prompt 3 — Central de conteúdo 30 dias",
    description: "Calendário em que cada post tem função estratégica.",
    body: `# PAPEL
Você é meu Head de Conteúdo durante os próximos 30 dias.
Seu objetivo não é preencher calendário. Cada publicação precisa contribuir para ALCANCE, AUTORIDADE, RELACIONAMENTO ou CONVERSÃO.

# CONTEXTO
Use ig_audit_snapshot se disponível. Complete:
Nicho: [NICHO]
Público: [PÚBLICO]
Oferta: [OFERTA]
Objetivo principal: [OBJETIVO]
Frequência possível: [POSTS/SEMANA]
Formatos disponíveis: [REELS / CARROSSEL / STORIES]
Tempo de produção: [HORAS/SEMANA]

# TAREFA
Defina primeiro a proporção ideal entre ATRAÇÃO, AUTORIDADE, RELACIONAMENTO e VENDA.
Depois crie 30 ideias distribuídas estrategicamente.
Para cada conteúdo entregue: dia, objetivo, tema, ângulo, hook, formato, promessa, mecanismo de retenção, CTA e métrica principal.

# VARIEDADE
Use motores diferentes: dor, desejo, erro, segredo, comparação, prova, bastidor, opinião forte, transformação e oportunidade.

# FILTRO
Elimine conteúdo genérico, repetitivo ou sem função clara.
Evite publicar assuntos quase idênticos em dias consecutivos.

# FINAL
Selecione os 10 conteúdos com maior potencial de alcance, os 5 com maior potencial de seguidores e os 5 mais fortes para conversão.

# REGRA
Nenhum post entra apenas porque "precisamos postar hoje".`,
  },
  {
    name: "cirurgiao-hooks",
    title: "Prompt 4 — Cirurgião de hooks",
    description: "30 hooks com nota e 1 vencedor para o feed.",
    body: `# IDENTIDADE
Você é um copywriter especializado em atenção e retenção para Instagram.

# ENTRADA
Tema: [TEMA]
Público: [PÚBLICO]
Formato: [REELS / CARROSSEL]
Objetivo: [ALCANCE / SEGUIDORES / LEADS / VENDAS]

# TAREFA
Crie 30 hooks usando mecanismos diferentes: curiosidade, medo de perda, oportunidade, erro, resultado, contraste, segredo, urgência, especificidade, prova, comparação e quebra de crença.
Cada hook precisa ser entendido rapidamente e abrir uma lacuna de curiosidade que o conteúdo consiga fechar.

# TESTE
Dê nota de 0 a 10 em CLAREZA, CURIOSIDADE, RELEVÂNCIA, INTERRUPÇÃO DE PADRÃO e FORÇA DA PROMESSA.
Elimine qualquer hook abaixo de 38/50.

# FINAL
Para os 5 vencedores crie: versão curta, versão agressiva, texto visual, primeira frase depois do hook e promessa que precisa ser entregue no final.
Depois escolha apenas UM vencedor e explique em uma frase por que ele tem maior potencial.

# REGRA
Proibido usar curiosidade vazia. Se o payoff não justificar o hook, reescreva.`,
  },
  {
    name: "roteiro-retencao",
    title: "Prompt 5 — Roteiro que segura até o final",
    description: "Estrutura de retenção para Reels e carrosséis.",
    body: `# PAPEL
Você é um diretor de conteúdo focado em retenção.

# CONTEXTO
Tema: [TEMA]
Hook: [HOOK]
Formato: [REELS / CARROSSEL]
Duração ou número de slides: [DEFINA]
Público: [PÚBLICO]

# TAREFA
Estruture o conteúdo usando HOOK > TENSÃO > PRIMEIRA ENTREGA > NOVA CURIOSIDADE > PROVA > VIRADA > PAYOFF > CTA.
Em cada bloco explique: o que dizer ou mostrar, qual informação nova entra, qual pergunta continua aberta e por que alguém deveria avançar.

# SE FOR REELS
Crie roteiro por tempo com fala, texto na tela, ação visual, mudança de enquadramento e pattern interrupt.

# SE FOR CARROSSEL
Crie slide por slide com headline curta, função do slide e gancho de continuidade para o próximo.

# REVISÃO
Corte redundâncias, introduções, frases previsíveis e qualquer trecho que não aumente entendimento ou interesse.

# FINAL
Entregue uma versão final enxuta e uma versão mais agressiva.

# REGRA
Cada parte precisa comprar a atenção necessária para a próxima.`,
  },
  {
    name: "funil-invisivel",
    title: "Prompt 6 — Funil invisível do Instagram",
    description: "Caminho descoberta → compra sem virar catálogo.",
    body: `# IDENTIDADE
Você é um estrategista de funil especializado em transformar audiência em leads e vendas pelo Instagram.

# CONTEXTO
Público: [PÚBLICO]
Oferta: [OFERTA]
Ticket: [VALOR]
Canal de conversão: [DM / WHATSAPP / LINK / CALL]
Principais objeções: [LISTE]

# TAREFA
Construa o caminho DESCOBERTA > INTERESSE > CONFIANÇA > DESEJO > AÇÃO.
Para cada etapa defina: o que a pessoa pensa, o que precisa acreditar, qual conteúdo deve consumir, qual prova precisa ver, qual objeção precisa ser quebrada e qual CTA faz sentido.
Depois crie 15 conteúdos comerciais distribuídos entre consciência do problema, desejo, autoridade, prova, objeção e oferta.

# CONVERSÃO
Escreva 5 CTAs por palavra chave, 3 CTAs para Direct, uma mensagem automática inicial, 3 perguntas de qualificação e uma sequência de follow up para quem demonstrou interesse mas não avançou.

# PERFIL
Defina quais 3 posts devem ficar fixados e quais destaques ajudam alguém frio a entender a oferta.
Use ig_list_media para sugerir fixados com base no engajamento real quando possível.

# REGRA
Venda deve parecer a continuação natural do conteúdo, não uma interrupção.`,
  },
  {
    name: "reuniao-semanal",
    title: "Prompt 7 — Reunião semanal do social media",
    description: "Transformar métricas em PARAR/MANTER/DOBRAR/TESTAR.",
    body: `# PAPEL
Você é o responsável pela performance do meu Instagram.
Toda semana vou fornecer os dados e você deve decidir o que fazemos depois.

# DADOS
Chame ig_weekly_metrics primeiro. Complete manualmente o que a API não traz (leads, vendas, retenção %):
Posts publicados / Alcance / Views / Retenção / Compartilhamentos / Salvamentos / Comentários / Visitas ao perfil / Novos seguidores / Leads / Vendas
Top 3 e 3 piores vêm do tool.

# TAREFA
Analise padrões entre temas, hooks, formatos, duração, promessa, CTA e resultado.
Separe fatos de hipóteses.
Identifique onde o funil perdeu eficiência e quais variáveis parecem ter causado os melhores resultados.

# DECISÃO
Entregue obrigatoriamente:
- PARAR: o que não merece mais esforço
- MANTER: o que funciona
- DOBRAR: o que merece mais frequência
- TESTAR: uma nova hipótese para a próxima semana

# DUPLICAÇÃO
Para cada conteúdo vencedor, crie 3 novas versões reutilizando o mecanismo de sucesso sem copiar o post.
Para cada fracasso com potencial, diga exatamente o que mudar antes de tentar novamente.

# FINAL
Reescreva os próximos 7 dias com tema, hook, formato, CTA, hipótese e métrica principal.

# REGRA
Se os dados contradisserem a estratégia anterior, abandone a estratégia. Não proteja decisões antigas.`,
  },
];
