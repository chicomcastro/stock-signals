const express = require("express");
const path = require("path");
const fs = require("fs");
const rateLimit = require("express-rate-limit");

const { normalizeTicker, displayTicker, isValidTickerInput } = require("./ticker");
const { getHistoricalAnalysis, getHistoricalAnalysisBatch, getQuote, searchTickers } = require("./dataProvider");
const { tickerOgSvg, defaultOgSvg } = require("./og");
const { backtestAllForTicker } = require("./backtest");
const { extractDailySignals, aggregateSignals, DEFAULT_UNIVERSE } = require("./signals");
const { createSubscriberStore, isValidEmail, sanitizeTickers } = require("./subscribers");

const PUBLIC_DIR = path.join(__dirname, "..", "public");
const PARTIALS_DIR = path.join(PUBLIC_DIR, "partials");
const STATIC_FILE_PATTERN = /\.(ico|png|jpg|jpeg|svg|webp|gif|js|mjs|css|map|txt|xml|json|webmanifest|woff|woff2|ttf)$/i;

const FEATURED_TICKERS = [
  "PETR4", "VALE3", "ITUB4", "BBDC4", "BBAS3", "MGLU3", "TOTS3", "BOVA11",
  "IVVB11", "AAPL34", "AAPL", "MSFT", "GOOGL", "BTC-USD", "USDBRL=X",
];

function loadPartial(name) {
  try {
    return fs.readFileSync(path.join(PARTIALS_DIR, `${name}.html`), "utf8");
  } catch (_) {
    return "";
  }
}

const APP_SHELL_HTML = loadPartial("app-shell");

function buildBaseUrl(req) {
  const envBase = process.env.PUBLIC_BASE_URL;
  if (envBase) return envBase.replace(/\/$/, "");
  const proto = (req.headers["x-forwarded-proto"] || req.protocol || "http").split(",")[0].trim();
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

function injectTemplate(template, vars) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const value = vars[key];
    return value == null ? "" : String(value);
  });
}

