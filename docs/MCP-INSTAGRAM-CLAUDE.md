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

### Claude Desktop (`claude_desktop_config.json`)

O Desktop **não** aceita `url`/`headers` no JSON (isso é formato Cursor). Usa um bridge `mcp-remote` → EasyPanel:

Arquivo: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "instagram-maquina-de-vendas": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote@latest",
        "https://mcp-instagram-mcp.kxryyk.easypanel.host/mcp",
        "--transport",
        "http-only",
        "--header",
        "Authorization:${AUTH_HEADER}"
      ],
      "env": {
        "AUTH_HEADER": "Bearer COLE_MCP_API_KEY_DO_EASYPANEL"
      }
    }
  }
}
```

**Feche o Claude por completo** (bandeja do sistema, não só a janela) e abra de novo. Em Settings → Developer o servidor deve ficar verde. Precisa ter Node.js no PATH.

### Claude.ai / app (Custom Connector)

1. **Customize → Connectors → Add custom connector**
2. Nome: `Instagram Máquina de Vendas`
3. URL: `https://mcp-instagram-mcp.kxryyk.easypanel.host/mcp`
4. Authentication: **No sign in**
5. Request headers: `Authorization` = `Bearer COLE_MCP_API_KEY_DO_EASYPANEL`

### Cursor (`~/.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "instagram-maquina-de-vendas": {
      "type": "http",
      "url": "https://mcp-instagram-mcp.kxryyk.easypanel.host/mcp",
      "headers": {
        "Authorization": "Bearer COLE_MCP_API_KEY_DO_EASYPANEL"
      }
    }
  }
}
```

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
