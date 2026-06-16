import {
  workflow,
  node,
  trigger,
  ifElse,
  merge,
  languageModel,
  memory,
  tool,
  expr,
} from '@n8n/workflow-sdk';

const webhookEvolution = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Webhook Evolution',
    position: [0, 280],
    parameters: {
      path: 'whatsapp-evolution',
      httpMethod: 'POST',
      responseMode: 'onReceived',
      options: {},
    },
  },
  output: [{
    body: {
      instance: 'maquina-vendas',
      event: 'messages.upsert',
      data: {
        key: { remoteJid: '5516999998888@s.whatsapp.net', fromMe: false, id: 'msg1' },
        message: { conversation: 'Oi' },
      },
    },
  }],
});

const scheduleAgenda = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'Agenda Primeira IA',
    position: [0, 560],
    parameters: {
      rule: { interval: [{ field: 'minutes', minutesInterval: 2 }] },
    },
  },
  output: [{}],
});

const normalizaInbound = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Normaliza Inbound',
    position: [240, 280],
    parameters: {
      mode: 'manual',
      includeOtherFields: true,
      assignments: {
        assignments: [
          { id: 'n1', name: 'instance_name', value: expr("={{ $json.body?.instance || $json.instance || '' }}"), type: 'string' },
          { id: 'n2', name: 'telefone_raw', value: expr("={{ ($json.body?.data?.key?.remoteJid || $json.data?.key?.remoteJid || '').split('@')[0] }}"), type: 'string' },
          { id: 'n3', name: 'from_me', value: expr("={{ Boolean($json.body?.data?.key?.fromMe ?? $json.data?.key?.fromMe) }}"), type: 'boolean' },
          { id: 'n4', name: 'message_text', value: expr("={{ ($json.body?.data?.message?.conversation || $json.body?.data?.message?.extendedTextMessage?.text || $json.data?.message?.conversation || '').trim() }}"), type: 'string' },
          { id: 'n5', name: 'message_id_ext', value: expr("={{ $json.body?.data?.key?.id || $json.data?.key?.id || '' }}"), type: 'string' },
          { id: 'n6', name: 'modo', value: 'inbound', type: 'string' },
        ],
      },
    },
  },
  output: [{ instance_name: 'maquina-vendas', telefone_raw: '5516999998888', from_me: false, message_text: 'Oi', modo: 'inbound' }],
});

const buscaLeadsAgenda = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.6,
  config: {
    name: 'Busca Leads Agenda',
    position: [240, 560],
    parameters: {
      operation: 'executeQuery',
      query: `SELECT l.id AS lead_id, l.organization_id, l.nome, l.whatsapp, l.whatsapp_digits, l.objetivo, l.id_post_origem, l.username_instagram,
wi.instance_name, wi.evolution_base_url
FROM leads l
INNER JOIN whatsapp_instances wi ON wi.organization_id = l.organization_id AND wi.agent_ativo = true
WHERE l.whatsapp_boas_vindas_enviado = true
  AND l.whatsapp_primeira_ia_enviada = false
  AND l.status NOT IN ('handoff', 'convertido', 'perdido')
  AND COALESCE(l.whatsapp_digits, '') <> ''
  AND (
    (l.whatsapp_ia_agendada_em IS NOT NULL AND l.whatsapp_ia_agendada_em <= NOW())
    OR (
      COALESCE(l.whatsapp_boas_vindas_em, (
        SELECT MIN(wm.created_at) FROM whatsapp_messages wm
        WHERE wm.organization_id = l.organization_id
          AND wm.telefone = l.whatsapp_digits
          AND wm.direction = 'outbound'
      ), l.updated_at)
      + (COALESCE(wi.delay_primeira_msg_minutos, 20) || ' minutes')::interval <= NOW()
    )
  )
LIMIT 5`,
      options: {},
    },
    credentials: { postgres: { id: '7XLmPrmB0innRVr5', name: 'Maquina-Instagram' } },
  },
  output: [{ lead_id: 1, organization_id: '4113e844-ea3c-49bd-a860-44da081efc99', whatsapp_digits: '5516999998888', instance_name: 'maquina-vendas', evolution_base_url: 'https://evolution.example' }],
});

