# Dashboard Google Ads | Dúit Marketing

Dashboard onde cada cliente da Dúit acompanha a própria conta Google Ads, com foco em conversões.
Os dados vêm do Postgres, alimentado por um job diário que lê a Google Ads API (REST, somente
leitura) através da MCC. O navegador nunca fala com a Google Ads API.

```
Cliente (celular/PC)
   │ https://duit-dashboard.<tailnet>.ts.net
   ▼
Tailscale Funnel ──► web (Caddy: front React + /api) ──► backend (Express + sync diário) ──► Postgres
                                                              │
                                                              └──► Google Ads API (GAQL, só leitura)
```

| Pasta | Conteúdo |
|---|---|
| `backend/` | API Express + TypeScript, job de sync, migrations (`backend/migrations`), testes |
| `frontend/` | React + Vite + TypeScript (cliente e admin), `Caddyfile` de produção |
| `deploy/tailscale/` | Configuração do Tailscale Funnel |
| `scripts/` | `deploy.sh` (atualizar o servidor) e `backup.sh` (pg_dump diário) |
| `brand/` | Logo oficial em produção (substitui o provisório sem rebuild) |

---

## 1. Rodando localmente

Requisitos: Node 22.9+, Docker.

```bash
cp .env.example .env              # preencha GOOGLE_ADS_* e JWT_SECRET (ver seção 2)
docker compose up -d              # Postgres local (cria também o banco de teste)

cd backend
npm install
npm run migrate:up
npm run seed:admin -- --email=voce@duitmarketing.com.br --nome="Seu Nome"   # pede a senha
npm run dev                       # API em http://localhost:3000

# em outro terminal
cd frontend
npm install
npm run dev                       # http://localhost:5173 (proxy de /api para a 3000)
```

Em dev, deixe `SYNC_SCHEDULER_ENABLED=false` no `.env` para não disparar o sync das 05:00.

### Comandos úteis (pasta `backend`)

```bash
npm run mcc:list                                   # lista as contas da MCC e grava em ad_accounts
npm run sync -- --customer-id=1234567890           # ativa a conta e sincroniza (1ª vez: 13 meses)
npm run sync -- --all                              # sincroniza todas as contas ativas
npm run report -- --customer-id=1234567890 --inicio=2026-09-01 --fim=2026-09-30
npm run gaql -- --customer-id=1234567890 "SELECT customer.id FROM customer"   # consulta avulsa (só SELECT)
```

O `report` imprime os totais gravados (conta, campanhas e ações de conversão) no mesmo recorte
do painel do Google Ads, para conferência.

### Testes

```bash
cd backend && npm test     # unitários + integração (usa TEST_DATABASE_URL, banco é recriado a cada execução)
cd frontend && npm test    # formatação pt-BR e presets de período
```

---

## 2. Variáveis de ambiente (`.env`)

