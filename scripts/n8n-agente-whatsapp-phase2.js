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
  AND l.whatsapp_ia_agendada_em IS NOT NULL
  AND l.whatsapp_ia_agendada_em <= NOW()
  AND l.status NOT IN ('handoff', 'convertido', 'perdido')
  AND COALESCE(l.whatsapp_digits, '') <> ''
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
      url: expr('={{ "https://plataforma-instagram-instagram-backend.kxryyk.easypanel.host/api/internal/whatsapp-agent-config?instance=" + encodeURIComponent($json.instance_name) + "&phone=" + encodeURIComponent($json.telefone_raw) }}'),
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
WHERE organization_id = '{{ $('HTTP Config WA').item.json.organization.id }}'::uuid
  AND whatsapp_digits = '{{ $('Prep Agente WA').item.json.telefone }}'
  AND whatsapp_primeira_ia_enviada = false
  AND '{{ $('Prep Agente WA').item.json.modo }}' = 'inbound'`,
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
          { id: 'a5', name: 'prompt_runtime', value: expr("={{ $('HTTP Config WA').item.json.prompts.whatsapp + '\\n\\n--- CONTEXTO INSTAGRAM ---\\n' + ($('HTTP Config WA').item.json.instagram_context?.resumo || 'Sem historico Instagram registrado para este lead.') + '\\n\\n--- REGRAS FIXAS ---\\n- Maximo 400 caracteres.\\n- Uma ideia + no maximo uma pergunta.\\n- Se ha historico Direct acima: CONTINUE a conversa — nao trate como primeiro contato nem pitch frio do post.\\n- Se modo proativo: retome conversa do Instagram sem repetir boas-vindas.\\n- Se lead pedir humano ou estiver qualificado: use qualificar_acionar_humano com motivo e criterios.' }}"), type: 'string' },
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
    parameters: { model: expr('={{ "gpt-4o-mini" }}'), options: { temperature: 0.4 } },
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

const agendarVisita = tool({
  type: 'n8n-nodes-base.postgresTool',
  version: 2.6,
  config: {
    name: 'agendar_visita',
    position: [1520, 620],
    parameters: {
      descriptionType: 'manual',
      toolDescription: 'Agenda compromisso do lead (visita, reunião ou demonstração). Params: data_visita ISO, observacoes opcional.',
      operation: 'executeQuery',
      query: `=INSERT INTO visitas (organization_id, lead_id, telefone, id_post_origem, data_visita, observacoes, status)
VALUES ('{{ $('Prep Agente WA').item.json.organization_id }}'::uuid, NULLIF('{{ $('Prep Agente WA').item.json.lead_id }}','')::int, '{{ $('Prep Agente WA').item.json.telefone }}', '{{ $('Prep Agente WA').item.json.config.lead?.id_post_origem || '' }}', '{{ $fromAI('data_visita', 'Data/hora da visita ISO8601', 'string') }}'::timestamptz, '{{ $fromAI('observacoes', 'Observacoes', 'string') }}', 'agendada');
UPDATE leads SET status = 'qualificado', updated_at = NOW() WHERE organization_id = '{{ $('Prep Agente WA').item.json.organization_id }}'::uuid AND whatsapp_digits = '{{ $('Prep Agente WA').item.json.telefone }}';`,
      options: {},
    },
    credentials: { postgres: { id: '7XLmPrmB0innRVr5', name: 'Maquina-Instagram' } },
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
      toolDescription: 'Envia mensagem WhatsApp com link de produto/serviço. Param url obrigatorio, texto opcional.',
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
      text: expr("=Modo: {{ $('Prep Agente WA').item.json.modo }}\nLead: {{ $('Prep Agente WA').item.json.config.lead?.nome || 'desconhecido' }} (@{{ $('Prep Agente WA').item.json.config.lead?.username_instagram || 'n/a' }})\nOrigem: {{ $('Prep Agente WA').item.json.config.lead?.origem_interacao || 'n/a' }}\n\nMensagem WhatsApp agora:\n{{ $('Prep Agente WA').item.json.message_text || '[INICIAR CONVERSA PROATIVA - retome contexto do Instagram Direct no system prompt]' }}"),
      options: { systemMessage: expr('={{ $('Prep Agente WA').item.json.prompt_runtime }}') },
    },
    subnodes: {
      model: openAiModel,
      memory: memoriaWa,
      tools: [agendarVisita, qualificarAcionarHumano, enviarLink],
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
          { id: 'l1', name: 'texto_resposta', value: expr("={{ ($json.output || $json.text || '').toString().replace(/[*_#`]/g,'').trim().slice(0,400) }}"), type: 'string' },
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
SELECT '{{ $('Prep Agente WA').item.json.organization_id }}'::uuid, NULLIF('{{ $('Prep Agente WA').item.json.lead_id }}','')::int, '{{ $('Prep Agente WA').item.json.telefone }}', 'inbound', '{{ $('Prep Agente WA').item.json.message_text }}', '{{ $('Prep Agente WA').item.json.message_id_ext || '' }}', '{{ $('Prep Agente WA').item.json.config.whatsapp_instance.instance_name }}'
WHERE '{{ $('Prep Agente WA').item.json.modo }}' = 'inbound' AND '{{ $('Prep Agente WA').item.json.message_text }}' <> ''`,
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
      .to(cancelaAgendaInbound)
      .to(gravaInbound)
      .to(agenteWa)
      .to(limpaTexto)
      .to(enviarResposta)
      .to(marcaPrimeiraIa)
  ));
