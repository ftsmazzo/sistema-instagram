# MCP Instagram → Claude (Máquina de Vendas)

Opera o Instagram **via API oficial da Meta** (sem PrintWindows / automação de tela).

App Meta: **Máquina de Vendas** (`3250934181723132`)  
Pasta do servidor: `mcp-instagram/`

## O que isso é

```
Claude Desktop  ──stdio──►  MCP Instagram  ──HTTPS──►  Graph API (Meta)
```

É o equivalente “caseiro” dos conectores pagos: o Claude chama tools (`ig_publish_image`, `ig_list_media`, `ig_send_dm`…).

**Não confundir** com o MCP *Meta Social Technologies* (devtools do developers.facebook.com). Aquele gerencia o **app**. Este opera a **conta Instagram**.

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

## Setup rápido

### 1. Instalar

```bash
cd mcp-instagram
npm install
npm run build
```

### 2. Credenciais

No painel **Máquina de Vendas → Administração**, copie:

- `ig_user_id`
- `access_token` (publicação, `EAA…`) **ou** `agent_access_token` (`IGAA…`)

Crie `mcp-instagram/.env` (só local; **não commitar**):

```env
IG_USER_ID=seu_ig_user_id
INSTAGRAM_ACCESS_TOKEN=seu_token
# FACEBOOK_PAGE_ID=opcional_se_EAA_e_DM_via_pagina
META_GRAPH_VERSION=v24.0
```

### 3. Claude Desktop

Arquivo (Windows): `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "instagram-maquina-de-vendas": {
      "command": "node",
      "args": [
        "C:\\Users\\anjo_\\OneDrive\\Projetos-FabriaIA\\Agente-Instagram\\mcp-instagram\\dist\\index.js"
      ],
      "env": {
        "IG_USER_ID": "COLE_AQUI",
        "INSTAGRAM_ACCESS_TOKEN": "COLE_AQUI",
        "META_GRAPH_VERSION": "v24.0"
      }
    }
  }
}
```

Reinicie o Claude Desktop. Em **Settings → Developer / MCP**, o servidor deve aparecer verde.

### 4. Cursor (opcional)

Em `~/.cursor/mcp.json`, mesma entrada `command`/`args`/`env`.

## Limitações (Meta)

- Conta **Business ou Creator**.
- App Review: várias permissões Instagram ainda **rejeitadas** no Máquina de Vendas — em contas **admin/tester** do app o modo desenvolvimento costuma funcionar; para clientes externos precisa aprovação.
- DM: regras da janela de 24h / Human Agent.
- Publicar: `image_url` precisa ser acessível pela Meta (HTTPS público).

## Checklist App (já no app)

Use case **INSTAGRAM_BUSINESS** já está. Para produção ampla, concluir App Review de:

- `instagram_business_basic`
- `instagram_business_content_publish`
- `instagram_business_manage_messages`
- `instagram_business_manage_comments`
- `instagram_business_manage_insights` (opcional)

E inscrever webhook tópico `instagram` (`messages`, `comments`) se quiser eventos em tempo real no n8n — o MCP em si é **pull/push sob demanda**, não substitui webhook.
