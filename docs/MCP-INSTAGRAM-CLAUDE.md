# MCP Instagram → Claude (Máquina de Vendas)

Opera o Instagram **via API oficial da Meta** (sem PrintWindows / automação de tela).

App Meta: **Máquina de Vendas** (`3250934181723132`)  
Serviço EasyPanel: projeto `mcp-instagram` / app `mcp`

## Conexão (remoto — use isto)

```
Claude / Cursor  ──HTTPS + Bearer──►  EasyPanel MCP  ──Graph API──►  Instagram
```

| Campo | Valor |
|-------|--------|
| URL MCP | `https://mcp-instagram-mcp.kxryyk.easypanel.host/mcp` |
| Health | `https://mcp-instagram-mcp.kxryyk.easypanel.host/health` |
| Auth | Header `Authorization: Bearer <MCP_API_KEY>` |
| Painel | EasyPanel Fábrica → projeto **mcp-instagram** → serviço **mcp** |

A `MCP_API_KEY` está nas **Environment Variables** do serviço no EasyPanel (não commitada).

### Claude Desktop / Claude.ai (HTTP)

```json
{
  "mcpServers": {
    "instagram-maquina-de-vendas": {
      "url": "https://mcp-instagram-mcp.kxryyk.easypanel.host/mcp",
      "headers": {
        "Authorization": "Bearer COLE_MCP_API_KEY_DO_EASYPANEL"
      }
    }
  }
}
```

Arquivo local (Windows): `%APPDATA%\Claude\claude_desktop_config.json`  
Reinicie o Claude. Em **Settings → Developer / MCP**, o servidor deve ficar verde.

### Cursor (`~/.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "instagram-maquina-de-vendas": {
      "url": "https://mcp-instagram-mcp.kxryyk.easypanel.host/mcp",
      "headers": {
        "Authorization": "Bearer COLE_MCP_API_KEY_DO_EASYPANEL"
      }
    }
  }
}
```

Não precisa instalar Node nem mexer em pasta local.

## Tools

| Tool | Função |
|------|--------|
| `ig_get_profile` | Perfil da conta |
| `ig_list_media` | Posts recentes |
| `ig_get_media` | Detalhe de um post |
| `ig_publish_image` | Publicar imagem (URL HTTPS pública) |
| `ig_list_comments` | Comentários |
| `ig_reply_comment` | Responder comentário |
| `ig_list_conversations` | Lista DMs |
| `ig_get_conversation` | Mensagens de uma DM |
| `ig_send_dm` | Enviar DM (janela 24h Meta) |
| `ig_media_insights` | Insights do post |

## Deploy / código

- Repo: `ftsmazzo/sistema-instagram`, path `/mcp-instagram`
- Dockerfile na pasta `mcp-instagram/`
- Variáveis no EasyPanel: `MCP_API_KEY`, `IG_USER_ID`, `INSTAGRAM_ACCESS_TOKEN`, `META_GRAPH_VERSION`, `PORT=3000`, `HOST=0.0.0.0`

Para redeploy: EasyPanel → **mcp-instagram** → **mcp** → Deploy (ou push em `main` se o webhook GitHub estiver ativo).

## Modo local (opcional / debug)

Só se precisar depurar sem EasyPanel:

```bash
cd mcp-instagram
npm install && npm run build
# .env com IG_USER_ID + INSTAGRAM_ACCESS_TOKEN + MCP_API_KEY
npm run start:http   # ou: node dist/http.js
```

Stdio (legado): `node dist/index.js` com env no `claude_desktop_config.json` — ver `mcp-instagram/claude_desktop_config.example.json`.

## Limitações (Meta)

- Conta **Business ou Creator**.
- App Review: várias permissões ainda **rejeitadas** no Máquina de Vendas — em contas admin/tester o modo desenvolvimento costuma funcionar.
- DM: janela 24h / Human Agent.
- Publicar: `image_url` HTTPS pública acessível pela Meta.
