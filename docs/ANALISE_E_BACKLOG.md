# Stock Signals — Análise estratégica e backlog priorizado

> Data: 2026-05-19 · Branch: `claude/repo-analysis-backlog-4wZwR`
> Escopo: produto, engenharia e marketing. Diagnóstico do estado atual + roadmap acionável.

---

## 1. Sumário executivo

Stock Signals é uma aplicação web enxuta (Express + Chart.js, ~310 LOC de backend + 3 HTMLs estáticos) que entrega análise técnica de ativos da B3 com indicadores clássicos (SMA50/200, RSI, MACD) e sinais visuais (Golden/Death Cross, cruzamentos do MACD). O produto tem uma proposta de valor clara, foco geográfico interessante (B3 em PT-BR), e uma camada educacional embutida (o "Framework") que diferencia de concorrentes.

Os principais gaps são:

- **Engenharia**: ausência de testes, lint, CI, cache, observabilidade; cálculo do MACD divergindo do que é rotulado na UI; janela de slicing dos indicadores frágil; suporte de tickers travado em B3 (`.SA` hardcoded).
- **Produto**: a aplicação é reativa (só vê sinal quem entra no site), sem alertas, sem screener de "sinais hoje", sem busca, sem mobile-first, sem conta de usuário (favoritos só em localStorage), sem backtest do próprio framework.
- **Marketing**: SEO praticamente inexistente (sem meta description, OG, sitemap, structured data), sem captação de email, sem analytics, sem conteúdo recorrente, sem branding além do título.

A boa notícia: o produto está em um ponto onde **uma sequência curta de melhorias (P0/P1) destrava crescimento orgânico real** sem precisar reescrever o stack.

---

## 2. Pontos fortes

1. **Proposta de valor focada e legível**. "Sinais técnicos automáticos para B3" é uma frase que vende sozinha; o usuário entende em 5 segundos.
2. **Stack minimalista e barato de operar**. Express + estáticos no Vercel — boot rápido, sem build complexo, sem banco. Ótimo para iterar.
3. **Camada educacional integrada**. O "Framework para identificar pontos de entrada e saída" no `index.html` e no `chart.html` (sticky lateral) é um diferencial real frente a screeners genéricos — ensina enquanto mostra.
4. **Backend bem fatiado para o tamanho**. As funções `analyzePrice`, `analyzeRSI`, `analyzeMACD`, `analyzeCross`, `analyzeIndicators` são puras e isoláveis — quase prontas para testes unitários (`src/index.js:100-194`).
5. **UX consciente em pequenos detalhes**: link direto para o TradingView (`chart.html:309`), botão de favorito persistente, gráfico clicável que recalcula a análise daquele dia, alternância grid/lista nos favoritos.
6. **Sinais visuais bem desenhados**: estrelas de Golden/Death Cross e triângulos de MACD em cores convencionais (`chart.html:593-657`) — leitura imediata.
7. **Cobertura de universo brasileiro**: o `index.html` já organiza bancos, commodities, varejo, tech, BDRs e ETFs — ótimo onboarding para o público-alvo.
8. **Pré-cálculo correto da janela "extra"** para os indicadores: o backend busca histórico estendido (`getDateRange(period, true)`) para que SMA200/MACD/RSI tenham dados de "warm-up" antes da janela visível (`src/index.js:41-46`).
9. **Disclaimer presente** no README — postura responsável sobre não ser recomendação de investimento.

---

## 3. Pontos fracos / riscos

### 3.1 Engenharia

1. **Bug semântico no MACD**. `analyzeMACD` e `findMacdCrossPoints` usam **cruzamento da linha do MACD com zero**, mas a UI e o framework prometem **"MACD cruza acima da linha de sinal"**. Não é a mesma coisa. Zero crossing e signal crossing geram sinais diferentes (signal crossing antecede, zero é mais conservador). Também: o backend descarta `MACD.signal` e `MACD.histogram` retornados por `technicalindicators` (`src/index.js:259`), então não há como mostrar o histograma que o próprio framework documenta. (`src/index.js:78-98`, `src/index.js:129-146`, `index.html:222-232`)
2. **Slicing dos indicadores frágil**. O cálculo `allSma50Values.slice(offset - 49)` etc. (`src/index.js:240-243`) só funciona se `offset >= 49/199/14/25`. Para períodos muito curtos com dados extras suficientes, ok; mas para `ALL` com ativos novos (IPO recente) ou tickers com poucos dados, o offset fica negativo e o slice retorna pedaços errados sem error. **Sem nenhum teste para proteger isso.**
3. **`.SA` hardcoded** em `src/index.js:291` (`${ticker}.SA`). Bloqueia análise de:
   - Ações americanas (`AAPL`, `MSFT`)
   - Cripto (`BTC-USD`)
   - FX (`USDBRL=X`)
   - Tickers já com sufixo (alguém digita `PETR4.SA` vira `PETR4.SA.SA`).
