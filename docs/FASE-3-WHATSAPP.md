# Fase 3 — Funil WhatsApp (Instagram → Evolution → Agente IA)

## Arquitetura

| Etapa | Onde roda | O quê |
|-------|-----------|--------|
| Comentário + Direct | n8n **Agente-Instagram** | IGAA + `graph.instagram.com` |
| Handoff (boas-vindas) | Tool `enviar_whatsapp` + `pos_boas_vindas_wa` | Evolution API |
| 1ª msg proativa | n8n **Agente-WhatsApp** (cron `Agenda Primeira IA`) | Retoma contexto do Direct |
| Respostas do lead | Webhook Evolution → fila Redis → agente | Debounce 15s |

## Pré-requisitos no painel

1. **Empresa** — playbook de qualificação, agenda, link comercial, WhatsApp do consultor (handoff).
2. **Agentes Instagram** — IGAA no token agente; agente ativo.
3. **WhatsApp & leads** — instância Evolution conectada; agente WA ativo; delay da 1ª msg (padrão 20 min).

## Variáveis na API

```env
EVOLUTION_BASE_URL=...
EVOLUTION_GLOBAL_API_KEY=...
INTERNAL_AGENT_API_SECRET=...   # mesmo valor no header X-Internal-Secret nos nós HTTP do n8n
DATABASE_URL=...
REDIS_URL=...                   # fila inbound WhatsApp
```

## Teste ponta a ponta

1. Comente no post e responda no Direct até o lead informar WhatsApp.
2. Agente Direct deve chamar `enviar_whatsapp` e em seguida `pos_boas_vindas_wa`.
3. Lead recebe boas-vindas no celular (Evolution).
4. Em **WhatsApp & leads**, coluna **Funil WA** = “Boas-vindas enviada” ou “IA agendada …”.
5. Após o delay, workflow **Agente-WhatsApp** envia 1ª msg proativa (retoma Direct).
6. Lead responde no WhatsApp → agente WA qualifica (tools: agenda, link, handoff).

## Workflows n8n

| ID | Nome | Webhook / trigger |
|----|------|-------------------|
| `DT2i65lSjtCqay4g` | Agente-Instagram | Meta webhook Instagram |
| `sAKXdpoqdJdazpSi` | Agente-WhatsApp | `/whatsapp-evolution` + cron 15s (fila) + cron agenda |

## Endpoints internos (API)

- `GET /api/internal/whatsapp-agent-config?instance=&phone=`
- `POST /api/internal/whatsapp/mark-boas-vindas`
- `POST /api/internal/whatsapp/enqueue`
- `POST /api/internal/whatsapp/process-ready`
- `POST /api/internal/whatsapp/qualificar-handoff`
- `POST /api/internal/whatsapp/agendar-compromisso`

Header obrigatório: `X-Internal-Secret: <INTERNAL_AGENT_API_SECRET>`
