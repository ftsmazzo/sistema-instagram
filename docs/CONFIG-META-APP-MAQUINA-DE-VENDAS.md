# Checklist — App Meta **Máquina de Vendas** (FabriaIA)

Um **único app** na Meta serve **todos os clientes** da plataforma. Cada cliente só clica **Conectar conta Meta** no painel — não cria app no Developer.

Use este guia para configurar o app **Máquina de Vendas** uma vez. Depois, escalar é só OAuth + webhook por conta Instagram.

---

## URLs de produção (FabriaIA)

Substitua apenas se você mudar domínios no EasyPanel.

| Serviço | URL |
|---------|-----|
| **API** | `https://plataforma-instagram-instagram-backend.kxryyk.easypanel.host` |
| **Painel** | URL externa do app **painel** no EasyPanel (ex.: `https://plataforma-instagram-….kxryyk.easypanel.host`) |
| **n8n** | `https://infra-core-n8n-core.kxryyk.easypanel.host` |
| **Webhook Instagram (n8n)** | `https://infra-core-n8n-core.kxryyk.easypanel.host/webhook/instagram` |
| **Webhook WhatsApp Evolution (n8n)** | `https://infra-core-n8n-core.kxryyk.easypanel.host/webhook/whatsapp-evolution` |

**OAuth callback (API):**

```
https://plataforma-instagram-instagram-backend.kxryyk.easypanel.host/api/auth/meta/callback
```

**Conformidade Meta (API):**

| Finalidade | URL |
|------------|-----|
| Desautorização do app | `https://plataforma-instagram-instagram-backend.kxryyk.easypanel.host/api/auth/meta/deauthorize` |
| Exclusão de dados (callback) | `https://plataforma-instagram-instagram-backend.kxryyk.easypanel.host/api/auth/meta/data-deletion` |
| Política de privacidade (painel) | `https://SEU-PAINEL/politica-de-privacidade.html` |

**Workflows n8n (referência):**

| Workflow | ID |
|----------|-----|
| Agente-Instagram | `DT2i65lSjtCqay4g` |
| Agente-WhatsApp | `sAKXdpoqdJdazpSi` |

---

## Parte 1 — App no [developers.facebook.com](https://developers.facebook.com)

### 1.1 Abrir o app

- [ ] Entrar em **Meta for Developers** → **Meus apps** → **Máquina de Vendas**
- [ ] Anotar **ID do app** e **Chave secreta do app** (Configurações → Básico)

### 1.2 Tipo de app e casos de uso

- [ ] Tipo adequado: **Business** (ou equivalente com Instagram + Facebook Login)
- [ ] Caso de uso: gerenciar presença comercial / mensagens / conteúdo Instagram

### 1.3 Produtos a adicionar (no mesmo app)

| Produto | Para quê |
|---------|----------|
| **Instagram** | Webhooks, mensagens, comentários, API Graph Instagram |
| **Facebook Login** | OAuth “Conectar conta Meta” no painel (modo recomendado) |
| **Webhooks** | Receber comentários e Direct no n8n |

> **Recomendado:** `META_OAUTH_MODE=facebook` na API. Se usar só `instagram.com/oauth` e aparecer *Invalid platform app*, adicione **Facebook Login** com o **mesmo** `redirect_uri`.

### 1.4 Facebook Login → Configurações

**Configurações** → **Facebook Login** → **Configurações**:

- [ ] **Login do OAuth na web:** Sim
- [ ] **URIs de redirecionamento OAuth válidos** — adicionar **exatamente**:

```
https://plataforma-instagram-instagram-backend.kxryyk.easypanel.host/api/auth/meta/callback
```

- [ ] Salvar alterações

### 1.5 Instagram → Configurações do login da empresa (se usar produto Instagram)

Se configurou **Login da empresa** no produto Instagram:

- [ ] **URIs de redirecionamento OAuth** — mesma URL do callback acima
- [ ] **URL de desautorização:**