4. **Sem cache**. Cada request bate na Yahoo Finance. Sob carga moderada (compartilhamento viral, bot, screener futuro) você toma rate limit e cai. Yahoo não tem SLA público.
5. **Catch-all `/:ticker`** trata `favicon.ico` manualmente mas qualquer outro arquivo estático ausente vira "ticker", chama Yahoo e devolve 500. (`src/index.js:271-285`)
6. **Sem testes, sem lint, sem CI**. Refatorar é caro sem rede.
7. **Sem rate limiting nem CORS configurado**. Endpoint `/data/:ticker` é proxy aberto da Yahoo Finance — pode ser abusado (scraping de terceiros usando seu Vercel).
8. **Sem observabilidade**. Sem logging estruturado, sem métricas, sem error tracking (Sentry). Você só descobre que quebrou se você mesmo notar.
9. **Duplicação de CSS e markup** entre `index.html`, `chart.html`, `favorites.html`. O bloco do "Framework" está duplicado em dois lugares (~140 linhas cada). Mudar um texto exige editar dois arquivos.
10. **`package.json` inconsistente**: `"author": ""`, `"license": "ISC"` mas o `LICENSE` é MIT, `"description": ""`, sem `engines`, sem `repository`.
11. **README com placeholder** `git clone https://github.com/seu-usuario/...` — sinaliza falta de cuidado.
12. **`fetchHistoricalData` sempre busca o dataset estendido**, mesmo quando o período pedido (`ALL` ou `5Y`) já cobre a janela necessária. Latência desnecessária.
13. **Risco de XSS leve**: o `ticker` da URL é injetado em `chart.html` via `template.replace(/{{ticker}}/g, ticker.toUpperCase())` (`src/index.js:282`). `ticker` vem direto da URL sem sanitização. Como `toUpperCase()` não bloqueia `<` ou aspas, alguém com `/<script>alert(1)</script>` consegue refletir HTML no template. Baixo risco real (precisaria de phishing de URL), mas é uma vulnerabilidade XSS reflected clássica.
14. **`license` no `package.json` é ISC mas o arquivo é MIT** — divergência legal.
15. **Sem variáveis de ambiente** (porta, NODE_ENV, base URL). `app.listen(3000)` hardcoded.

### 3.2 Produto

1. **Sem alertas / notificações**. O usuário só vê o sinal se entrar no site naquele dia. O produto é literalmente "vou ter que checar manualmente" — não vence o WhatsApp do amigo trader.
2. **Sem screener "sinais de hoje"**. Não existe a página que justifica a marca: "ações que deram Golden Cross hoje", "RSI < 30 na B3 agora". Esse é o killer feature e ele falta.
3. **Sem busca**. Usuário precisa saber o ticker e digitar na URL ou clicar em uma lista fixa de ~30 ativos. Quem digita "Petrobras" não chega em `/PETR4`.
4. **Favoritos só em localStorage**. Troquei de celular → perdi minha watchlist. Sem conta, sem login, sem sync.
5. **Sem mobile-first**. `max-width: 1200/1600px` com grids fixos, framework lateral sticky — quebra em telas pequenas. Trader checa cotação no celular.
6. **Sem dark mode**. Convenção quase universal em ferramentas financeiras.
7. **Sem backtest do framework**. O produto educa o usuário no framework mas nunca prova que ele funciona. Faltam métricas: "Golden Cross em PETR4 nos últimos 10 anos gerou X% de retorno em N dias".
8. **Sem volume**, sem candlestick, sem suporte/resistência, sem padrões.
9. **Sem comparação entre ativos** (PETR4 vs VALE3 vs IBOV).
10. **Sem FIIs, criptomoedas, FX** — público brasileiro consome muito FII.
11. **Sem onboarding guiado**. Usuário novo cai no `index.html`, vê uma parede de texto do framework. Falta um "tour" ou um exemplo interativo.
12. **Sem histórico do que aconteceu depois do sinal**. Clico no Golden Cross de PETR4 em 2023 — quanto ela subiu/caiu nos 30/60/90 dias seguintes? Esse é o argumento de credibilidade.
13. **Sem compartilhamento social**. Não dá pra mandar `/PETR4?date=2025-03-12&signal=golden` para um amigo abrir já no ponto.
14. **Sem versionamento de "carteira recomendada"** — ex.: ranking semanal de ativos com sinais mais fortes.

