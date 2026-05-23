# Stock Signals 📈

Análise técnica gratuita para ações da B3, BDRs, ETFs, criptomoedas e câmbio. Sinais automáticos (Golden/Death Cross, MACD, RSI) e framework educacional embutido.

> Demo: deploy via Vercel — abra `/PETR4`, `/AAPL`, `/BTC-USD`, `/USDBRL=X`, etc.

## Funcionalidades

- **Sinais do dia** (`/sinais`) — screener com Golden/Death Cross, momentum MACD, sobrevenda/sobrecompra do RSI nos últimos pregões.
- **Análise por ativo** com gráfico interativo (Chart.js), médias móveis 50/200, RSI e MACD (linha, linha de sinal, histograma).
- **Veredicto amigável** — combina os 4 indicadores em uma frase ("Sinais alinhados para alta", "Mercado indefinido", etc.).
- **Backtest** — para cada sinal histórico, mostra retorno médio nos 30/60/90 pregões seguintes + taxa de acerto.
- **Alertas por e-mail** (`/alertas`) — receba aviso quando sinais aparecem nos seus ativos.
- **Deep links** — `/PETR4?period=6M&date=2024-06-15&highlight=golden` abre direto no ponto.
- **Compartilhamento** com Open Graph dinâmico por ativo + Web Share API no mobile.
- **Cobertura ampla**: ações da B3, BDRs, ações americanas, ETFs, criptomoedas (`BTC-USD`), câmbio (`USDBRL=X`) e índices (`^BVSP`).
- **Busca por nome** com autocomplete (atalho `/` em qualquer página).
- **Favoritos** persistidos no navegador com mini-sparkline.
- **PWA + dark mode** — adicione à tela inicial; tema automático ou manual.
- **Mobile native-app feel** — bottom tab navigation, top app bar com blur, transições suaves, gestures.

## Stack

