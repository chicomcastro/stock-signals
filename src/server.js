const express = require("express");
const path = require("path");
const fs = require("fs");
const rateLimit = require("express-rate-limit");

const { normalizeTicker, displayTicker, isValidTickerInput } = require("./ticker");
const { getHistoricalAnalysis, getQuote, searchTickers } = require("./dataProvider");
const { tickerOgSvg, defaultOgSvg } = require("./og");

const PUBLIC_DIR = path.join(__dirname, "..", "public");
const STATIC_FILE_PATTERN = /\.(ico|png|jpg|jpeg|svg|webp|gif|js|mjs|css|map|txt|xml|json|webmanifest|woff|woff2|ttf)$/i;

const FEATURED_TICKERS = [
  "PETR4", "VALE3", "ITUB4", "BBDC4", "BBAS3", "MGLU3", "TOTS3", "BOVA11",
  "IVVB11", "AAPL34", "AAPL", "MSFT", "GOOGL", "BTC-USD", "USDBRL=X",
];

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

function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

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
    const urls = ["/", "/favorites.html", ...FEATURED_TICKERS.map((t) => `/${t}`)];
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
      let name = displayTicker(normalized);
      let price = null;
      let changePercent = null;
      let currency = null;
      try {
        const quote = await getQuote(normalized);
        name = quote.shortName || name;
        price = quote.regularMarketPrice;
        changePercent = quote.regularMarketChangePercent;
        currency = quote.currency;
      } catch (_) {}
      const svg = tickerOgSvg({
        ticker: displayTicker(normalized),
        name,
        price,
        changePercent,
        currency,
        signalLabel: "Análise técnica · stock-signals",
      });
      res.type("image/svg+xml").setHeader("Cache-Control", "public, max-age=600").send(svg);
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

  app.get("/favorites.html", (req, res) => {
    serveFavorites(req, res);
  });

  app.get("/favorites", (req, res) => {
    serveFavorites(req, res);
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

    fs.readFile(templatePath, "utf8", async (err, template) => {
      if (err) return res.status(500).send("Erro ao carregar o template");

      let assetName = "";
      try {
        const quote = await getQuote(normalized);
        if (quote.shortName && quote.shortName !== display) {
          assetName = ` — ${quote.shortName}`;
        }
      } catch (_) {}

      const baseUrl = buildBaseUrl(req);
      const title = `${display} — Análise técnica (RSI, MACD, Golden Cross) · Stock Signals`;
      const description = `Veja sinais técnicos automáticos para ${display}: MA50/200, RSI, MACD e Golden/Death Cross com análise diária.`;

      const html = injectTemplate(template, {
        ticker: htmlAttr(display),
        asset_name: htmlAttr(assetName),
        page_title: htmlAttr(title),
        page_description: htmlAttr(description),
        canonical_url: htmlAttr(`${baseUrl}/${display}`),
        og_image: htmlAttr(`${baseUrl}/og/${display}.svg`),
      });
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
      res.send(html);
    });
  });

  app.get("/", (req, res) => {
    const templatePath = path.join(PUBLIC_DIR, "index.html");
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) return res.status(500).send("Erro ao carregar o template");
      const baseUrl = buildBaseUrl(req);
      const html = injectTemplate(template, {
        page_title: "Stock Signals — Análise técnica B3, ações, BDRs e mais",
        page_description:
          "Sinais técnicos automáticos (Golden Cross, MACD, RSI) para ações da B3, BDRs, ETFs, cripto e moedas. Gratuito e educacional.",
        canonical_url: htmlAttr(`${baseUrl}/`),
        og_image: htmlAttr(`${baseUrl}/og/default.svg`),
      });
      res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");
      res.send(html);
    });
  });

  function serveFavorites(req, res) {
    const templatePath = path.join(PUBLIC_DIR, "favorites.html");
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) return res.status(500).send("Erro ao carregar o template");
      const baseUrl = buildBaseUrl(req);
      const html = injectTemplate(template, {
        page_title: "Meus favoritos · Stock Signals",
        page_description: "Sua watchlist de ativos com análise técnica resumida.",
        canonical_url: htmlAttr(`${baseUrl}/favorites`),
        og_image: htmlAttr(`${baseUrl}/og/default.svg`),
      });
      res.setHeader("Cache-Control", "private, no-cache");
      res.send(html);
    });
  }

  app.use((req, res) => res.status(404).type("text/plain").send("Not found"));

  return app;
}

module.exports = { createApp };