### 3.3 Marketing

1. **SEO inexistente**: title estático "Análise de Ações" / "Gráfico de Indicadores - {{ticker}}", sem meta description, sem Open Graph, sem Twitter Card, sem `<link rel="canonical">`, sem `sitemap.xml`, sem `robots.txt`, sem structured data (`SoftwareApplication`, `FinancialProduct`, `BreadcrumbList`).
2. **Sem analytics**. Você não sabe quantos acessos tem por ticker, qual período é mais usado, qual setor converte em favoritar. Decisões são chute.
3. **Sem captação de email / lead**. Nem newsletter, nem alerta, nem "avise-me quando der Golden Cross". Você está deixando todo o tráfego ir embora sem fricção.
4. **Sem conteúdo recorrente**. Sem blog, sem post, sem "report semanal dos sinais da B3". Sem isso, não há SEO de cauda longa, não há social.
5. **Sem branding visual**. Sem logo, sem favicon, sem paleta consistente entre páginas, sem ilustração. Visual genérico = baixa memorabilidade.
6. **Sem prova social** ("usado por X traders", testemunhos, depoimentos, prints da comunidade).
7. **Sem monetização ou pelo menos hipótese de monetização**: links de afiliado de corretoras (XP, Rico, Clear, Avenue), tier premium (alertas push, mais indicadores, screener avançado), curso, comunidade paga.
8. **Sem presença social**. Sem Twitter/X, Instagram, YouTube, Telegram, Discord. Mercado financeiro brasileiro mora no Telegram e no YouTube.
9. **Sem release notes / changelog** público — usuário não percebe que o produto evolui.

---

## 4. Backlog priorizado

> Convenção: **P0** = bloqueia confiança/credibilidade ou destrava crescimento; **P1** = alavanca alto, dentro de 4-8 semanas; **P2** = construção de plataforma (2-3 meses); **P3** = visão / monetização (3+ meses).
> Cada item tem: **Por quê** · **Contexto** · **Como** · **Critérios de aceite** · **Esforço (P/M/G)**.

### P0 — Correções críticas e quick wins (1-2 semanas)

#### P0.1 — Corrigir semântica do MACD (line × signal × zero × histogram)
- **Por quê**: Hoje o produto promete "MACD cruzando a linha de sinal" mas implementa "MACD cruzando zero". Um trader experiente percebe e perde a confiança no resto da ferramenta. Crédito é tudo num produto financeiro.
- **Contexto**: `src/index.js:78-98` (`findMacdCrossPoints`) e `src/index.js:129-146` (`analyzeMACD`) usam apenas `m.MACD` e comparam com zero. A lib `technicalindicators` já retorna `{ MACD, signal, histogram }` no array — basta usar.
- **Como**:
  - No backend, expor `macdLine`, `macdSignal`, `macdHistogram` no `responseData`.
  - Reimplementar `findMacdCrossPoints` para detectar `macdLine cross signal` (e renomear o tipo para `bullish_cross`/`bearish_cross`). Manter o zero-cross como um sinal adicional, opcional, distinto.
  - Em `analyzeMACD`, comparar `currentMACD - currentSignal` versus `prevMACD - prevSignal` para detectar troca de sinal.
  - No frontend, plotar histograma como barras no eixo MACD, e linha de signal como linha tracejada.
- **Critérios de aceite**:
  - [ ] Em `/data/:ticker`, o JSON contém `macdLine[]`, `macdSignal[]`, `macdHistogram[]`, e `macdCrossPoints[]` com tipos `bullish_cross`/`bearish_cross` (line cruza signal).
  - [ ] Para um caso de teste conhecido (ex.: VALE3, 1Y, data fixa), os pontos de cruzamento batem com o TradingView dentro de ±1 pregão.
  - [ ] No `chart.html`, ao ativar "Mostrar MACD", aparece a linha MACD, a linha signal e o histograma.
  - [ ] Texto da UI passa a dizer "MACD cruza a linha de sinal" coerentemente.
- **Esforço**: P (≈4-6h).

