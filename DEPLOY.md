# Deploy do Prestta

O Prestta é um app Node único (Express + SQLite em arquivo). Ele guarda **duas coisas em disco**:

| O quê | Onde | Variável |
|---|---|---|
| Banco de dados (`servio.db`) | `DATA_DIR` | `DATA_DIR=/data/db` |
| Fotos das OS e assinaturas | `UPLOAD_DIR` | `UPLOAD_DIR=/data/uploads` |

Por isso **o host precisa de disco persistente**. Hospedagem sem volume (Render free, Vercel,
Cloud Run) apaga banco e fotos a cada restart — serve para demonstrar, não para clientes pagantes.

> ⚠️ **Uma instância só.** SQLite em arquivo não suporta duas máquinas escrevendo no mesmo
> volume. Nunca escale para 2+ instâncias sem antes migrar o banco (ver "Quando crescer").

---

## 1. Deploy no Fly.io (caminho escolhido)

### 1.1 Instalar o CLI

```powershell
# Windows PowerShell
iwr https://fly.io/install.ps1 -useb | iex
```

Feche e reabra o terminal para o `fly` entrar no PATH.

### 1.2 Login e criação do app

```bash
fly auth login          # abre o navegador
fly launch --no-deploy --copy-config
```

O `fly launch` lê o `fly.toml` que já está no projeto. Se o nome `prestta` estiver em uso,
escolha outro — a URL final será `https://SEU-NOME.fly.dev`.

### 1.3 Criar o volume persistente

```bash
fly volumes create prestta_data --size 1 --region gru
```

`gru` = São Paulo. 1 GB cabe o banco e alguns milhares de fotos comprimidas.

### 1.4 Configurar os segredos

```bash
# Gere um APP_SECRET forte:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

fly secrets set \
  APP_SECRET="<cole o valor gerado acima>" \
  APP_URL="https://SEU-NOME.fly.dev" \
  FIREBASE_PROJECT_ID="prestta" \
  SUPERADMIN_EMAIL="seu-email@gmail.com" \
  CAKTO_WEBHOOK_SECRET="<segredo que você define no painel da Cakto>" \
  CAKTO_CHECKOUT_ESSENCIAL_MENSAL="https://pay.cakto.com.br/xxxx" \
  CAKTO_CHECKOUT_ESSENCIAL_ANUAL="https://pay.cakto.com.br/xxxx" \
  CAKTO_CHECKOUT_PRO_MENSAL="https://pay.cakto.com.br/xxxx" \
  CAKTO_CHECKOUT_PRO_ANUAL="https://pay.cakto.com.br/xxxx" \
  CAKTO_CHECKOUT_ESCALA_MENSAL="https://pay.cakto.com.br/xxxx" \
  CAKTO_CHECKOUT_ESCALA_ANUAL="https://pay.cakto.com.br/xxxx"
```

O servidor **recusa subir em produção** sem `APP_SECRET` forte, `APP_URL` https e
`CAKTO_WEBHOOK_SECRET`. Isso é proposital: sem o segredo do webhook, qualquer pessoa poderia
chamar o endpoint e ativar uma assinatura de graça.

### 1.5 Subir

```bash
fly deploy
fly open              # abre https://SEU-NOME.fly.dev
```

### 1.6 Criar seu acesso de superadmin

```bash
fly ssh console -C "npm run bootstrap"
```

Isso usa o `SUPERADMIN_EMAIL` dos secrets. Depois entre em `/entrar` com o Google usando esse
e-mail — você cai no painel `/saas` (contas, MRR, leads, webhooks recebidos).

---

## 2. Configurar o Firebase (login com Google)

