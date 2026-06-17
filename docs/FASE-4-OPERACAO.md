# Fase 4+ — CRM de conversão (Operação)

Foco: **converter e vender**, não postar conteúdo.

## Painel — `/operacao`

### Pipeline de conversão
Taxas entre etapas do funil comercial:
- Comentário → Lead no CRM
- Lead → WhatsApp
- WhatsApp → Handoff humano
- Handoff → Convertido

Também: leads ativos, parados 72h+, follow-ups pendentes.

### Ações prioritárias
Fila automática (regras) de leads que precisam de atenção:
- Handoff aguardando consultor
- Lead qualificado sem transferência
- WhatsApp sem resposta há 24h+
- Boas-vindas ou IA proativa atrasadas
- Direct sem WhatsApp após 48h
- Follow-up manual agendado (`proximo_followup_em`)
- Compromisso nas próximas 24h (`visitas`)

### Gestão comercial por lead
- Status CRM (novo → convertido/perdido)
- Notas do consultor (`crm_notas`)
- Agendar próximo follow-up
- **Sugestão IA (vendas)** — mensagem pronta + próxima ação (usa `OPENAI_API_KEY`, modelo `CRM_IA_MODEL` ou `gpt-4o-mini`)
- Timeline: comentário + Direct + WhatsApp + compromissos

### Filtros
- Todos / Com follow-up / Quentes

## API (autenticada)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/agentes/operacao/pipeline?days=30` | Taxas de conversão |
| GET | `/api/agentes/operacao/follow-ups` | Fila prioritária |
| GET | `/api/agentes/funnel?days=30` | Volume por canal |
| GET | `/api/agentes/operacao/health` | Saúde dos agentes |
| GET | `/api/agentes/leads/:id/timeline` | Histórico + dados CRM |
| PATCH | `/api/agentes/leads/:id` | Status, notas, follow-up |
| POST | `/api/agentes/leads/:id/ai-coach` | Sugestão IA de vendas |

### Agendar WhatsApp (retomar venda)

No detalhe do lead em Operação:
- Escreva a mensagem ou use **Sugestão IA** → **Agendar msg da IA**
- Atalhos: +2h, +24h, Amanhã 9h
- **Programar envio** — dispara via Evolution no horário (cron API, 1 min)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/agentes/operacao/follow-ups-agendados` | Fila global pendente |
| GET | `/api/agentes/leads/:id/follow-ups` | Histórico do lead |
| POST | `/api/agentes/leads/:id/follow-ups` | `{ message_text, agendado_para }` |
| POST | `/api/agentes/operacao/follow-ups/:id/cancel` | Cancela pendente |

Tabela `crm_followup_mensagens` · status: `pendente` → `enviado` | `falhou` | `cancelado`

Requisitos: lead com WhatsApp, instância Evolution conectada, `EVOLUTION_BASE_URL` + `EVOLUTION_GLOBAL_API_KEY`.

### Cadência automática (D+1 / D+3 / D+7)

Cron (1 min) detecta leads parados após **sua última mensagem** no WhatsApp e agenda série de follow-ups.

- **Para se responder** — inbound cancela pendentes da cadência
- **Alerta consultor** — follow-up ou handoff sem resposta → WhatsApp do consultor (`handoff_whatsapp` em Empresa)
- Configurável em Operação → Cadência automática

| Método | Rota |
|--------|------|
| GET/PUT | `/api/agentes/operacao/cadencia` |
| GET | `/api/agentes/operacao/semanal` |

Variáveis nos templates: `{nome}`, `{objetivo}`, `{empresa}`.

## Variáveis de ambiente (API)

```env
OPENAI_API_KEY=sk-...          # obrigatória para coach IA
CRM_IA_MODEL=gpt-4o-mini       # opcional
```

## Banco

Migration `018_crm_operacao.sql`:
- `leads.crm_notas`
- `leads.proximo_followup_em`