| Variável | Para quê |
|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Banco. Em produção use senha só com letras e números: `openssl rand -hex 24` |
| `DATABASE_URL`, `TEST_DATABASE_URL` | Só em dev (em produção o compose monta a URL sozinho) |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Developer token (Centro de API da MCC) |
| `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET` | Cliente OAuth do Google Cloud |
| `GOOGLE_ADS_REFRESH_TOKEN` | Refresh token de um usuário com acesso à MCC (seção 3) |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | ID da MCC, só dígitos. Vai no header `login-customer-id` de toda chamada |
| `GOOGLE_ADS_API_VERSION` | Versão da API (`v26`). Ao sair versão nova, troque aqui e rode os testes |
| `JWT_SECRET` | Assina as sessões. Mínimo 32 caracteres: `openssl rand -base64 48`. Trocar derruba todas as sessões |
| `SESSION_DAYS` | Duração da sessão (padrão 7 dias) |
| `SYNC_CRON`, `SYNC_TZ` | Horário do sync diário (padrão `0 5 * * *`, `America/Sao_Paulo`) |
| `SYNC_WINDOW_DAYS` | Dias reprocessados a cada sync (padrão 30) |
| `SYNC_BACKFILL_MONTHS` | Carga inicial de uma conta nova (padrão 13 meses) |
| `SYNC_SCHEDULER_ENABLED` | `false` desliga o agendamento (dev) |
| `TS_AUTHKEY` | Chave do Tailscale, usada só no primeiro boot (seção 4) |
| `TS_HOSTNAME` | Nome do nó: vira `https://<TS_HOSTNAME>.<tailnet>.ts.net` |
| `TRUST_PROXY` | Em produção o compose já define (2 proxies: Tailscale e Caddy) |
| `SYNC_DAILY_OPS_BUDGET` | Operações/dia que o dashboard pode gastar na Google Ads API (padrão 350; cota dividida com o KiipitADS) |
| `INTERNAL_API_TOKEN` | Token da API interna usada pelo KiipitADS (`openssl rand -hex 32`). Vazio desliga a integração |
| `PUBLIC_URL` | Endereço público do dashboard (monta o link de login único) |
| `KIIPITADS_URL` | Endereço do KiipitADS (link "← KiipitADS" no admin) |
| `ADMIN_PASSWORD_LOGIN` | Vazio: admin não entra por senha quando a integração está ligada. `true` só em emergência |

Credenciais ficam só no `.env` (fora do git). Developer token, refresh token e client secret
nunca vão para o frontend nem para os logs.

---

## 3. Como gerar o refresh token