No [Firebase Console](https://console.firebase.google.com) → projeto `prestta` →
**Authentication → Settings → Authorized domains**, adicione:

```
SEU-NOME.fly.dev
```

Sem isso o popup do Google recusa o login em produção com `auth/unauthorized-domain`.

Se você usar domínio próprio depois, adicione ele também.

---

## 3. Configurar a Cakto (é assim que o dinheiro entra)

### 3.1 Criar as ofertas

No painel da Cakto, crie uma oferta para cada plano/ciclo (6 no total):

| Plano | Mensal | Anual (valor/mês × 12 cobrado de uma vez) |
|---|---|---|
| Essencial | R$ 89,00 | R$ 71,00 → R$ 852,00/ano |
| Pro | R$ 189,00 | R$ 151,00 → R$ 1.812,00/ano |
| Escala | R$ 349,00 | R$ 279,00 → R$ 3.348,00/ano |

Os preços vivem em [`server/plans.js`](server/plans.js), em **centavos**. Se mudar lá, mude na
Cakto também — os dois precisam bater.

Copie o link de checkout de cada oferta para as variáveis `CAKTO_CHECKOUT_<PLANO>_<CICLO>`.

### 3.2 Configurar o webhook

Painel da Cakto → **Ferramentas → Webhooks**:

- **URL:** `https://SEU-NOME.fly.dev/api/webhooks/cakto`
- **Segredo:** o mesmo valor que você colocou em `CAKTO_WEBHOOK_SECRET`
- **Eventos:** compra aprovada, compra recusada, reembolso, chargeback, assinatura renovada,
  assinatura cancelada, assinatura atrasada

### 3.3 Como o pagamento vira acesso

```
Cliente clica "Assinar" no painel
   → POST /api/subscription/checkout
   → monta o link da Cakto com external_reference = id da conta
   → cliente paga na Cakto
   → Cakto chama POST /api/webhooks/cakto
   → valida o segredo, casa external_reference (ou e-mail) com a conta
   → status da conta vira "ativo", plano e data de renovação atualizados
```

Eventos e o resultado de cada um:

| Evento da Cakto | Ação | Status da conta |
|---|---|---|
| aprovado / pago / renovado | `ativar` | `ativo` |
| recusado / atrasado / não pago | `suspender` | `atrasado` |
| cancelado / expirado | `cancelar` | `cancelado` |
| reembolso / chargeback | `cancelar` | `cancelado` |

Tudo que chega fica registrado na tabela `webhook_events` e aparece no painel `/saas`, mesmo
os eventos que não casaram com nenhuma conta — é ali que você investiga um pagamento que
"não caiu".

### 3.4 Testar sem gastar dinheiro

Logado como superadmin:

```bash
curl -X POST https://SEU-NOME.fly.dev/api/webhooks/cakto/simular \
  -H "Content-Type: application/json" \
  -b "servio_session=<seu cookie>" \
  -d '{"tenant_id":"t_xxxx","plan":"pro","cycle":"mensal","event":"purchase_approved"}'
```

---

## 4. E-mails transacionais e régua de cobrança

Sem `MAIL_API_KEY` o sistema roda em **modo log**: o e-mail aparece no console e fica registrado
na tabela `email_log` com status `simulado`. Nada quebra — dá para subir em produção antes de
escolher o provedor, mas ninguém recebe nada.

Provedores suportados (ambos têm plano gratuito):

| Provedor | `MAIL_PROVIDER` | Gratuito |
|---|---|---|
| [Resend](https://resend.com) | `resend` | 3.000 e-mails/mês |
| [Brevo](https://brevo.com) | `brevo` | 300 e-mails/dia |

```bash
fly secrets set \
  MAIL_PROVIDER="resend" \
  MAIL_API_KEY="re_xxxxx" \
  MAIL_FROM="nao-responda@seudominio.com.br" \
  MAIL_FROM_NAME="Prestta" \
  MAIL_REPLY_TO="suporte@seudominio.com.br"
```

> Os dois provedores exigem **verificar o domínio por DNS** antes de enviar em nome dele.
> Enviar de `@gmail.com` não funciona e cai em spam.

### O que é enviado

| Quando | E-mail | Disparo |
|---|---|---|
| Cadastro concluído | Boas-vindas | imediato |
| 3 dias e 1 dia antes do fim do teste | Teste acabando | job |
| Teste expirou | Teste terminou | job |
| Webhook de pagamento aprovado | Pagamento confirmado | webhook |
| Webhook de cobrança recusada | Pagamento falhou + prazo | webhook |
| Fim da carência sem regularizar | Acesso pausado | job |
| Assinatura cancelada | Cancelamento | webhook |

O job roda dentro do próprio processo, a cada 6 horas, sem cron externo. Todo envio usa uma
chave de deduplicação: reiniciar o servidor ou rodar o job de novo **não reenvia** nada.
Para desligar: `DISABLE_JOBS=1`.

### Carência de pagamento

`GRACE_DAYS` (padrão **7**) define quantos dias a conta continua funcionando depois que a Cakto
avisa que a cobrança falhou. Durante a carência o painel mostra o prazo restante; vencido,
o acesso operacional é pausado — mas `/api/subscription` continua aberto para o cliente pagar,
e nada é apagado.

---

## 5. Páginas legais

`/termos` e `/privacidade` estão publicadas e linkadas no rodapé, no formulário de cadastro e no
rodapé dos e-mails.

> ⚠️ **São minutas.** Antes de divulgar o sistema, preencha os campos entre colchetes
> (`[RAZÃO SOCIAL]`, `[CNPJ]`, `[E-MAIL DO DPO]`, `[CIDADE/UF]`…) e mande revisar por um
> advogado. O aviso amarelo no topo das páginas some quando você remover a `div.lg-draft`
> de cada arquivo.

Confira também se a lista de operadores em "Com quem compartilhamos" bate com o que você
realmente usa — se trocar o provedor de e-mail ou a hospedagem, a Política precisa acompanhar.

---

## 6. Operação do dia a dia

```bash
fly logs                              # logs ao vivo
fly status                            # estado da máquina
fly ssh console                       # shell dentro do container
fly deploy                            # publicar nova versão
fly scale count 1                     # NUNCA passe de 1 (SQLite)
```

### Backup do banco

O volume do Fly tem snapshot diário automático (retenção de 5 dias), mas faça o seu também:

```bash
fly ssh console -C "cat /data/db/servio.db" > backup-$(date +%F).db
```

Vale colocar isso numa tarefa semanal. Backup que ninguém testa não é backup — restaure um
para conferir de vez em quando.

---

## 7. Domínio próprio (opcional)

```bash
fly certs add app.seudominio.com.br
```

O Fly mostra os registros DNS a criar. Depois:

1. `fly secrets set APP_URL="https://app.seudominio.com.br"`
2. Adicione o domínio nos *Authorized domains* do Firebase
3. Atualize a URL do webhook no painel da Cakto

---

## 8. Quando crescer

O SQLite em arquivo aguenta bem uma operação pequena/média — o gargalo aparece quando você
precisa de **mais de uma instância** ou de failover automático. Sinais de que chegou a hora:

- Mais de ~50 empresas ativas escrevendo ao mesmo tempo
- Você quer zero downtime durante o deploy
- Precisa de réplica de leitura ou failover regional

Caminhos, do mais barato ao mais robusto:

1. **Litestream** — replica o SQLite continuamente para um bucket S3/R2. Continua uma instância,
   mas o backup vira contínuo e a restauração é rápida. Menor mudança de código: nenhuma.
2. **Turso / libSQL** — SQLite gerenciado e distribuído. Exige trocar `server/db.js` para o
   cliente async (`@libsql/client`) e transformar as chamadas `get/all/run` em `await`.
3. **Postgres** — quando precisar de concorrência de escrita real. Reescrita maior de `db.js`;
   o schema em si migra quase sem mudança.

As fotos e assinaturas (`UPLOAD_DIR`) devem sair para um bucket (R2/S3) junto com o passo 2 ou 3 —
`server/storage.js` é o único arquivo que grava em disco, então é ali que a troca acontece.