#### P0.2 — Destravar tickers fora da B3 (`.SA` opcional)
- **Por quê**: O produto atende 100% só B3. Adicionar US/cripto/FX expande TAM sem custo de infra. E corrige bugs latentes (alguém colando `PETR4.SA` vira `PETR4.SA.SA`).
- **Contexto**: `src/index.js:291`: `` `${ticker}.SA` ``. Yahoo Finance aceita tickers com sufixo explícito (`PETR4.SA`, `AAPL`, `BTC-USD`, `USDBRL=X`).
- **Como**:
  - Função `normalizeTicker(input)`:
    - Se contém `.`, `-` ou `=` → usa como está.
    - Se é 5-6 chars alfanuméricos típicos B3 (ex.: `PETR4`, `BBAS3`, `HGLG11`) → adiciona `.SA`.
    - Caso contrário → tenta como está e, em falha, tenta com `.SA` como fallback.
  - Tela inicial passa a ter abas/separadores: "B3", "US", "Cripto", "FX".
- **Critérios de aceite**:
  - [ ] `/AAPL`, `/BTC-USD`, `/USDBRL=X`, `/PETR4`, `/PETR4.SA` todos funcionam.
  - [ ] Página inicial lista pelo menos 5 tickers de cada categoria.
  - [ ] Erro "Ativo não encontrado" é mostrado de forma amigável (sem stack trace).
- **Esforço**: P (≈3-4h).

#### P0.3 — Cache de Yahoo Finance (memória + KV opcional)
- **Por quê**: Reduz latência (de ~800ms para <50ms em hit), corta o risco de rate limit, deixa o produto sobreviver a um pico de tráfego (e a um eventual screener).
- **Contexto**: Dados históricos diários só mudam 1×/dia (após o fechamento). Cache de 5-15 min em horário de pregão e 6h fora dele é suficiente.
- **Como**:
  - Camada `cache.js` com TTL por chave `ticker|period`.
  - Em-memória com `Map` (suficiente para Vercel funções com warm starts) + opcional Vercel KV / Upstash Redis para multi-instância.
  - Header `Cache-Control: public, max-age=300, s-maxage=300` na resposta `/data/:ticker`.
- **Critérios de aceite**:
  - [ ] Segunda chamada idêntica em <60s retorna em <50ms (medido).
  - [ ] Logs mostram hit/miss.
  - [ ] Invalida no fechamento de pregão (cron simples Vercel: `0 22 * * 1-5` BRT).
- **Esforço**: P (≈4h em-memória; M se KV).

#### P0.4 — Endurecimento básico: sanitização, rate limit, 404 estático
- **Por quê**: Tira o XSS reflected, evita o proxy aberto da Yahoo, e impede que arquivos estáticos inexistentes virem chamadas à Yahoo (500).
- **Contexto**: `src/index.js:271-285`, `src/index.js:287-296`.
- **Como**:
  - Validar `ticker` com regex `^[A-Z0-9.\-=]{1,15}$` antes de qualquer uso; rejeitar caso contrário com 400.
  - `express-rate-limit` em `/data/:ticker`: 60 req/min por IP.
  - Escapar `{{ticker}}` no template (já fica garantido pela regex).
  - Servir favicon real (P0.6) e devolver 404 explícito para `*.ico|*.png|*.js|*.css|*.map|*.txt|*.xml|*.json` no catch-all antes de chamar Yahoo.
- **Critérios de aceite**:
  - [ ] `/<script>` retorna 400, não reflete no HTML.
  - [ ] 61 req/min do mesmo IP no `/data/:ticker` recebem 429.
  - [ ] `/robots.txt` ausente devolve 404 sem chamar Yahoo (visto em logs).
- **Esforço**: P (≈3h).

#### P0.5 — SEO básico + favicon + Open Graph
- **Por quê**: A maior alavanca de marketing barata. Hoje o produto literalmente perde tráfego do Google porque o `<title>` não tem o nome do ativo bem formatado, não há meta description, e compartilhar `/PETR4` no WhatsApp não mostra preview.
- **Contexto**: `chart.html` tem `<title>Gráfico de Indicadores - {{ticker}}</title>` e nada mais. `index.html` tem `<title>Análise de Ações</title>`.
- **Como**:
  - Adicionar em todos os templates: `<meta name="description">`, `<meta property="og:title|og:description|og:image|og:url|og:type>`, `<meta name="twitter:card" content="summary_large_image">`.
  - Gerar OG image dinâmica via `/og/:ticker.png` (Vercel OG, `@vercel/og` ou um SVG simples): mostra ticker + último preço + setinha verde/vermelha do dia.
  - `sitemap.xml` listando os ~30 tickers do `index.html`. `robots.txt` permitindo tudo.
  - `favicon.ico` + `apple-touch-icon.png`.
  - Structured data JSON-LD (`SoftwareApplication`) no `index.html`.
  - Title da página de ativo: `PETR4 — Análise técnica (RSI, MACD, Golden Cross) · Stock Signals`.
