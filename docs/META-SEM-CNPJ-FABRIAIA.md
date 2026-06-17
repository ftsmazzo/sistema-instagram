# Operar SEM CNPJ / sem Verificação comercial da FabriaIA

## Verdade direta

Se **você (FabriaIA)** não tem CNPJ e não consegue **Business Verification** no app Meta central:

- **NÃO dá** para vender «clique Conectar Meta e pronto» para clientes aleatórios num **único app seu**.
- **DÁ** para usar o painel normalmente com **token + ig_user_id colados manualmente** (Administração → Nova conta).

O botão **Conectar conta Meta** (OAuth) só escala para clientes reais quando **o dono do app Meta** passa na Verificação comercial + Revisão. Isso não é bug do código — é regra da Meta.

**Peço desculpas:** a documentação anterior sugeriu que links + variáveis bastavam. Isso estava errado para o seu caso.

---

## O que funciona HOJE no painel (sem OAuth)

1. **Administração** → **Nova conta**
2. Preencher:
   - **Nome**
   - **ig_user_id** (ID da conta Instagram comercial)
   - **Token de publicação** (Graph API — postador)
   - **Token do agente** (opcional; se vazio, usa o de postagem)
3. Marcar **Agente ativo** se for usar comentários/Direct
4. **Salvar**

Postador, cronograma e agente usam esses tokens — **não dependem** do botão OAuth.

---

## De onde o cliente tira o token (sem você ser testador)

O **cliente** (ou alguém com acesso admin da Página Facebook + Instagram dele) precisa gerar o token. Opções:

### A) Cliente tem CNPJ / empresa

- Cliente cria **app Meta dele** (ou vocês configuram uma vez como serviço).
- Cliente faz **Verificação comercial dele** + permissões Instagram.
- Gera **token de Página** com permissões de postagem e mensagens.
- Cola no painel dele (workspace dele).

### B) Cliente não tem app — Graph API Explorer (suporte pontual)

1. [developers.facebook.com](https://developers.facebook.com) — app em modo Dev (seu ou do cliente).
2. **Ferramentas → Graph API Explorer**
3. Selecionar app + usuário admin da Página
4. Permissões: `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_messages`, `pages_show_list`, `pages_read_engagement`
5. Gerar token → trocar por token de **Página** (long-lived)
6. Copiar **Page access token** + **Instagram Business Account ID** (`ig_user_id`)

**Limite:** em app **seu** em Dev, só funciona para contas **testadoras** do app. Para cliente real sem ser testador, o app usado na geração do token precisa ser **dele** (com verificação dele) ou app seu **em Live** (exige seu CNPJ).

### C) Você opera como «setup manual» (honesto comercialmente)

Produto vendido: **«configuramos seu Instagram no painel»** — não **«SaaS self-service com um clique»**.

---

## Webhooks (agente comentários/DM)

Webhooks Instagram ficam ligados ao **app Meta** que assina a conta.

- App **seu** em Dev → só contas testadoras recebem eventos.
- Cliente em produção → webhook no **app do cliente** apontando para seu n8n, **ou** app seu em Live (CNPJ).

---

## O que NÃO prometer sem CNPJ

| Promessa | Viável? |
|----------|---------|
| Cliente clica Conectar Meta sozinho | ❌ no app central seu |
| Postador + legenda IA com token colado | ✅ |
| Publicar no feed/Reels com token válido | ✅ |
| Agente comentários/DM | ✅ se token + webhook + permissões ok |
| Escala 100 clientes self-service OAuth | ❌ sem BV + Live |

---

## Resumo

- **OAuth central** = produto para **empresa com CNPJ verificada na Meta**.
- **Seu caminho** = **token manual por conta** + setup honesto com o cliente.
- O painel **já suporta** isso; o erro foi empurrar OAuth como se fosse o único fluxo.

Referência técnica: `docs/CONFIG-E-DADOS.md`, formulário em `painel/src/pages/AdminPage.tsx`.