const prepProativo = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Prep Proativo',
    position: [480, 560],
    parameters: {
      mode: 'manual',
      includeOtherFields: true,
      assignments: {
        assignments: [
          { id: 'p1', name: 'instance_name', value: expr('={{ $json.instance_name }}'), type: 'string' },
          { id: 'p2', name: 'telefone_raw', value: expr('={{ $json.whatsapp_digits }}'), type: 'string' },
          { id: 'p3', name: 'message_text', value: '', type: 'string' },
          { id: 'p4', name: 'from_me', value: false, type: 'boolean' },
          { id: 'p5', name: 'modo', value: 'proativo', type: 'string' },
          { id: 'p6', name: 'lead_id', value: expr('={{ $json.lead_id }}'), type: 'number' },
        ],
      },
    },
  },
  output: [{ instance_name: 'maquina-vendas', telefone_raw: '5516999998888', modo: 'proativo', lead_id: 1 }],
});

const ignoraPropria = ifElse({
  version: 2.2,
  config: {
    name: 'Mensagem Valida?',
    position: [480, 280],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [
          {
            leftValue: expr("={{ !$('Normaliza Inbound').item.json.from_me && $('Normaliza Inbound').item.json.telefone_raw && $('Normaliza Inbound').item.json.message_text }}"),
            operator: { type: 'boolean', operation: 'true' },
          },
        ],
        combinator: 'and',
      },
    },
  },
});

const httpConfigWa = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'HTTP Config WA',
    position: [720, 400],
    parameters: {
      url: expr('={{ "https://plataforma-instagram-instagram-backend.kxryyk.easypanel.host/api/internal/whatsapp-agent-config?instance=" + encodeURIComponent($json.instance_name) + "&phone=" + encodeURIComponent($json.telefone_raw) + "&inbound_message=" + encodeURIComponent($json.message_text || "") }}'),
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: 'X-Internal-Secret', value: 'CONFIGURE_INTERNAL_SECRET' }],
      },
      options: {},
    },
  },
  output: [{ ready: true, organization: { id: 'org' }, prompts: { whatsapp: 'prompt', agent_nome: 'Bot' }, evolution: { send_text_path: 'https://evolution/message/sendText/inst' }, runtime: { delay_primeira_msg_minutos: 20, redis_key_prefix: 'wa:org:5516:' }, lead: { id: 1, nome: 'Lead', status: 'em_conversa' } }],
});

const prontoWa = ifElse({
  version: 2.2,
  config: {
    name: 'Agente WA Pronto?',
    position: [960, 400],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('={{ $json.ready === true }}'), operator: { type: 'boolean', operation: 'true' } }],
        combinator: 'and',
      },
    },
  },
});

const cancelaAgendaInbound = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.6,
  config: {
    name: 'Cancela Agenda Inbound',
    position: [960, 240],
    parameters: {
      operation: 'executeQuery',
      query: `=UPDATE leads SET whatsapp_ia_agendada_em = NULL, status = CASE WHEN status = 'novo' THEN 'em_conversa' ELSE status END, updated_at = NOW()
WHERE organization_id = '{{ $('Prep Agente WA').itemMatching($itemIndex).json.organization_id }}'::uuid
  AND whatsapp_digits = '{{ $('Prep Agente WA').itemMatching($itemIndex).json.telefone }}'
  AND whatsapp_primeira_ia_enviada = false
  AND '{{ $('Prep Agente WA').itemMatching($itemIndex).json.modo }}' = 'inbound'`,
      options: {},
    },
    credentials: { postgres: { id: '7XLmPrmB0innRVr5', name: 'Maquina-Instagram' } },
  },
  output: [{ success: true }],
});

