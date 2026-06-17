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

### Score de conversão (0–100)

Cada lead ativo recebe um **score persistente** (`crm_score`) calculado por:
- Status no funil (handoff, qualificado, em conversa)
- WhatsApp ativo vs só Direct
- Compromisso agendado (`visitas`)
- Recência da última resposta do lead

A fila de **Ações prioritárias** ordena por prioridade → score → horas paradas.  
A lista de leads ordena por score decrescente.

Atualização: ao abrir Operação (fila de follow-ups) + cron a cada 1 min.

### Playbooks de qualificação (Empresa → agentes)

Keywords centralizadas em `api/src/services/segmentoNichos.ts`. Em **Empresa → Qualificação**, playbooks disponíveis:

| Playbook | Exemplos de segmento |
|----------|----------------------|
| Beleza | barbearia, salão, estética, manicure, spa |
| Profissionais liberais | advocacia, contabilidade, engenharia |
| Saúde & clínica | consultório, odonto, fisioterapia |
| Imobiliário | corretor, imóvel, locação |
| E-commerce | loja, varejo, moda |
| Educação | curso, mentoria |
| Serviços B2B | software, agência (fallback) |

Alimentam prompts do Direct, WhatsApp e coach IA em Operação.

### Templates de cadência por segmento

Presets prontos: **Imobiliária**, **Clínica/saúde**, **Beleza (barbearia/salão/estética)**, **Profissionais liberais (advogado, contador…)**, **Serviços B2B**, **E-commerce**.  
O sistema sugere um preset com base no **segmento** configurado em Empresa.

| Método | Rota |
|--------|------|
| GET | `/api/agentes/operacao/cadencia/presets` |
| PUT | `/api/agentes/operacao/cadencia` com `{ preset_id }` aplica template |

## Variáveis de ambiente (API)

```env
OPENAI_API_KEY=sk-...          # obrigatória para coach IA
CRM_IA_MODEL=gpt-4o-mini       # opcional
```

## Banco

Migration `018_crm_operacao.sql`:
- `leads.crm_notas`
- `leads.proximo_followup_em`

Migration `021_crm_lead_score.sql`:
- `leads.crm_score`, `crm_score_label`, `crm_score_motivo`, `crm_score_at`
