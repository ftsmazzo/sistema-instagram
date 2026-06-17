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

## Variáveis de ambiente (API)

```env
OPENAI_API_KEY=sk-...          # obrigatória para coach IA
CRM_IA_MODEL=gpt-4o-mini       # opcional
```

## Banco

Migration `018_crm_operacao.sql`:
- `leads.crm_notas`
- `leads.proximo_followup_em`