- **Critérios de aceite**:
  - [ ] Compartilhar `/PETR4` no WhatsApp mostra preview com OG image.
  - [ ] Lighthouse SEO ≥ 95 em `/` e `/PETR4`.
  - [ ] Google Search Console aceita o sitemap sem erro.
- **Esforço**: M (≈1-2 dias).

#### P0.6 — Limpar README, package.json e licença
- **Por quê**: Sinal de cuidado básico. Reduz fricção pra contribuidores e parece menos abandonado.
- **Contexto**: `README.md:51` ainda tem `seu-usuario`. `package.json` com `author: ""`, license divergente (ISC vs LICENSE MIT), sem repo, sem description.
- **Como**:
  - Atualizar URL do repo, author, license = MIT, description, keywords, engines.
  - Adicionar screenshot/GIF do produto.
  - Seção "Stack" e "Status do projeto" (badge de deploy Vercel, license).
- **Critérios de aceite**:
  - [ ] README tem GIF/screenshot acima do fold.
  - [ ] `package.json` consistente com `LICENSE`.
- **Esforço**: P (≈1h).

#### P0.7 — Analytics + Sentry
- **Por quê**: Você está dirigindo no escuro. Sem analytics não há nenhum P1/P2 priorizável com dado.
- **Contexto**: Sem nada hoje.
- **Como**:
  - Plausible ou Umami (cookie-free, LGPD-friendly) no `<head>` de todas as páginas.
  - Eventos custom: `ticker_view`, `period_change`, `favorite_add`, `tradingview_click`, `signal_visible`.
  - Sentry (free tier) no backend e no frontend para JS errors.
- **Critérios de aceite**:
  - [ ] Dashboard Plausible mostra pageviews por ticker.
  - [ ] Sentry recebe um erro de teste forçado.
- **Esforço**: P (≈2h).

---

### P1 — Alavancas de crescimento (3-6 semanas)

#### P1.1 — Página "Sinais de Hoje" (screener diário)
- **Por quê**: É o killer feature. "Quais ações da B3 deram Golden Cross hoje?" é exatamente o que a marca promete e hoje não entrega. Vira página de entrada com SEO de cauda longa ("golden cross hoje b3").
- **Contexto**: Backend já calcula `crossPoints` por ticker — só precisa varrer uma lista de tickers e agregar.
- **Como**:
  - Cron diário pós-pregão (Vercel Cron) varre ~100-200 tickers líquidos da B3 + top 50 US + top 10 cripto.
  - Persistir resultado em arquivo JSON estático (S3, Vercel Blob, ou commit no repo) ou tabela Postgres (Supabase).
  - Rota `/sinais-hoje` mostra: data, lista de Golden Cross, Death Cross, RSI<30, RSI>70, MACD bullish/bearish cross.
  - Cada item linka para `/:ticker?date=...`.
- **Critérios de aceite**:
  - [ ] Em `/sinais-hoje`, vejo pelo menos 4 buckets (Golden, Death, RSI sobrev/sobrec, MACD cross).
  - [ ] Cron roda diariamente e atualiza às 19h BRT.
  - [ ] Histórico de últimos 30 dias acessível (`/sinais-hoje/2026-05-15`).
- **Esforço**: M (≈3-5 dias).

#### P1.2 — Busca/autocomplete de tickers
- **Por quê**: 80% do funil de entrada hoje exige adivinhar o ticker. Busca por nome ("petrobras") é higiene mínima.
- **Contexto**: Yahoo Finance tem endpoint de search (`yahooFinance.search(query)`).
- **Como**:
  - Componente `<SearchBar>` no topo de todas as páginas, com debounce 200ms.
  - Endpoint `/search?q=` proxy de `yahooFinance.search`, com cache 24h.
  - Atalho `/` para focar a barra.
- **Critérios de aceite**:
  - [ ] "petrobras" sugere PETR4, PETR3.
  - [ ] "apple" sugere AAPL, AAPL34.
  - [ ] Enter direciona para `/{symbol}`.
- **Esforço**: P-M (≈1 dia).

#### P1.3 — Alertas por email (captura de email + Golden/Death/MACD/RSI)
- **Por quê**: Resolve o problema de "produto reativo". Captura email = newsletter futura = base de marketing. Aumenta retenção drasticamente.
- **Contexto**: Já existe lista de favoritos no localStorage; só falta backend leve para persistir e disparar.
- **Como**:
  - Tabela `subscribers (email, tickers[], signal_types[], confirmed_at)` no Supabase/Neon.
  - Confirmação double opt-in (token assinado).
  - Cron pós-pregão: para cada subscriber, varre tickers, se houver novo sinal hoje → envia email via Resend ou Postmark (free tier).
  - Template HTML simples: "Golden Cross detectado em PETR4 hoje. [Ver gráfico]".
  - Página `/alertas` para gerenciar.