- **Backend**: Node.js 18+, Express, [Brapi](https://brapi.dev) (B3) + [yahoo-finance2](https://github.com/gadicc/node-yahoo-finance2) (US/cripto/FX) com fallback automático, [technicalindicators](https://github.com/anandanand84/technicalindicators), [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit).
- **Frontend**: HTML estático + Chart.js 4.
- **Testes**: [Vitest](https://vitest.dev/).
- **Deploy**: Vercel.

## Rodando localmente

```bash
git clone https://github.com/chicomcastro/stock-signals.git
cd stock-signals
npm install
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

## Scripts

| Script                    | Descrição                                            |
| ------------------------- | ---------------------------------------------------- |
| `npm start`               | Sobe o servidor de produção                          |
| `npm run dev`             | Servidor com auto-reload                             |
| `npm test`                | Executa testes unitários + integração (Vitest)       |
| `npm run test:watch`      | Testes em modo watch                                 |
| `npm run test:coverage`   | Cobertura via v8 (threshold ≥90%)                    |
| `npm run test:e2e`        | E2E com Playwright (desktop + mobile) + screenshots  |
| `npm run test:e2e:install`| Baixa o Chromium para Playwright                     |
| `npm run test:all`        | Roda cobertura + e2e                                 |
| `npm run fixture:generate`| Regenera a fixture sintética usada em testes         |

### Estratégia de testes

- **Unit** (`src/*.test.mjs`): funções puras — indicadores, ticker, cache, OG.
- **Integração** (`test/integration/*.test.mjs`): server + dataProvider via Supertest. Cobre rotas, hardening, contratos JSON, modo `MOCK_YAHOO=1` (fixture).
- **E2E** (`test/e2e/*.spec.js`): Playwright contra o servidor em `MOCK_YAHOO=1`. Smoke das jornadas principais + screenshots desktop e mobile.

Para os testes E2E não dependerem de rede externa, o servidor pode ser executado com `MOCK_YAHOO=1`, que usa a fixture determinística em `test/fixtures/historical.json`.

### CI

O workflow `.github/workflows/ci.yml` roda em cada PR e push para `main`:

1. **Job `unit`**: instala dependências, roda `vitest --coverage`, faz upload do `coverage/` como artifact e posta um comentário com a tabela de cobertura no PR.
2. **Job `e2e`**: instala browsers do Playwright, roda os specs com `MOCK_YAHOO=1`, faz upload do `playwright-report/`, sobe screenshots para a branch `ci-previews/pr-<N>/<sha>/` e posta um comentário com as imagens inline.

## Variáveis de ambiente

| Variável                       | Default                  | Descrição                                                                  |
| ------------------------------ | ------------------------ | -------------------------------------------------------------------------- |
| `PORT`                         | `3000`                   | Porta do servidor local.                                                   |
| `PUBLIC_BASE_URL`              | inferido                 | URL pública usada para canonical, OG e sitemap.                            |
| `BRAPI_TOKEN`                  | (opcional, recomendado)  | Token gratuito do [brapi.dev/dashboard](https://brapi.dev/dashboard). Sem ele, a quota anônima é compartilhada pelo IP da Vercel e acaba rápido. Com ele, free tier dá ~15k req/mês — suficiente. |
| `BRAPI_BASE`                   | `https://brapi.dev/api`  | URL base do Brapi (sobreescrita útil em testes).                           |
| `PREFER_BRAPI`                 | `1`                      | `0` desativa o Brapi como provider primário para B3.                       |
| `UPSTASH_REDIS_REST_URL`       | (opcional)               | URL REST do Upstash Redis para **cache persistente entre cold starts**. Sem isso, cada novo lambda perde o cache em memória. Free tier 10k req/dia. |
| `UPSTASH_REDIS_REST_TOKEN`     | (opcional)               | Token correspondente.                                                      |
| `MOCK_YAHOO`                   | (vazio)                  | `1` usa fixture determinística — sem chamadas externas. Para CI/E2E.       |
| `SIGNALS_CONCURRENCY`          | `3`                      | Paralelismo do fallback non-batch para `/api/signals`.                     |
| `RATE_LIMIT_MAX`               | `60` / `10000` (test)    | Limite por IP/minuto nas rotas de API.                                     |

### Setup recomendado para produção (Vercel)

Para eliminar o "Limite de requisições" em produção:

1. **Brapi token** (1 min, grátis): registre em [brapi.dev/dashboard](https://brapi.dev/dashboard) → copie o token → adicione como env var `BRAPI_TOKEN` no Vercel.
2. **Upstash Redis** (2 min, grátis): crie um banco em [upstash.com](https://upstash.com) → copie `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` → adicione no Vercel.

Com os 2 configurados, mesmo em cold start o app serve dados do cache persistente — a cota do Brapi/Yahoo é tocada no máximo 1x por ticker por dia.

## Como funciona o framework

1. **Tendência** — preço vs MA200 + cruzamentos MA50/MA200.
2. **Força relativa** — RSI(14) em zonas de sobrecompra (>70) ou sobrevenda (<30).
3. **Momentum** — MACD line cruzando a linha de sinal (não a linha zero).
4. **Combinação** — sinais alinhados reduzem falsos positivos.

Veja o framework completo na página inicial.

## Arquitetura

```
src/
├── index.js          Entrypoint Express (boot local + handler Vercel)
├── server.js         Configuração da app: rotas, middlewares, hardening
├── dataProvider.js   Yahoo Finance + cache + montagem do payload
├── indicators.js     SMA, RSI, MACD, detecção de cruzamentos, análises puras
├── cache.js          Cache em memória com TTL dependente do horário do pregão
├── ticker.js         Normalização de tickers (B3, US, cripto, FX, índices)
├── og.js             Imagem SVG dinâmica para Open Graph
└── *.test.mjs        Testes unitários
public/
├── index.html        Landing + busca + categorias + framework
├── chart.html        Página do ativo (template, var {{ticker}})
├── favorites.html    Watchlist em LocalStorage
├── css/base.css      Tokens + utilitários
└── favicon.svg, manifest.webmanifest
```

## Endpoints

| Endpoint                                     | Descrição                                                             |
| -------------------------------------------- | --------------------------------------------------------------------- |
| `GET /`                                      | Landing                                                               |
| `GET /sinais`                                | Sinais do dia (screener)                                              |
| `GET /alertas`                               | Cadastro de alertas por e-mail                                        |
| `GET /favorites`                             | Watchlist com mini-sparkline                                          |
| `GET /:ticker`                               | Página de análise (`/PETR4`, `/AAPL`, `/BTC-USD?period=6M&date=...`)  |
| `GET /data/:ticker`                          | JSON com preços, indicadores e análise diária                         |
| `GET /api/backtest/:ticker`                  | Estatísticas históricas dos sinais (30/60/90 pregões)                 |
| `GET /api/signals[?universe=PETR4,AAPL]`     | Sinais agregados em todo o universo nos últimos pregões               |
| `GET /api/search?q=`                         | Busca por nome/símbolo                                                |
| `GET /api/quote/:ticker`                     | Cotação resumida                                                      |
| `POST /api/alerts/subscribe`                 | Inscrever e-mail + tickers para receber alertas                       |
| `GET /api/alerts/confirm/:token`             | Confirmar inscrição (double opt-in)                                   |
| `GET /api/alerts/unsubscribe/:token`         | Cancelar inscrição                                                    |
| `GET /og/:ticker.svg`                        | Imagem SVG para Open Graph                                            |
| `GET /sitemap.xml`, `GET /robots.txt`        | SEO                                                                   |

## Roadmap

Veja [`docs/ANALISE_E_BACKLOG.md`](docs/ANALISE_E_BACKLOG.md) — diagnóstico e backlog priorizado de produto, engenharia e marketing.

## Disclaimer ⚠️

Esta aplicação é apenas para fins educacionais e **não constitui recomendação de investimento**. Sempre faça sua própria análise e consulte um profissional financeiro antes de investir.

## Licença

[MIT](LICENSE)
