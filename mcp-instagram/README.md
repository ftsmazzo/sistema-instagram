# MCP Instagram — Máquina de Vendas

Servidor MCP (HTTP + stdio) para **Claude** e **Cursor** operar Instagram via Graph API.

Guia: [`docs/MCP-INSTAGRAM-CLAUDE.md`](../docs/MCP-INSTAGRAM-CLAUDE.md)

## Tools (v1.1)

| Tool | Função |
|------|--------|
| `ig_get_profile` | Perfil |
| `ig_list_media` / `ig_get_media` | Feed (+ cursor `after`) |
| `ig_publish_image` / `ig_publish_reel` / `ig_publish_carousel` / `ig_publish_story` | Publicar |
| `ig_list_comments` / `ig_reply_comment` / `ig_hide_comment` / `ig_delete_comment` | Comentários |
| `ig_list_conversations` / `ig_get_conversation` / `ig_send_dm` | DMs |
| `ig_media_insights` / `ig_account_insights` | Insights |
| `ig_audit_snapshot` / `ig_weekly_metrics` | Estratégia (Prompts 1 e 7) |

## Prompts MCP (Tilli)

`diagnostico-100k`, `novo-posicionamento`, `central-30-dias`, `cirurgiao-hooks`, `roteiro-retencao`, `funil-invisivel`, `reuniao-semanal`

## Local

```bash
npm install
npm run build
cp .env.example .env   # IG_USER_ID + INSTAGRAM_ACCESS_TOKEN (+ MCP_API_KEY no HTTP)
npm start              # HTTP :3000/mcp
```

## Claude Desktop (bridge → EasyPanel)

Mesmo padrão dos outros MCPs (`MCP_REMOTE_URL` + `MCP_TOKEN`):

```json
{
  "mcpServers": {
    "instagram-maquina-de-vendas": {
      "command": "node",
      "args": [
        "C:\\Users\\anjo_\\OneDrive\\Projetos-FabriaIA\\Agente-Instagram\\mcp-instagram\\scripts\\mcp-stdio.mjs"
      ],
      "env": {
        "MCP_REMOTE_URL": "https://mcp-instagram-mcp.kxryyk.easypanel.host/mcp",
        "MCP_TOKEN": "SUA_MCP_API_KEY"
      }
    }
  }
}
```

Arquivo real do Claude neste PC:  
`%LOCALAPPDATA%\Claude-Data\claude_pzs8sxrjxfjjc\claude_desktop_config.json`