- **Critérios de aceite**:
  - [ ] Cadastro e confirmação funcionam.
  - [ ] Email é enviado em até 2h após o pregão.
  - [ ] Link de unsubscribe funciona com 1 clique.
  - [ ] LGPD: política de privacidade publicada, dado mínimo coletado.
- **Esforço**: M (≈1 semana).

#### P1.4 — Mobile-first + dark mode + PWA
- **Por quê**: Trader vê cotação no celular. Dark mode é convenção. PWA permite ícone na home screen e push (P2).
- **Contexto**: CSS atual `max-width: 1200/1600px` com grids fixos quebra em mobile; framework sticky lateral some.
- **Como**:
  - Refatorar CSS em variáveis (`--bg`, `--fg`, `--accent`) e `prefers-color-scheme`.
  - Layout em colunas no desktop, stacked no mobile; framework vira accordion no mobile.
  - `manifest.webmanifest`, service worker básico (cache do app shell + dados do dia).
  - Toggle manual dark/light persistido no localStorage.
- **Critérios de aceite**:
  - [ ] Lighthouse Mobile ≥ 90 em performance, ≥ 95 em a11y.
  - [ ] "Adicionar à tela inicial" funciona no Chrome Android.
  - [ ] Dark mode segue OS por padrão + toggle manual.
- **Esforço**: M (≈4-6 dias).

#### P1.5 — Backtest mínimo do framework
- **Por quê**: Credibilidade. "Golden Cross em PETR4 nos últimos 10 anos: retorno médio 30/60/90d depois do sinal: X% / Y% / Z%". Argumento de venda imbatível e barato de implementar.
- **Contexto**: Já temos `crossPoints` e `closePrices` históricos. Falta uma função que, para cada cruzamento, calcule retorno futuro em N pregões.
- **Como**:
  - `backtest(ticker, signalType, horizonDays[])` → `{ avgReturn, hitRate, median, n }`.
  - Mostrar no painel da página do ativo: "Histórico do sinal Golden Cross em PETR4: 12 ocorrências, retorno médio 60d = +4.2%, taxa de acerto = 67%".
  - Disclaimer reforçado: "performance passada não garante futura".
- **Critérios de aceite**:
  - [ ] Cada tipo de sinal exibe estatística histórica (n, média, mediana, hit rate).
  - [ ] Cálculo testado contra planilha de referência (ao menos 3 casos).
- **Esforço**: M (≈3 dias).

#### P1.6 — Lint, testes, CI
- **Por quê**: Sem isso, todo o resto do roadmap fica frágil. P0.1 e P1.5 exigem testes para serem confiáveis.
- **Como**:
  - ESLint + Prettier (config simples).
  - Vitest com testes unitários para `analyze*`, `findCrossPoints`, `findMacdCrossPoints`, `normalizeTicker`, slicing dos indicadores.
  - GitHub Actions: lint + test + deploy preview no Vercel em PRs.
  - Fixtures: 2-3 séries históricas salvas como JSON para testes determinísticos.
- **Critérios de aceite**:
  - [ ] `npm test` passa com ≥ 70% coverage em `src/`.
  - [ ] PR sem lint/test verde não pode ser mergeado (branch protection).
- **Esforço**: M (≈3 dias).

#### P1.7 — Compartilhamento via deep link
- **Por quê**: Viralidade. "Olha o Golden Cross da PETR4 esta semana → [link]". Cresce sozinho.
- **Como**:
  - `/:ticker?date=2026-05-12&period=6M&highlight=golden` abre o gráfico já no ponto com tooltip aberto.
  - Botão "Copiar link" e "Compartilhar no WhatsApp/Twitter".
- **Critérios de aceite**:
  - [ ] Link com `date` foca o gráfico naquele ponto.
  - [ ] OG image reflete o ponto destacado.
- **Esforço**: P (≈1 dia).

#### P1.8 — Reaproveitar templates / extrair partials
- **Por quê**: Bloco do "Framework" duplicado em `index.html` e `chart.html`; CSS duplicado em todas as páginas; mudar uma palavra exige 2-3 edits.
- **Como**:
  - Mover para `views/partials/framework.html` + carregar com `fs.readFileSync` no startup (ou EJS/Handlebars).
  - Extrair `public/css/base.css` compartilhado.
- **Critérios de aceite**:
  - [ ] Existe um único arquivo fonte para o framework.
  - [ ] CSS compartilhado entre as 3 páginas via `<link>`.
