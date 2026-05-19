# Stock Signals 📈

Análise técnica gratuita para ações da B3, BDRs, ETFs, criptomoedas e câmbio. Sinais automáticos (Golden/Death Cross, MACD, RSI) e framework educacional embutido.

> Demo: deploy via Vercel — abra `/PETR4`, `/AAPL`, `/BTC-USD`, `/USDBRL=X`, etc.

## Funcionalidades

- **Visualização de preço** com Chart.js e médias móveis MA50 e MA200.
- **Indicadores técnicos** clássicos: RSI(14) e MACD (linha, linha de sinal e histograma).
- **Sinais automáticos** marcados no gráfico:
  - ⭐ Golden Cross (MA50 cruza acima da MA200) e Death Cross
  - 🔺 MACD bullish/bearish cross (linha do MACD cruza a linha de sinal)
- **Análise diária** com interpretação por indicador — clique em qualquer ponto do gráfico para ver a análise daquele pregão.
- **Cobertura ampla**: ações da B3, BDRs, ações americanas, ETFs, criptomoedas (`BTC-USD`), câmbio (`USDBRL=X`) e índices (`^BVSP`).
- **Busca por nome** com autocomplete (atalho `/` para focar).
- **Favoritos** persistidos no navegador (LocalStorage).
- **Compartilhamento** com Open Graph dinâmico por ativo.
- **PWA leve** — adicione à tela inicial.

## Stack

- **Backend**: Node.js 18+, Express, [yahoo-finance2](https://github.com/gadicc/node-yahoo-finance2), [technicalindicators](https://github.com/anandanand84/technicalindicators), [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit).
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

| Script           | Descrição                       |
| ---------------- | ------------------------------- |
| `npm start`      | Sobe o servidor de produção     |
| `npm run dev`    | Servidor com auto-reload        |
| `npm test`       | Executa testes unitários        |
| `npm run test:watch` | Testes em modo watch        |

## Variáveis de ambiente

| Variável            | Default | Descrição                                              |
| ------------------- | ------- | ------------------------------------------------------ |
| `PORT`              | `3000`  | Porta do servidor local.                               |
| `PUBLIC_BASE_URL`   | inferido | URL pública usada para canonical, OG e sitemap.       |

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

| Endpoint                  | Descrição                                              |
| ------------------------- | ------------------------------------------------------ |
| `GET /`                   | Landing                                                |
| `GET /:ticker`            | Página de análise (ex.: `/PETR4`, `/AAPL`, `/BTC-USD`) |
| `GET /data/:ticker`       | JSON com preços, indicadores e análise                 |
| `GET /api/search?q=`      | Busca por nome/símbolo                                 |
| `GET /api/quote/:ticker`  | Cotação resumida                                       |
| `GET /og/:ticker.svg`     | Imagem SVG para Open Graph                             |
| `GET /sitemap.xml`        | Sitemap                                                |
| `GET /robots.txt`         | Robots                                                 |

## Roadmap

Veja [`docs/ANALISE_E_BACKLOG.md`](docs/ANALISE_E_BACKLOG.md) — diagnóstico e backlog priorizado de produto, engenharia e marketing.

## Disclaimer ⚠️

Esta aplicação é apenas para fins educacionais e **não constitui recomendação de investimento**. Sempre faça sua própria análise e consulte um profissional financeiro antes de investir.

## Licença

[MIT](LICENSE)