const prepAgenteWa = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Prep Agente WA',
    position: [1200, 400],
    parameters: {
      mode: 'manual',
      includeOtherFields: true,
      assignments: {
        assignments: [
          { id: 'a1', name: 'config', value: expr('={{ $('HTTP Config WA').item.json }}'), type: 'object' },
          { id: 'a2', name: 'telefone', value: expr("={{ $('Prep Proativo').isExecuted ? $('Prep Proativo').item.json.telefone_raw : $('Normaliza Inbound').item.json.telefone_raw }}"), type: 'string' },
          { id: 'a3', name: 'message_text', value: expr("={{ $('Prep Proativo').isExecuted ? ($('Prep Proativo').item.json.message_text || '') : ($('Normaliza Inbound').item.json.message_text || '') }}"), type: 'string' },
          { id: 'a4', name: 'modo', value: expr("={{ $('Prep Proativo').isExecuted ? $('Prep Proativo').item.json.modo : $('Normaliza Inbound').item.json.modo }}"), type: 'string' },
          { id: 'a5', name: 'prompt_runtime', value: expr("={{ '--- AGORA (n8n) ---\\nISO: ' + $now.toISO() + '\\nAPI hoje_iso: ' + ($('HTTP Config WA').item.json.runtime?.hoje_iso || 'n/a') + '\\n\\n' + ($('HTTP Config WA').item.json.prompts.prompt_runtime || ($('HTTP Config WA').item.json.prompts.whatsapp + '\\n\\n--- CONTEXTO INSTAGRAM ---\\n' + ($('HTTP Config WA').item.json.instagram_context?.resumo || 'Sem historico Instagram registrado para este lead.') + '\\n\\n--- CALENDARIO ---\\n' + ($('HTTP Config WA').item.json.runtime?.calendario_resumo || ''))) }}"), type: 'string' },
          { id: 'a5b', name: 'agent_context_line', value: expr("={{ $('HTTP Config WA').item.json.prompts.agent_context_line || 'Lead: contato' }}"), type: 'string' },
          { id: 'a6', name: 'organization_id', value: expr('={{ $('HTTP Config WA').item.json.organization.id }}'), type: 'string' },
          { id: 'a7', name: 'send_text_path', value: expr('={{ $('HTTP Config WA').item.json.evolution.send_text_path }}'), type: 'string' },
          { id: 'a8', name: 'session_key', value: expr("={{ $('HTTP Config WA').item.json.runtime.redis_key_prefix }}"), type: 'string' },
          { id: 'a9', name: 'lead_id', value: expr("={{ $('HTTP Config WA').item.json.lead?.id || ($('Prep Proativo').isExecuted ? $('Prep Proativo').item.json.lead_id : '') || '' }}"), type: 'string' },
          { id: 'a10', name: 'message_id_ext', value: expr("={{ $('Normaliza Inbound').isExecuted ? ($('Normaliza Inbound').item.json.message_id_ext || '') : '' }}"), type: 'string' },
        ],
      },
    },
  },
  output: [{ telefone: '5516999998888', message_text: 'Oi', modo: 'inbound', prompt_runtime: 'prompt', send_text_path: 'https://evolution/sendText/inst', session_key: 'wa:org:5516:', message_id_ext: 'msg1' }],
});

const openAiModel = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
  version: 1.2,
  config: {
    name: 'Model WA',
    position: [1200, 620],
    parameters: { model: expr('={{ "gpt-4o-mini" }}'), options: { temperature: 0.3 } },
    credentials: { openAiApi: { id: 'h16ESiG18xo2Y7O7', name: 'OpenAI account' } },
  },
});