- **Esforço**: P (≈4h).

---

### P2 — Plataforma e expansão (1-3 meses)

#### P2.1 — Migração para Next.js (App Router) + TypeScript
- **Por quê**: Quando você adicionar auth (P2.2), alertas (P1.3), screener (P1.1) e blog (P2.5), três HTMLs de 800 linhas viram pesadelo. Next.js dá SSR pro SEO, ISR para o screener, route handlers, e ecossistema. TypeScript previne classe inteira de bugs em código financeiro (offsets, índices).
- **Contexto**: Hoje servidor é Express + HTML estático. Vercel é nativo Next.
- **Como**:
  - Migrar incrementalmente: criar `app/`, mover páginas uma a uma. Manter `src/index.js` como API legada durante transição.
  - Componentes: `<Chart>`, `<AnalysisBox>`, `<Framework>`, `<SearchBar>`, `<TickerCard>`.
  - Tipos para `HistoricalData`, `AnalysisResult`, `Signal`.
- **Critérios de aceite**:
  - [ ] Paridade funcional com o atual.
  - [ ] Build TS sem `any`.
  - [ ] TTFB em `/PETR4` ≤ 200ms em cold.
- **Esforço**: G (≈2 semanas).

#### P2.2 — Auth + favoritos sincronizados + watchlists nomeadas
- **Por quê**: Resolve "perdi minha lista no celular novo" e cria a base de monetização (premium tier).
- **Como**:
  - Clerk ou Supabase Auth (Google/Apple/email magic link).
  - Tabela `watchlists (user_id, name, tickers[])`.
  - Migration leve do localStorage: ao logar pela primeira vez, importar os tickers locais.
- **Critérios de aceite**:
  - [ ] Login persiste em devices.
  - [ ] Posso ter "Dividendos", "Cripto", "Especulação" como listas separadas.
- **Esforço**: M (≈1 semana).

#### P2.3 — Comparação multi-ativos
- **Por quê**: "PETR4 vs VALE3 vs IBOV últimos 1Y normalizado em 100" — pedido recorrente.
- **Como**:
  - Rota `/compare?tickers=PETR4,VALE3,^BVSP&period=1Y`.
  - Normalização base 100 no primeiro pregão.
  - Toggle: preço absoluto vs % de retorno.
- **Critérios de aceite**:
  - [ ] Até 5 ativos no mesmo gráfico.
  - [ ] Eixo Y em % e em preço.
- **Esforço**: M (≈3 dias).

#### P2.4 — FIIs, criptomoedas e FX
- **Por quê**: Expande TAM no público brasileiro (FII é cultura), e cripto/FX são tráfego internacional.
- **Como**:
  - Adicionar categorias no `index.html` e na busca.
  - Lidar com dividendos (relevante para FII): mostrar yield e histórico.
- **Critérios de aceite**:
  - [ ] `/HGLG11` mostra também DY 12m e gráfico de dividendos.
  - [ ] `/BTC-USD` funciona com indicadores.
- **Esforço**: M (≈4-5 dias).

#### P2.5 — Blog + report semanal automatizado
- **Por quê**: SEO de cauda longa. "Golden Cross PETR4", "ações sobrevendidas RSI hoje" são buscas reais. Report semanal é conteúdo evergreen e captura recorrente.
- **Como**:
  - MDX no Next.js, `/blog`.
  - Cron sexta-feira: gera post automático "Resumo dos sinais da semana — 12/maio a 16/maio" a partir dos dados do screener.
  - Newsletter envia o mesmo conteúdo aos subscribers.
- **Critérios de aceite**:
  - [ ] 1 post automático/semana publicado no `/blog`.
  - [ ] Tracking: cliques do blog em ticker page.
- **Esforço**: M (≈4-5 dias).

#### P2.6 — Telegram bot
- **Por quê**: Comunidade brasileira de trading vive no Telegram. Bot com `/sinais` e `/grafico PETR4` é gancho viral.
- **Como**:
  - Bot Telegram simples: comandos `/grafico TICKER`, `/sinais`, `/seguir TICKER` (associa chat_id ↔ subscriber).
  - Push de alerta via Telegram quando favoritos disparam sinal.
- **Critérios de aceite**:
  - [ ] Bot responde `/grafico PETR4` com imagem PNG.
  - [ ] `/seguir PETR4` registra alerta.
- **Esforço**: M (≈1 semana).

#### P2.7 — Histograma MACD, volume, candlestick
- **Como**:
  - Substituir `chart.js` por `lightweight-charts` (TradingView) para candles + volume.
  - Histograma MACD em subplot.
