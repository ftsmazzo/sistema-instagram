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

## De onde vem o token (sem OAuth no painel)

**Não use** Meta → Funções → Testador do Instagram. Essa tela exige login na conta IG, conta profissional, conta pública — é armadilha em app Dev.

O token colado em **Administração → Nova conta** precisa ser gerado num app Meta que **já tenha direito** sobre aquela conta Instagram. Na prática:

### Opção 1 — Cliente com empresa (recomendado)

- Cliente cria **app Meta dele** (developers.facebook.com).
- Cliente faz verificação **dele** + permissões Instagram.
- Gera **token de Página** (long-lived) no app **dele**.
- Cola no painel FabriaIA: `ig_user_id` + token.

Você **não** precisa ser testador. O app é **dele**.

### Opção 2 — Só a sua conta no app FabriaIA (Dev)

- **Você** é admin do app Máquina de Vendas → Graph API Explorer com **seu** Facebook admin da Página → gera token → cola no painel.
- Funciona para **suas** contas. **Não** escala para cliente externo no app Dev sem app próprio dele.

### Opção 3 — Graph API Explorer no app FabriaIA para cliente

Só funciona se a conta IG do cliente estiver vinculada como **testador do Instagram** no app FabriaIA (fluxo que você viu e que **não recomendamos**). Evite.

---

## Webhooks (agente comentários/DM)

Webhooks ficam no **app Meta que gerou/assina** aquela conta.

- App **FabriaIA** em Dev → webhooks só para contas ligadas a **esse** app (na prática: suas contas ou app do cliente).
- Cliente em produção → webhook no **app do cliente** apontando para seu n8n.

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