1. No [Google Cloud Console](https://console.cloud.google.com/apis/credentials), abra o cliente
   OAuth que você já usa (tipo **Aplicativo da Web**) e adicione em *URIs de redirecionamento
   autorizados*: `https://developers.google.com/oauthplayground`
2. **Importante:** em *Tela de consentimento OAuth*, o app precisa estar **Em produção**. Se
   estiver em *Teste*, o refresh token expira em 7 dias e o sync para com `invalid_grant`.
3. Abra o [OAuth Playground](https://developers.google.com/oauthplayground), clique na
   engrenagem, marque **Use your own OAuth credentials** e cole client ID e client secret.
4. Em *Step 1*, digite o escopo `https://www.googleapis.com/auth/adwords` e clique em
   **Authorize APIs**. Entre com o usuário Google que tem acesso à MCC.
5. Em *Step 2*, clique em **Exchange authorization code for tokens** e copie o
   **Refresh token** para `GOOGLE_ADS_REFRESH_TOKEN`.
6. Teste: `npm run gaql -- --customer-id=<ID da MCC> "SELECT customer.id FROM customer"`.

O refresh token deixa de valer se o usuário trocar a senha do Google, revogar o acesso ou ficar
6 meses sem uso. Nesse caso o histórico de sincronizações mostra `invalid_grant`: gere outro e
reinicie o backend (`docker compose -f docker-compose.prod.yml restart backend`).

---

## 4. Deploy no servidor (notebook com Docker + Tailscale Funnel)

O dashboard roda num nó próprio do Tailscale, separado do KiipitADS, e fica público em
`https://duit-dashboard.<tailnet>.ts.net` pelo Funnel (os clientes não precisam instalar nada).
Nenhuma porta é publicada no host: não há conflito com o KiipitADS nem porta aberta no roteador.

### 4.1 Pré-requisitos (uma vez)

- Linux com Docker e o plugin Compose v2 (`docker compose version`) e `git`.
- Docker iniciando com o sistema: `sudo systemctl enable docker`.
- Notebook sem suspender com a tampa fechada: em `/etc/systemd/logind.conf` defina
  `HandleLidSwitch=ignore` e `HandleLidSwitchExternalPower=ignore`, depois
  `sudo systemctl restart systemd-logind`.
- Na tailnet (o KiipitADS já usa, então devem estar ligados): **HTTPS Certificates** em
  *DNS* e permissão de **Funnel** na política de acesso. Se a política libera Funnel por tag,
  gere a chave do passo 4.2 com essa tag.

### 4.2 Chave do Tailscale

Em https://login.tailscale.com/admin/settings/keys gere uma **auth key** (não reutilizável,
não efêmera). Ela só é usada no primeiro boot; depois o estado fica salvo no volume `tsstate`.

### 4.3 Primeira instalação

```bash
ssh duitads
git clone https://github.com/julianoduit/dashboard.git duit-dashboard
cd duit-dashboard

cp .env.example .env
nano .env                    # preencha: POSTGRES_PASSWORD, GOOGLE_ADS_*, JWT_SECRET, TS_AUTHKEY, TS_HOSTNAME
chmod 600 .env

docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps          # backend e postgres "healthy"
docker compose -f docker-compose.prod.yml exec tailscale tailscale serve status   # mostra o endereço público

# primeiro admin (pede a senha)
docker compose -f docker-compose.prod.yml exec backend node dist/scripts/seedAdmin.js \
  --email=voce@duitmarketing.com.br --nome="Seu Nome"
```

Abra o endereço mostrado pelo `serve status`, entre com o admin e:

1. **Contas → Atualizar lista da MCC**
2. Ligue **Sincronizar** nas contas dos clientes (os últimos 30 dias entram na hora; o histórico de
   13 meses completa nos dias seguintes, dentro da cota diária).
3. Desligue **Valor/ROAS** nas contas de lead que usam valor padrão de conversão.
4. **Usuários → Novo usuário**: crie o cliente, gere a senha e vincule as contas.
5. Use **Ver como cliente** para conferir antes de mandar o acesso.

Logo oficial: copie para `brand/logo.svg` no servidor (vale na hora, sem rebuild).

### 4.4 Atualizar para uma versão nova

```bash
ssh duitads
cd duit-dashboard
./scripts/deploy.sh          # git pull da branch atual + rebuild + espera a API ficar saudável
```

Produção acompanha a `main`. `BRANCH=outra-branch ./scripts/deploy.sh` publica outra branch (para testar algo antes do merge). As migrations novas rodam
sozinhas quando o backend sobe.

### 4.5 Backup

```bash
crontab -e
# todo dia às 04:10:
10 4 * * * /home/<usuario>/duit-dashboard/scripts/backup.sh >> /home/<usuario>/duit-dashboard/backups/backup.log 2>&1
```

Os dumps ficam em `backups/` (14 dias). **Copie essa pasta para fora do notebook** (Google
Drive, outro computador): se o disco morrer, o backup morre junto.

Restaurar um backup:

```bash
gunzip -c backups/2026-10-27_0410.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres psql -U duit -d duit_dashboard
```

### 4.6 Operação e problemas comuns

```bash
C="docker compose -f docker-compose.prod.yml"
$C logs -f backend                  # logs da API e do sync (JSON)
$C logs backend | grep -i erro      # só erros
$C restart backend                  # depois de mudar o .env
$C exec tailscale tailscale status  # conexão do Tailscale
```

| Sintoma | Causa provável |
|---|---|
| Sync com `invalid_grant` | Refresh token expirou ou foi revogado (seção 3) |
| Sync com `falha de rede` | Notebook sem internet ou DNS; o próximo sync reprocessa os 30 dias |
| Endereço não abre de fora | `tailscale serve status` sem Funnel: confira a permissão de Funnel na política |
| Cliente diz que os números mudaram | Normal nos últimos dias: o Google atribui a conversão ao dia do clique, e o sync reprocessa 30 dias |
| `USER_PERMISSION_DENIED` numa conta | A conta saiu da MCC ou o usuário do refresh token perdeu acesso |

Se o notebook ficar desligado, o dashboard fica fora do ar durante esse tempo. Os dados se
recuperam sozinhos no sync seguinte, porque cada execução reprocessa os últimos 30 dias.

---

## 5. Integração com o KiipitADS

O KiipitADS (`github.com/julianoduit/KiipitADS`) é a visão da equipe; este dashboard é o que o
cliente vê. Os dois rodam no mesmo notebook e conversam pela rede Docker `duit-interno`:

- **API interna** (`/api/internal/*`, token `INTERNAL_API_TOKEN`): o KiipitADS lista as contas
  (por customer ID), ativa/desativa, liga/desliga valor/ROAS e pede sincronização. O Caddy responde
  404 para esse caminho, então ela só existe dentro do servidor, em `http://dashboard-api:3000`.
- **Login único**: o KiipitADS pede um link de uso único (60 s) e abre o admin daqui já logado
  como "Equipe Dúit (KiipitADS)". Com a integração ligada, admin não entra mais por senha no site
  público. Clientes continuam entrando normalmente.

Para ligar (no notebook):

1. No `.env` daqui: `INTERNAL_API_TOKEN` (gere com `openssl rand -hex 32`), `PUBLIC_URL`,
   `KIIPITADS_URL` e `SYNC_DAILY_OPS_BUDGET=350`. Depois `./scripts/deploy.sh` (cria a rede `duit-interno`).
2. No `.env` do KiipitADS (`/opt/kiipitads/.env`): `KIIPIT_DASHBOARD_API=http://dashboard-api:3000` e
   `KIIPIT_DASHBOARD_TOKEN=<o mesmo token>`. Depois `kiipit publicar`.

Emergência (KiipitADS fora do ar e precisa do admin daqui): `ADMIN_PASSWORD_LOGIN=true` no `.env` e
`docker compose -f docker-compose.prod.yml up -d backend`. Desligue de novo depois.

## 6. Como o sync funciona

- Período no fuso da conta, terminando **ontem** (o dia corrente fica de fora para não congelar
  um número parcial das 05:00 até o dia seguinte).
- Execução diária em duas passadas: primeiro reprocessa os últimos `SYNC_WINDOW_DAYS` (30) dias
  de todas as contas ativas; depois, com o que sobrar de `SYNC_DAILY_OPS_BUDGET`, avança a carga
  histórica (até `SYNC_BACKFILL_MONTHS`, 13 meses) mês a mês, começando pelas contas com menos
  histórico. Conta nova mostra os últimos 30 dias no primeiro sync; o histórico completa nos
  dias seguintes. Sem cota, a execução fica "adiada" e continua no próximo sync.
- Cada bloco é gravado numa transação: upsert de tudo que a API devolveu e remoção, dentro do
  bloco, das linhas que não vieram mais (a API omite linhas sem conversão; sem isso uma conversão
  retirada pelo Google continuaria contando).
- Ações de conversão são identificadas pelo ID, não pelo nome: renomear a ação no Google Ads não
  duplica conversões.
- Advisory lock por conta impede duas sincronizações simultâneas da mesma conta.
- Retry com backoff exponencial + jitter para cota (respeita o `retryDelay` da API), 5xx e rede.
- Cada execução fica em `sync_runs`; erro em uma conta não interrompe as demais.
- A lista da MCC considera só as contas ligadas direto à MCC raiz (`level <= 1`). Contas dentro
  de sub-MCCs, como "Clientes - Dúit Marketing", ficam de fora de propósito, assim como contas
  manager e canceladas/encerradas. Contas que saem da lista ficam marcadas como "Fora da MCC".

## 7. Segurança

- Somente leitura na Google Ads API: o client só expõe `searchStream` e recusa qualquer
  consulta que não seja `SELECT`.
- Senhas com bcrypt, sessão em JWT num cookie `httpOnly`, `Secure` e `SameSite=Strict`.
  Trocar a senha, mudar o papel ou desativar um usuário derruba as sessões dele na hora.
- Rate limit no login (5 tentativas por e-mail+IP e 30 por IP a cada 15 min).
- Toda rota com `:accountId` valida no backend se o usuário tem vínculo com a conta; sem acesso
  a resposta é 404, igual a conta inexistente.
- Cabeçalhos de segurança no Caddy (CSP, HSTS, X-Frame-Options) e Helmet na API.