```
https://plataforma-instagram-instagram-backend.kxryyk.easypanel.host/api/auth/meta/deauthorize
```

- [ ] **URL de solicitação de exclusão de dados:**

```
https://plataforma-instagram-instagram-backend.kxryyk.easypanel.host/api/auth/meta/data-deletion
```

- [ ] **Política de privacidade:** URL pública do painel, ex.:

```
https://SEU-PAINEL/politica-de-privacidade.html
```

(arquivo estático em `painel/public/politica-de-privacidade.html`)

---

## Parte 2 — Webhooks Instagram (app Meta → n8n)

### 2.1 Cadastrar webhook no app

**Produtos** → **Webhooks** (ou Instagram → Webhooks):

- [ ] **Callback URL:**

```
https://infra-core-n8n-core.kxryyk.easypanel.host/webhook/instagram
```

- [ ] **Verify token:** string que **você inventa** (ex.: `maquina-vendas-verify-2026`) — anote; o n8n usa no nó Webhook se configurado
- [ ] Clicar **Verificar e salvar** (Meta envia GET; o workflow **Agente-Instagram** precisa estar **ativo**)

### 2.2 Assinar campos (Instagram)

Objeto: **Instagram** (conta comercial conectada ao app).

| Campo | Usar? | Motivo |
|-------|-------|--------|
| `messages` | ✅ Sim | Direct (agente WA/IG) |
| `comments` | ✅ Sim | Agente de comentários |
| `live_comments` | ✅ Sim | Comentários em live |
| `message_reactions` | ❌ Não | Reação na DM — filtramos no n8n |
| `messaging_handover` | ❌ Não | |
| `mentions` | ❌ Opcional | Só se quiser tratar @menção |
| `story_insights` | ❌ Não | |

- [ ] Inscrever a **conta Instagram de teste** (e depois cada conta de cliente após OAuth)

Detalhes do filtro no workflow: `docs/FILTRO-WEBHOOK-INSTAGRAM.md`.

### 2.3 n8n — workflow Agente-Instagram

- [ ] Workflow `DT2i65lSjtCqay4g` **publicado/ativo**
- [ ] Path do webhook: `instagram`
- [ ] Nó **HTTP Config** com header `X-Internal-Secret` (valor = `INTERNAL_AGENT_API_SECRET` na API — **não commitar**)
- [ ] **Resposta Direct Privado** usa `POST /{page_id}/messages` com body `{ recipient: { comment_id }, message: { text } }` (doc Meta Private Replies)

---

## Parte 3 — Permissões (App Review)

### 3.1 Modo desenvolvimento (agora)

- [ ] Adicionar contas Instagram/Facebook como **Testadores** ou **Administradores** do app
- [ ] Só essas contas funcionam até aprovação em produção

### 3.2 Permissões para pedir na revisão (produção / clientes reais)

Pedir no **App Review** do app **Máquina de Vendas**:

| Permissão | Uso na plataforma |
|-----------|-------------------|
| `instagram_basic` | Perfil e mídia |
| `instagram_content_publish` | Postador |
| `instagram_manage_comments` | Agente comentários |
| `instagram_manage_messages` | Agente Direct + private reply via `/{page_id}/messages` |
| `pages_show_list` | Listar páginas no OAuth |
| `pages_read_engagement` | Página vinculada ao IG |
| `business_management` | Contas comerciais |

Gravação de tela + texto de uso: “SaaS para imobiliárias/corretores responderem comentários e Direct e publicarem conteúdo”.

- [ ] Submeter revisão quando for onboardar clientes fora do time de teste

---

## Parte 4 — Variáveis na API (EasyPanel)

No serviço **instagram-backend** (API):

