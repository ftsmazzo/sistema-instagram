# Liberar clientes reais no «Conectar Meta» (sem testador um a um)

## O problema

Você configurou links, variáveis e conectou **sua** conta — mas o **cliente** vê:

> Recurso indisponível — o Login do Facebook está indisponível para este aplicativo…

**Isso não é falha do painel FabriaIA.** A Meta bloqueia login para quem **não é admin/testador** enquanto o app não estiver **aprovado para produção**.

Configurar `META_APP_*` e redirect = liga o fluxo técnico.  
**Liberar clientes** = processo no **Meta for Developers** (abaixo).

---

## O que a Meta exige (nesta ordem)

### 1. Configurações básicas do app (Configurações → Básico)

- [ ] **Ícone** do app
- [ ] **Categoria** e subcategoria
- [ ] **URL da política de privacidade** — URL pública do painel, ex.:  
  `https://SEU-PAINEL/politica-de-privacidade.html`  
  (edite o texto em `painel/public/politica-de-privacidade.html` — troque `[NOME COMERCIAL]`, CNPJ, etc.)
- [ ] **Exclusão de dados do usuário** — URL:  
  `https://SUA-API/api/auth/meta/data-deletion`
- [ ] **Desautorização** — URL:  
  `https://SUA-API/api/auth/meta/deauthorize`

### 2. Facebook Login (produto no app)

**Facebook Login → Configurações:**

- [ ] Login OAuth na web: **Sim**
- [ ] URI de redirect **idêntica** a `META_OAUTH_REDIRECT_URI`  
  Ex.: `https://SUA-API/api/auth/meta/callback`

### 3. Verificação comercial (Business Verification)

**Configurações → Verificação comercial**

- [ ] Enviar documentos da empresa (CNPJ, site, etc.)
- [ ] Aguardar aprovação Meta (dias a semanas)

Sem verificação comercial **não** dá Advanced Access nas permissões Instagram.

### 4. Revisão do app — Advanced Access

**Revisão do app → Permissões**

Pedir **Advanced Access** (não basta Standard) para:

| Permissão | Para quê |
|-----------|----------|
| `public_profile` | Login Facebook (base) |
| `email` | Identificação no login |
| `pages_show_list` | Listar páginas no OAuth |
| `pages_read_engagement` | Página vinculada ao IG |
| `instagram_basic` | Perfil e mídia |
| `instagram_content_publish` | Postador |
| `instagram_manage_comments` | Agente comentários |
| `instagram_manage_messages` | Agente Direct |
| `business_management` | Contas comerciais |

Para cada permissão: **gravação de tela** mostrando o painel FabriaIA usando a função + texto explicando o SaaS.

### 5. Modo Ao vivo (Live)

**Publicar** (menu lateral) → alternar de **Desenvolvimento** para **Ao vivo**

Só faça isso **depois** das permissões críticas estarem aprovadas.

### 6. Ações necessárias

No painel do app Meta, se houver banner **Required actions / Ações necessárias** (Data Use Checkup, etc.), resolva **tudo** antes de testar com clientes.

---

## Como saber se já está pronto

1. **Painel FabriaIA → Administração** — caixa verde «clientes podem conectar» ou vermelha com lista do que falta.
2. **Meta → Revisão do app** — permissões com **Advanced Access: Ativo**.
3. **Teste com conta que NÃO é admin do app** (e-mail pessoal de um amigo) — deve passar do login Facebook sem erro.

---

## Alternativa temporária (só emergência)

Adicionar cliente como **Testador** no app Meta — **não escala**. Use só para demo enquanto a revisão não aprova.

---

## Referências

- Checklist técnico (URLs, webhooks, env): `docs/CONFIG-META-APP-MAQUINA-DE-VENDAS.md`
- Código OAuth: `api/src/services/metaOAuth.ts`
- Diagnóstico API: `GET /api/me/integrations/meta/readiness`