- **Critérios de aceite**:
  - [ ] Toggle line ↔ candle.
  - [ ] Subplot de volume e de MACD/RSI sincronizados no eixo X.
- **Esforço**: M (≈3-4 dias).

#### P2.8 — Política de privacidade, termos de uso, página "sobre"
- **Por quê**: LGPD é obrigação; "sobre" gera confiança.
- **Esforço**: P (≈1 dia).

---

### P3 — Monetização e visão (3+ meses)

#### P3.1 — Tier premium
- **Hipóteses**:
  - Alertas push (Telegram + email) ilimitados.
  - Screener com filtros avançados (combinação de indicadores, salvar queries).
  - Backtest customizável (estratégia: "Golden Cross + RSI<40 → 60d hold").
  - Watchlists ilimitadas, exportação CSV.
- **Modelo**: R$ 19/mês ou R$ 149/ano.
- **Critérios**: 50 assinantes pagantes em 3 meses pós-lançamento.

#### P3.2 — Afiliados de corretora
- Links de abertura de conta (XP, BTG, Avenue, Nubank, Inter). Banner discreto no `/`.

#### P3.3 — Comunidade (Discord/Telegram)
- Canal `#sinais-hoje` automatizado, `#aprendizado`, `#discussao-ativos`.

#### P3.4 — Indicadores avançados e estratégias customizáveis
- Bollinger Bands, Stochastic, Ichimoku, ATR, ADX. Builder visual de estratégia ("compre quando RSI<X e SMA50>SMA200").

#### P3.5 — i18n (en, es)
- Mercado LATAM (México, Argentina, Colômbia) com vocabulário em ES; US/Europa com EN.

#### P3.6 — App mobile (React Native ou Expo)
- Push notifications nativas, widget de homescreen com preço/sinal.

#### P3.7 — API pública (paga)
- Dev tier: `/api/v1/signals/:ticker` com chave. R$ 99/mês para 10k requests.

---

## 5. Roadmap sugerido (visão de 90 dias)

| Semana | Foco | Itens |
|--------|------|-------|
| 1 | Higiene + credibilidade | P0.1 MACD · P0.2 tickers · P0.6 README · P0.7 analytics/Sentry |
| 2 | Segurança + cache + SEO | P0.3 cache · P0.4 hardening · P0.5 SEO/OG |
| 3-4 | Engenharia de base + killer feature | P1.6 lint/testes/CI · P1.1 sinais-hoje · P1.2 busca |
| 5-6 | Retenção | P1.3 alertas email · P1.4 mobile/dark/PWA |
| 7-8 | Credibilidade e viralidade | P1.5 backtest · P1.7 deep link · P1.8 partials |
| 9-12 | Plataforma | P2.1 Next/TS (incremental) · P2.2 auth · P2.5 blog/newsletter |
| 13+ | Expansão e monetização | P2.3 compare · P2.4 FIIs/cripto · P2.6 Telegram · P3.1 premium |

---

## 6. Métricas de sucesso a instrumentar

- **Tráfego**: pageviews/dia, sessões únicas, % retorno (Plausible).
- **Engajamento**: views por sessão, taxa de favoritar, taxa de mudar período, cliques no TradingView, profundidade no framework.
- **Funil de email**: visitas → conversão email → confirmação → retenção de subscriber 30d.
- **Conteúdo**: posicionamento Google para "golden cross hoje", "macd petr4", "rsi sobrevendido b3"; CTR no Search Console.
- **Produto financeiro**: hit rate dos sinais reportados pelo backtest, calibração contínua.
- **Saúde técnica**: P95 do `/data/:ticker`, taxa de erro Sentry, hit rate do cache.

---

## 7. Riscos e considerações

- **Yahoo Finance é fonte não-oficial**. Em 2017 e 2022 ela quebrou clientes não-oficiais. Mitigar: abstrair `dataProvider` para trocar para Brapi (B3), Alpha Vantage, ou Polygon sem refator.
- **Disclaimer legal**: CVM regula recomendação de investimento. Continuar com disclaimer claro e nunca emitir frases como "compre X". "Sinal técnico" ≠ "recomendação". Considerar revisão jurídica antes do tier premium.
- **LGPD**: ao introduzir email/conta (P1.3, P2.2), publicar política, ter base legal (consentimento), permitir exclusão.
- **Custo de operação**: a 10k DAU, Yahoo + Vercel ficam apertados. Brapi tem plano free razoável; KV/Upstash ~U$0. Newsletter via Resend = free até 3k emails/mês.