```env
# OAuth — app Máquina de Vendas
META_APP_ID=<ID do app>
META_APP_SECRET=<Chave secreta>
META_OAUTH_REDIRECT_URI=https://plataforma-instagram-instagram-backend.kxryyk.easypanel.host/api/auth/meta/callback
PAINEL_PUBLIC_URL=https://SEU-PAINEL.kxryyk.easypanel.host
META_OAUTH_MODE=facebook

# Opcional
META_GRAPH_VERSION=v21.0
META_DATA_DELETION_CONTACT_EMAIL=suporte@fabriia.com.br

# Agente interno (n8n → API)
INTERNAL_AGENT_API_SECRET=<segredo forte>
```

- [ ] Preencher `META_APP_ID` e `META_APP_SECRET` do app **Máquina de Vendas**
- [ ] `PAINEL_PUBLIC_URL` = URL **externa do painel** (redirect após OAuth)
- [ ] Reiniciar/redeploy da API após salvar

**Teste rápido:** logar no painel → **Administração** → deve aparecer **Conectar conta Meta**. Ao clicar, abre login Facebook/Instagram.

---

## Parte 5 — Fluxo por cliente (sem novo app)

Para **cada organização** no painel:

1. [ ] Cliente tem **Instagram Business/Creator** vinculado a **Página do Facebook**
2. [ ] No painel: **Administração** → **Conectar conta Meta**
3. [ ] Login Meta → escolher **página** com Instagram vinculado
4. [ ] API grava `access_token`, `agent_access_token` e `ig_user_id` automaticamente
5. [ ] No app Meta (Webhooks): **inscrever** a conta Instagram do cliente nos campos `messages` + `comments` (se a Meta não inscrever sozinha após OAuth)
6. [ ] Ativar **Agente** na conta (Administração) e configurar WhatsApp se usar Fase 2

**Não é necessário:** novo app Meta, copiar token do Graph API Explorer, Developer Console por cliente.

---

## Parte 6 — Checklist de validação

| Teste | Esperado |
|-------|----------|
| GET `…/health` na API | `{ "ok": true }` ou equivalente |
| Botão **Conectar Meta** no painel | Redireciona para Facebook/Instagram |
| Após conectar | Conta aparece com badges **Token postagem** / **Token agente** |
| Comentário em post da conta teste | n8n executa workflow Agente-Instagram |
| DM na conta teste | Agente Direct responde |
| Postador publica | Graph API aceita token da conta |

---

## Parte 7 — Problemas comuns

| Erro | Solução |
|------|---------|
| **Invalid platform app** no login Instagram | `META_OAUTH_MODE=facebook` + produto **Facebook Login** + mesmo redirect |
| **Redirect URI mismatch** | URL no Meta **idêntica** a `META_OAUTH_REDIRECT_URI` (https, sem barra extra) |
| Webhook não verifica | Workflow n8n ativo; URL pública acessível; verify token correto |
| Cliente conectou mas webhook não chega | Inscrever IG nos campos em Webhooks; conta Business; app em modo dev só testadores |
| `(#3) Application does not have the capability` no DM após comentário | Usar `POST /{page_id}/messages` com `recipient.comment_id`; token de **Página** + `instagram_manage_messages` (não pedir `pages_messaging` — scope inválido no OAuth) |
| **Invalid Scopes: pages_messaging** no login | Remover `pages_messaging` do OAuth; usar só `instagram_manage_messages` + `pages_show_list` |
| Token expira (~60 dias) | Cliente clica **Conectar Meta** de novo (renovação automática pode ser implementada depois) |

---

## Resumo

| Quem | Faz o quê |
|------|-----------|
| **FabriaIA (você)** | Configura **1×** app **Máquina de Vendas** + variáveis na API + webhooks n8n |
| **Cada cliente** | **Conectar conta Meta** no painel (1 fluxo OAuth) |

Referências no código: `api/src/services/metaOAuth.ts`, `api/src/routes/auth.ts`, `painel/src/pages/AdminPage.tsx`, `api/.env.example`.