const memoriaWa = memory({
  type: '@n8n/n8n-nodes-langchain.memoryPostgresChat',
  version: 1.4,
  config: {
    name: 'Memoria WA',
    position: [1360, 620],
    parameters: {
      sessionIdType: 'customKey',
      sessionKey: expr("={{ $('Prep Agente WA').item.json.session_key }}"),
      tableName: 'n8n_chat_histories_wa',
      contextWindowLength: 5,
    },
    credentials: { postgres: { id: '7XLmPrmB0innRVr5', name: 'Maquina-Instagram' } },
  },
});

const consultarDataAgenda = tool({
  type: 'n8n-nodes-base.httpRequestTool',
  version: 4.4,
  config: {
    name: 'consultar_data_agenda',
    position: [2000, 620],
    parameters: {
      descriptionType: 'manual',
      toolDescription:
        'Retorna a próxima data exata DD/MM/AAAA de um dia da semana. OBRIGATÓRIO quando o lead perguntar que dia do mês é quinta/terça/etc.',
      method: 'POST',
      url: 'https://plataforma-instagram-instagram-backend.kxryyk.easypanel.host/api/internal/whatsapp/consultar-data-agenda',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'X-Internal-Secret', value: 'CONFIGURE_INTERNAL_SECRET' },
        ],
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr(
        '={\n  "dia_semana": {{ JSON.stringify($fromAI(\'dia_semana\', \'Dia da semana em português (ex.: quinta)\', \'string\')) }}\n}'
      ),
      optimizeResponse: true,
      options: { response: { response: { neverError: true } } },
    },
  },
});

const agendarCompromisso = tool({
  type: 'n8n-nodes-base.httpRequestTool',
  version: 4.4,
  config: {
    name: 'agendar_compromisso',
    position: [1520, 620],
    parameters: {
      descriptionType: 'manual',
      toolDescription:
        'Registra compromisso e alerta consultor. OBRIGATÓRIO antes de dizer "está agendado". Params: dia_semana (ex.: terça), horario (ex.: 10:00) — preferir estes; data_visita ISO opcional; assunto/observacoes opcionais. Use confirmacao_sugerida da resposta na mensagem ao lead.',
      method: 'POST',
      url: 'https://plataforma-instagram-instagram-backend.kxryyk.easypanel.host/api/internal/whatsapp/agendar-compromisso',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'X-Internal-Secret', value: 'CONFIGURE_INTERNAL_SECRET' },
        ],
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr(
        '={\n  "organization_id": {{ JSON.stringify($(\'Prep Agente WA\').item.json.organization_id) }},\n  "phone": {{ JSON.stringify($(\'Prep Agente WA\').item.json.telefone) }},\n  "dia_semana": {{ JSON.stringify($fromAI(\'dia_semana\', \'Dia da semana em português (ex.: terça)\', \'string\')) }},\n  "horario": {{ JSON.stringify($fromAI(\'horario\', \'Horário HH:MM (ex.: 10:00)\', \'string\')) }},\n  "data_visita": {{ JSON.stringify($fromAI(\'data_visita\', \'Data/hora ISO8601 (opcional se dia_semana+horario)\', \'string\')) }},\n  "assunto": {{ JSON.stringify($fromAI(\'assunto\', \'Assunto da reunião\', \'string\')) }},\n  "observacoes": {{ JSON.stringify($fromAI(\'observacoes\', \'Observações\', \'string\')) }}\n}'
      ),
      optimizeResponse: true,
      options: { response: { response: { neverError: true } } },
    },
  },
});

