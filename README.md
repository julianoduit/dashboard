# Dashboard Google Ads | Dúit Marketing

Dashboard onde cada cliente acompanha a própria conta Google Ads. Os dados vêm do Postgres,
alimentado por um job diário que lê a Google Ads API (REST, somente leitura) via MCC.

> README completo (deploy na VPS, geração do refresh token) entra na Fase 5.

## Setup local (Fase 1)

Requisitos: Node 22.9+, Docker.

```bash
cp .env.example .env          # preencha as variáveis GOOGLE_ADS_*
docker compose up -d          # Postgres (cria também o banco de teste)
cd backend
npm install
npm run migrate:up
npm test                      # testes unitários + integração (usa TEST_DATABASE_URL)
```

## Comandos de sincronização

```bash
npm run mcc:list                                  # lista as contas da MCC e grava em ad_accounts
npm run sync -- --customer-id=1234567890          # ativa a conta e sincroniza (1ª vez: backfill de 13 meses)
npm run sync -- --all                             # sincroniza todas as contas ativas
npm run report -- --customer-id=1234567890 --inicio=2026-09-01 --fim=2026-09-30
npm run gaql -- --customer-id=1234567890 "SELECT customer.id FROM customer"   # consulta avulsa (só SELECT)
```

O `report` imprime totais da conta, por campanha e por ação de conversão, no mesmo recorte do
painel do Google Ads (Impr., Cliques, Custo, Conversões, Valor conv.), para conferência.

## Rodando o sistema (backend + frontend)

```bash
# 1. Crie o primeiro admin (a senha é pedida no terminal)
cd backend
npm run seed:admin -- --email=voce@duit.com.br --nome="Seu Nome"

# 2. Suba a API (porta 3000). SYNC_SCHEDULER_ENABLED=false no .env evita o sync automático em dev.
npm run dev

# 3. Em outro terminal, suba o frontend (porta 5173, com proxy de /api para a 3000)
cd frontend
npm install
npm run dev
```

Abra http://localhost:5173 e entre com o admin. Até a tela de admin (Fase 4) ficar pronta, um
usuário cliente pode ser criado pela API, logado como admin:

```bash
curl -c /tmp/admin.jar -H 'content-type: application/json' \
  -d '{"email":"voce@duit.com.br","senha":"SUA_SENHA"}' http://localhost:3000/api/auth/login
curl -b /tmp/admin.jar -H 'content-type: application/json' \
  -d '{"nome":"Cliente","email":"cliente@empresa.com","senha":"senha-do-cliente","accountIds":[ID_DA_CONTA]}' \
  http://localhost:3000/api/admin/users
```

`ID_DA_CONTA` é o `id` interno da tabela `ad_accounts` (não o customer ID do Google).

## Testes

```bash
cd backend && npm test     # unitários + integração (acesso entre clientes, auth, sync, métricas)
cd frontend && npm test    # formatação pt-BR e presets de período
```

## Como o sync funciona

- Período no fuso da conta, terminando **ontem** (o dia corrente fica de fora para não congelar
  um número parcial das 05:00 até o dia seguinte).
- Execução diária: reprocessa os últimos `SYNC_WINDOW_DAYS` (30) dias. Primeira execução de uma
  conta: backfill de `SYNC_BACKFILL_MONTHS` (13) meses, em blocos mensais.
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
  manager e canceladas/encerradas.