function htmlAttr(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function createApp({ subscriberStore } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "20kb" }));

  const store = subscriberStore || createSubscriberStore();

  const rateMax = process.env.RATE_LIMIT_MAX
    ? Number(process.env.RATE_LIMIT_MAX)
    : process.env.NODE_ENV === "test"
    ? 10000
    : 60;

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: rateMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Muitas requisições. Tente novamente em 1 minuto." },
    validate: { trustProxy: false },
  });

  const writeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: process.env.NODE_ENV === "test" ? 1000 : 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Muitas tentativas. Aguarde 1 minuto." },
    validate: { trustProxy: false },
  });

  const staticServer = express.static(PUBLIC_DIR, {
    index: false,
    setHeaders: (res, filePath) => {
      if (/\.(svg|png|ico|woff2|webmanifest)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=86400");
      }
    },
  });

  app.use((req, res, next) => {
    if (/\.html$/i.test(req.path)) return next();
    return staticServer(req, res, next);
  });

  app.get("/robots.txt", (req, res) => {
    const base = buildBaseUrl(req);
    res.type("text/plain").send(`User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
  });

  app.get("/sitemap.xml", (req, res) => {
    const base = buildBaseUrl(req);
    const urls = ["/", "/sinais", "/alertas", "/favorites", ...FEATURED_TICKERS.map((t) => `/${t}`)];
    const body =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls.map((u) => `  <url><loc>${base}${u}</loc></url>`).join("\n") +
      `\n</urlset>\n`;
    res.type("application/xml").send(body);
  });

  app.get("/og/default.svg", (req, res) => {
    res.type("image/svg+xml")
      .setHeader("Cache-Control", "public, max-age=3600")
      .send(defaultOgSvg());
  });

  app.get("/og/:ticker.svg", async (req, res) => {
    try {
      if (!isValidTickerInput(req.params.ticker)) return res.status(400).send("Ticker inválido");
      const normalized = normalizeTicker(req.params.ticker);
      const display = displayTicker(normalized);
      const svg = tickerOgSvg({
        ticker: display,
        name: display,
        price: null,
        changePercent: null,
        currency: null,
        signalLabel: "Análise técnica · stock-signals",
      });
      res.type("image/svg+xml").setHeader("Cache-Control", "public, max-age=86400").send(svg);
    } catch (err) {
      res.status(500).send("Erro ao gerar imagem");
    }
  });

  app.get("/data/:ticker", apiLimiter, async (req, res) => {
    try {
      if (!isValidTickerInput(req.params.ticker)) {
        return res.status(400).json({ error: "Ticker inválido" });
      }
      const normalized = normalizeTicker(req.params.ticker);
      const period = typeof req.query.period === "string" ? req.query.period : "3M";
      const data = await getHistoricalAnalysis(normalized, period);
      res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
      res.json(data);
    } catch (error) {
      const status = error.status || 500;
      res.status(status).json({ error: error.message });
    }
  });

  app.get("/api/backtest/:ticker", apiLimiter, async (req, res) => {
    try {
      if (!isValidTickerInput(req.params.ticker)) {
        return res.status(400).json({ error: "Ticker inválido" });
      }
      const normalized = normalizeTicker(req.params.ticker);
      const data = await getHistoricalAnalysis(normalized, "5Y");
      const result = backtestAllForTicker(data, [30, 60, 90]);
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.json({ ticker: normalized, ...result });
    } catch (error) {
      const status = error.status || 500;
      res.status(status).json({ error: error.message });
    }
  });

  app.get("/api/signals", apiLimiter, async (req, res) => {
    try {
      const universe = (req.query.universe ? String(req.query.universe).split(",") : DEFAULT_UNIVERSE)
        .map((t) => t.trim())
        .filter(isValidTickerInput)
        .slice(0, 60);

      const limit = Math.min(Number(req.query.limit || universe.length), 60);
      const period = "6M";
      const tickers = universe.slice(0, limit);
      const referenceDate = new Date();
      const normalizedTickers = tickers.map(normalizeTicker);

      // 1 batched call to Brapi for B3 + serialized Yahoo calls for the rest
      const results = await getHistoricalAnalysisBatch(normalizedTickers, period);

      const ok = [];
      for (const [normalized, data] of results.entries()) {
        try {
          const signals = extractDailySignals(data.analysis, data.dates, 5, referenceDate);
          if (signals.length > 0) {
            ok.push({ ticker: displayTicker(normalized), normalized, signals });
          }
        } catch (_) {}
      }

      const buckets = aggregateSignals(ok);
      res.setHeader("Cache-Control", "public, max-age=1800, s-maxage=1800");
      res.json({
        date: referenceDate.toISOString().slice(0, 10),
        universeSize: tickers.length,
        processed: results.size,
        withSignals: ok.length,
        rateLimited: results.size < tickers.length,
        buckets,
      });
    } catch (error) {
      const status = error.status || 500;
      res.status(status).json({ error: error.message });
    }
  });

  app.get("/api/search", apiLimiter, async (req, res) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      if (q.length < 2) return res.json([]);
      const results = await searchTickers(q);
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.json(results);
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.message });
    }
  });

  app.get("/api/quote/:ticker", apiLimiter, async (req, res) => {
    try {
      if (!isValidTickerInput(req.params.ticker)) {
        return res.status(400).json({ error: "Ticker inválido" });
      }
      const normalized = normalizeTicker(req.params.ticker);
      const quote = await getQuote(normalized);
      res.setHeader("Cache-Control", "public, max-age=60");
      res.json(quote);
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.message });
    }
  });

  // Subscribers / alertas
  app.post("/api/alerts/subscribe", writeLimiter, (req, res) => {
    try {
      const { email, tickers } = req.body || {};
      if (!isValidEmail(email)) return res.status(400).json({ error: "E-mail inválido" });
      const safe = sanitizeTickers(tickers);
      if (safe.length === 0) return res.status(400).json({ error: "Selecione pelo menos um ativo" });
      const sub = store.subscribe({ email, tickers: safe });
      const base = buildBaseUrl(req);
      res.json({
        ok: true,
        email: sub.email,
        tickers: sub.tickers,
        confirmUrl: `${base}/api/alerts/confirm/${sub.confirmToken}`,
        unsubscribeUrl: `${base}/api/alerts/unsubscribe/${sub.unsubscribeToken}`,
      });
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.message });
    }
  });

  app.get("/api/alerts/confirm/:token", (req, res) => {
    const sub = store.confirm(req.params.token);
    if (!sub) return res.status(404).type("text/plain").send("Token inválido ou expirado.");
    res.type("text/html").send(`<!doctype html><meta charset="utf-8"><title>Confirmado</title><body style="font-family:system-ui;padding:48px;text-align:center"><h1>✅ Inscrição confirmada</h1><p>Você vai receber sinais para <b>${sub.tickers.join(", ")}</b>.</p><p><a href="/">Voltar ao Stock Signals</a></p></body>`);
  });

  app.get("/api/alerts/unsubscribe/:token", (req, res) => {
    const sub = store.unsubscribe(req.params.token);
    if (!sub) return res.status(404).type("text/plain").send("Inscrição não encontrada.");
    res.type("text/html").send(`<!doctype html><meta charset="utf-8"><title>Cancelado</title><body style="font-family:system-ui;padding:48px;text-align:center"><h1>👋 Inscrição cancelada</h1><p>Você não vai receber mais alertas em <b>${sub.email}</b>.</p><p><a href="/">Voltar ao Stock Signals</a></p></body>`);
  });

  // HTML routes
  app.get("/favorites.html", (req, res) => serveStaticPage(req, res, "favorites.html", {
    page_title: "Meus favoritos · Stock Signals",
    page_description: "Sua watchlist de ativos com análise técnica resumida.",
    canonical_path: "/favorites",
    robots: "noindex",
  }));
  app.get("/favorites", (req, res) => serveStaticPage(req, res, "favorites.html", {
    page_title: "Meus favoritos · Stock Signals",
    page_description: "Sua watchlist de ativos com análise técnica resumida.",
    canonical_path: "/favorites",
    robots: "noindex",
  }));

  app.get("/sinais", (req, res) => serveStaticPage(req, res, "sinais.html", {
    page_title: "Sinais do dia — Stock Signals",
    page_description: "Ações da B3, ETFs e cripto com sinais técnicos hoje: Golden Cross, MACD, RSI e mais.",
    canonical_path: "/sinais",
  }));

  app.get("/alertas", (req, res) => serveStaticPage(req, res, "alertas.html", {
    page_title: "Alertas por email — Stock Signals",
    page_description: "Receba um e-mail quando sinais técnicos forem detectados em seus ativos favoritos.",
    canonical_path: "/alertas",
  }));

  app.get("/buscar", (req, res) => {
    // Buscar simplesmente abre o modal de busca na home
    res.redirect("/?search=1");
  });

  app.get("/:ticker", async (req, res) => {
    const raw = req.params.ticker;

    if (STATIC_FILE_PATTERN.test(raw)) {
      return res.status(404).type("text/plain").send("Not found");
    }

    if (!isValidTickerInput(raw)) {
      return res.status(400).type("text/plain").send("Ticker inválido");
    }

    let normalized;
    try {
      normalized = normalizeTicker(raw);
    } catch (_) {
      return res.status(400).type("text/plain").send("Ticker inválido");
    }

    const display = displayTicker(normalized);
    const templatePath = path.join(PUBLIC_DIR, "chart.html");

    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) return res.status(500).send("Erro ao carregar o template");

      // Não chamamos Yahoo no render — o nome amigável vem via /data no cliente.
      // Mas se já tivermos cache, aproveitamos para meta tags melhores.
      let cachedName = "";
      try {
        const cachedQuote = require("./dataProvider").quoteCache.get(`quote|${normalized}`);
        if (cachedQuote && cachedQuote.shortName && cachedQuote.shortName !== display) {
          cachedName = ` — ${cachedQuote.shortName}`;
        }
      } catch (_) {}

      const baseUrl = buildBaseUrl(req);
      const title = `${display} — Análise técnica (RSI, MACD, Golden Cross) · Stock Signals`;
      const description = `Veja sinais técnicos automáticos para ${display}: MA50/200, RSI, MACD e Golden/Death Cross com análise diária.`;

      const html = injectTemplate(template, {
        ticker: htmlAttr(display),
        asset_name: htmlAttr(cachedName),
        page_title: htmlAttr(title),
        page_description: htmlAttr(description),
        canonical_url: htmlAttr(`${baseUrl}/${display}`),
        og_image: htmlAttr(`${baseUrl}/og/${display}.svg`),
        app_shell: APP_SHELL_HTML,
        robots: "index, follow",
      });
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
      res.send(html);
    });
  });

  app.get("/", (req, res) => serveStaticPage(req, res, "index.html", {
    page_title: "Stock Signals — Sinais de compra e venda, sem jargão",
    page_description: "Análise técnica simples e didática para ações da B3, BDRs, ETFs, cripto e câmbio. Veja os sinais do dia e configure alertas grátis.",
    canonical_path: "/",
  }));

  function serveStaticPage(req, res, file, meta) {
    const templatePath = path.join(PUBLIC_DIR, file);
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) return res.status(500).send("Erro ao carregar o template");
      const baseUrl = buildBaseUrl(req);
      const html = injectTemplate(template, {
        page_title: htmlAttr(meta.page_title),
        page_description: htmlAttr(meta.page_description),
        canonical_url: htmlAttr(`${baseUrl}${meta.canonical_path}`),
        og_image: htmlAttr(`${baseUrl}/og/default.svg`),
        app_shell: APP_SHELL_HTML,
        robots: meta.robots || "index, follow",
      });
      res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");
      res.send(html);
    });
  }

  app.use((req, res) => res.status(404).type("text/plain").send("Not found"));

  return app;
}

module.exports = { createApp };