const qualificarAcionarHumano = tool({
  type: 'n8n-nodes-base.httpRequestTool',
  version: 4.4,
  config: {
    name: 'qualificar_acionar_humano',
    position: [1680, 620],
    parameters: {
      descriptionType: 'manual',
      toolDescription:
        'Qualifica o lead e alerta o consultor humano no WhatsApp configurado. Params: motivo (obrigatório), criterios (opcional), resumo (opcional). Use quando o lead estiver pronto para fechamento ou pedir humano.',
      method: 'POST',
      url: 'https://plataforma-instagram-instagram-backend.kxryyk.easypanel.host/api/internal/whatsapp/qualificar-handoff',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'X-Internal-Secret', value: 'CONFIGURE_INTERNAL_SECRET' },
        ],
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr(
        '={\n  "organization_id": {{ JSON.stringify($(\'Prep Agente WA\').item.json.organization_id) }},\n  "phone": {{ JSON.stringify($(\'Prep Agente WA\').item.json.telefone) }},\n  "motivo": {{ JSON.stringify($fromAI(\'motivo\', \'Motivo da qualificação/handoff\', \'string\')) }},\n  "criterios": {{ JSON.stringify($fromAI(\'criterios\', \'Critérios atendidos na qualificação\', \'string\')) }},\n  "resumo": {{ JSON.stringify($fromAI(\'resumo\', \'Resumo curto da conversa para o consultor\', \'string\')) }}\n}'
      ),
      optimizeResponse: true,
      options: { response: { response: { neverError: true } } },
    },
  },
});

const enviarLink = tool({
  type: 'n8n-nodes-base.httpRequestTool',
  version: 4.4,
  config: {
    name: 'enviar_link_produto',
    position: [1840, 620],
    parameters: {
      descriptionType: 'manual',
      toolDescription: 'Envia UMA mensagem com link. SOMENTE quando lead pedir link/detalhes OU após discovery + interesse confirmado. NUNCA em ok/perfeito/obrigado nem na 1ª msg proativa. Param url obrigatorio, texto opcional. Nao repita link na resposta do agente.',
      method: 'POST',
      url: expr("={{ $('Prep Agente WA').item.json.send_text_path }}"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('={\n  "number": {{ JSON.stringify($(\'Prep Agente WA\').item.json.telefone) }},\n  "text": {{ JSON.stringify($fromAI(\'texto\', \'Mensagem curta com o link\', \'string\') + \' \' + $fromAI(\'url\', \'URL do produto ou serviço\', \'string\')) }}\n}'),
      optimizeResponse: true,
      options: { response: { response: { neverError: true } } },
    },
    credentials: { httpHeaderAuth: { id: 'JjE2u3huCpHBCUaO', name: 'Evolution' } },
  },
});

const agenteWa = node({
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 3.1,
  config: {
    name: 'Agente WA',
    position: [1440, 400],
    parameters: {
      promptType: 'define',
      text: expr("=Modo: {{ $('Prep Agente WA').item.json.modo }}\n{{ $('Prep Agente WA').item.json.agent_context_line }}\nOrigem: {{ $('Prep Agente WA').item.json.config.lead?.origem_interacao || 'n/a' }}\n\nMensagem WhatsApp agora:\n{{ $('Prep Agente WA').item.json.message_text || '[INICIAR CONVERSA PROATIVA - retome contexto do Instagram Direct. SEM link. UMA pergunta natural.]' }}"),
      options: { systemMessage: expr('={{ $('Prep Agente WA').item.json.prompt_runtime }}') },
    },
    subnodes: {
      model: openAiModel,
      memory: memoriaWa,
      tools: [agendarCompromisso, qualificarAcionarHumano, enviarLink, consultarDataAgenda],
    },
  },
  output: [{ output: 'Resposta curta do agente' }],
});

const limpaTexto = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Limpa Texto WA',
    position: [1680, 400],
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'l1', name: 'texto_resposta', value: expr("={{ (() => { let t = ($json.output || $json.text || '').toString().replace(/[*_#`]/g,'').trim(); const hasSlashDate = /\\d{1,2}\\/\\d{1,2}\\/\\d{4}/.test(t); const inventsWrittenDate = /\\b\\d{1,2}\\s+de\\s+[a-zàâãéêíóôõúç]/i.test(t); const claimsSchedule = /\\b(est[aá] agendad|confirmad|reuni[aã]o ser[aá]|nos vemos)\\b/i.test(t); if (inventsWrittenDate && !hasSlashDate) { t = 'Deixa eu confirmar a data exata na agenda e já te retorno com dia/mês/ano, combinado?'; } else if (claimsSchedule && !hasSlashDate) { t = 'Vou registrar na agenda e já te confirmo com a data certinha (dia/mês/ano) e horário.'; } return t.slice(0, 400); })() }}"), type: 'string' },
        ],
      },
    },
  },
  output: [{ texto_resposta: 'Resposta' }],
});

