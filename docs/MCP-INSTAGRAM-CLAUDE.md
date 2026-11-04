# MCP Instagram → Claude (Máquina de Vendas)

Opera o Instagram **via API oficial da Meta** (sem PrintWindows).

App Meta: **Máquina de Vendas** (`3250934181723132`)  
EasyPanel: projeto `mcp-instagram` / serviço `mcp`  
Código: `mcp-instagram/` (v1.1)

## Conexão remota

| Campo | Valor |
|-------|--------|
| URL MCP | `https://mcp-instagram-mcp.kxryyk.easypanel.host/mcp` |
| Health | `https://mcp-instagram-mcp.kxryyk.easypanel.host/health` |
| Auth | `Authorization: Bearer <MCP_API_KEY>` (env do serviço no EasyPanel) |

### Claude Desktop (arquivo real neste PC)

Path: `%LOCALAPPDATA%\Claude-Data\claude_pzs8sxrjxfjjc\claude_desktop_config.json`

```json
"instagram-maquina-de-vendas": {
  "command": "node",
  "args": [
    "C:\\Users\\anjo_\\OneDrive\\Projetos-FabriaIA\\Agente-Instagram\\mcp-instagram\\scripts\\mcp-stdio.mjs"
  ],
  "env": {
    "MCP_REMOTE_URL": "https://mcp-instagram-mcp.kxryyk.easypanel.host/mcp",
    "MCP_TOKEN": "COLE_MCP_API_KEY_DO_EASYPANEL"
  }
}
```

Feche o Claude por completo e reabra.

### Cursor (`~/.cursor/mcp.json`)

```json
"instagram-maquina-de-vendas": {
  "type": "http",
  "url": "https://mcp-instagram-mcp.kxryyk.easypanel.host/mcp",
  "headers": {
    "Authorization": "Bearer COLE_MCP_API_KEY_DO_EASYPANEL"
  }
}
```

### Claude.ai (Custom Connector)

Customize → Connectors → Add → URL acima → Auth **No sign in** → Request header `Authorization: Bearer …`

## Tools

| Tool | Função |
|------|--------|
| `ig_get_profile` | Perfil |
| `ig_list_media` | Posts (+ `after` cursor) |
| `ig_get_media` | Detalhe |
| `ig_publish_image` | Feed imagem |
| `ig_publish_reel` | Reel (vídeo HTTPS) |
| `ig_publish_carousel` | Carrossel 2–10 imagens |
| `ig_publish_story` | Story |
| `ig_list_comments` / `ig_reply_comment` / `ig_hide_comment` / `ig_delete_comment` | Comentários |
| `ig_list_conversations` / `ig_get_conversation` / `ig_send_dm` | DMs |
| `ig_media_insights` / `ig_account_insights` | Insights |
| `ig_audit_snapshot` | Snapshot auditoria (Prompt 1) |
| `ig_weekly_metrics` | Métricas 7 dias (Prompt 7) |

## Prompts MCP

| Nome | Uso |
|------|-----|
| `diagnostico-100k` | Auditoria (chame `ig_audit_snapshot` antes) |
| `novo-posicionamento` | Bio / território |
| `central-30-dias` | Calendário |
| `cirurgiao-hooks` | Hooks |
| `roteiro-retencao` | Roteiro Reels/carrossel |
| `funil-invisivel` | Funil → venda |
| `reuniao-semanal` | Semanal (chame `ig_weekly_metrics` antes) |

Transcrição completa: [`PROMPTS-MATHEUS-TILLI-INSTAGRAM.md`](./PROMPTS-MATHEUS-TILLI-INSTAGRAM.md)

## Deploy

- Repo `ftsmazzo/sistema-instagram`, path `/mcp-instagram`
- Env EasyPanel: `MCP_API_KEY`, `IG_USER_ID`, `INSTAGRAM_ACCESS_TOKEN`, `META_GRAPH_VERSION`, `PORT=3000`, `HOST=0.0.0.0`

## Limitações Meta

- Conta Business/Creator; App Review para produção ampla
- DM: janela 24h
- URLs de mídia HTTPS públicas
- Account insights podem falhar sem permissão aprovada (tools retornam erro explícito)
