# Fase 4 — Operação e visibilidade

## Painel — `/operacao`

- **Saúde do sistema** — tokens IGAA, Evolution conectada, agentes ativos, handoff configurado
- **Funil (30 dias)** — comentários, Direct, leads, WhatsApp, handoffs, qualificados
- **Leads e conversas** — clique no lead → timeline unificada (comentário + Direct + WhatsApp)

## API (autenticada)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/agentes/funnel?days=30` | KPIs do funil |
| GET | `/api/agentes/operacao/health` | Alertas operacionais |
| GET | `/api/agentes/leads/:id/timeline` | Histórico do lead |

## Fontes de dados

| Canal | Tabela |
|-------|--------|
| Comentário | `comentarios` |
| Direct | `direct` (`enviado_pelo_negocio` = resposta do bot) |
| WhatsApp | `whatsapp_messages` |
| Lead / status | `leads` |

## Alertas comuns

| Código | Significado |
|--------|-------------|
| `AGENT_TOKEN_NOT_IGAA` | Token do agente não é IGAA |
| `WHATSAPP_DISCONNECTED` | Evolution desconectada |
| `HANDOFF_PHONE_MISSING` | Consultor humano não configurado |
| `PUBLISH_TOKEN_MISSING` | EAA ausente (sync posts) |