const enviarResposta = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Enviar Resposta WA',
    position: [1920, 400],
    parameters: {
      method: 'POST',
      url: expr("={{ $('Prep Agente WA').item.json.send_text_path }}"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('={\n  "number": {{ JSON.stringify($(\'Prep Agente WA\').item.json.telefone) }},\n  "text": {{ JSON.stringify($json.texto_resposta) }}\n}'),
      options: { response: { response: { neverError: true } } },
    },
    credentials: { httpHeaderAuth: { id: 'JjE2u3huCpHBCUaO', name: 'Evolution' } },
  },
  output: [{ ok: true }],
});

const gravaInbound = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.6,
  config: {
    name: 'Grava Msg Inbound',
    position: [1680, 240],
    parameters: {
      operation: 'executeQuery',
      query: `=INSERT INTO whatsapp_messages (organization_id, lead_id, telefone, direction, message_text, message_id_ext, instance_name)
SELECT '{{ $json.organization_id }}'::uuid, NULLIF('{{ $json.lead_id }}','')::int, '{{ $json.telefone }}', 'inbound', '{{ $json.message_text }}', '{{ $json.message_id_ext || '' }}', '{{ $json.config.whatsapp_instance.instance_name }}'
WHERE '{{ $json.modo }}' = 'inbound' AND '{{ $json.message_text }}' <> ''`,
      options: {},
    },
    credentials: { postgres: { id: '7XLmPrmB0innRVr5', name: 'Maquina-Instagram' } },
  },
  output: [{ ok: true }],
});

const marcaPrimeiraIa = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.6,
  config: {
    name: 'Marca Primeira IA',
    position: [2160, 400],
    parameters: {
      operation: 'executeQuery',
      query: `=UPDATE leads SET whatsapp_primeira_ia_enviada = true, whatsapp_ia_agendada_em = NULL, status = CASE WHEN status = 'novo' THEN 'em_conversa' ELSE status END, updated_at = NOW()
WHERE organization_id = '{{ $('Prep Agente WA').item.json.organization_id }}'::uuid AND whatsapp_digits = '{{ $('Prep Agente WA').item.json.telefone }}'`,
      options: {},
    },
    credentials: { postgres: { id: '7XLmPrmB0innRVr5', name: 'Maquina-Instagram' } },
  },
  output: [{ ok: true }],
});

const mergeEntrada = merge({
  version: 3.2,
  config: {
    name: 'Unifica Entrada',
    position: [600, 400],
    parameters: { mode: 'append' },
  },
  output: [{ instance_name: 'maquina-vendas', telefone_raw: '5516999998888', modo: 'inbound' }],
});

export default workflow('agente-whatsapp-mv', 'Agente-WhatsApp')
  .add(webhookEvolution)
  .to(normalizaInbound)
  .to(ignoraPropria.onTrue(mergeEntrada.input(0)))
  .add(scheduleAgenda)
  .to(buscaLeadsAgenda)
  .to(prepProativo)
  .to(mergeEntrada.input(1))
  .add(mergeEntrada)
  .to(httpConfigWa)
  .to(prontoWa.onTrue(
    prepAgenteWa
      .to(gravaInbound)
      .to(cancelaAgendaInbound)
      .to(agenteWa)
      .to(limpaTexto)
      .to(enviarResposta)
      .to(marcaPrimeiraIa)
  ));
