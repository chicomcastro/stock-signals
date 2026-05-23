const yahooFinanceModule = require("yahoo-finance2");
let yahooFinance = yahooFinanceModule.default || yahooFinanceModule;
const path = require("path");
const fs = require("fs");
const { createCache, ttlForNow } = require("./cache");
const { computeIndicators, findMaCrossPoints, findMacdSignalCrossPoints, analyzeIndicators } = require("./indicators");
const brapi = require("./providers/brapi");

if (typeof yahooFinance.suppressNotices === "function") {
  yahooFinance.suppressNotices(["yahooSurvey", "ripHistorical"]);
}

function setYahooClient(client) {
  yahooFinance = client;
}

function getYahooClient() {
  return yahooFinance;
}

let brapiClient = brapi;
function setBrapiClient(client) {
  brapiClient = client;
}
function getBrapiClient() {
  return brapiClient;
}

const historicalCache = createCache({ ttlMs: 15 * 60 * 1000 });
const quoteCache = createCache({ ttlMs: 5 * 60 * 1000 });
const searchCache = createCache({ ttlMs: 24 * 60 * 60 * 1000 });
const errorCache = createCache({ ttlMs: 60 * 1000 });
const inFlight = new Map();

const USE_MOCK = process.env.MOCK_YAHOO === "1";
const PREFER_BRAPI = process.env.PREFER_BRAPI !== "0";
let mockFixture = null;
function loadMockFixture() {
  if (mockFixture) return mockFixture;
  const fixturePath = path.join(__dirname, "..", "test", "fixtures", "historical.json");
  mockFixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  return mockFixture;
}

function classifyError(err) {
  if (err && (err.status === 429 || err.status === 502 || err.status === 404)) return err;
  const msg = String(err && err.message ? err.message : err);
  if (/Too Many Requests|429|rate limit|limite de requisições/i.test(msg)) {
    const e = new Error("Limite de requisições atingido. Tente novamente em 1-2 minutos.");
    e.status = 429;
    e.retryable = true;
    return e;
  }
  if (/Not Found|404|No data|HTTP 404|symbol may be delisted|inexistente/i.test(msg)) {
    const e = new Error("Ativo não encontrado");
    e.status = 404;
    return e;
  }
  if (/Unexpected token|JSON/i.test(msg)) {
    const e = new Error("O provedor de dados retornou uma resposta inesperada. Tente novamente em alguns instantes.");
    e.status = 502;
    e.retryable = true;
    return e;
  }
  return err;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function retry(fn, { attempts = 2, baseMs = 400 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = classifyError(err);
      if (!lastErr.retryable || i === attempts - 1) throw lastErr;
      await sleep(baseMs * Math.pow(2, i));
    }
  }
  throw lastErr;
}

async function dedup(key, fn) {
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = fn().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

function getDateRange(period, includeExtraHistory = false) {
  const now = new Date();
  let date;

  switch (period) {
    case "1M":
      date = new Date(now);
      date.setMonth(now.getMonth() - 1);
      break;
    case "3M":
      date = new Date(now);
      date.setMonth(now.getMonth() - 3);
      break;
    case "6M":
      date = new Date(now);
      date.setMonth(now.getMonth() - 6);
      break;
    case "1Y":
      date = new Date(now);
      date.setFullYear(now.getFullYear() - 1);
      break;
    case "5Y":
      date = new Date(now);
      date.setFullYear(now.getFullYear() - 5);
      break;
    case "ALL":
    default:
      return { period1: new Date("2000-01-01") };
  }

  if (includeExtraHistory && period !== "ALL" && period !== "5Y") {
    const extraDays = 2 * Math.max(200, 26 + 9, 14);
    return { period1: new Date(date.getTime() - extraDays * 24 * 60 * 60 * 1000) };
  }

  return { period1: date };
}

function buildMockHistorical() {
  const fx = loadMockFixture();
  return {
    quotes: fx.historical.map((d) => ({
      date: new Date(d.date),
      close: d.close,
      open: d.open ?? null,
      high: d.high ?? null,
      low: d.low ?? null,
      volume: d.volume ?? null,
    })),
    meta: {
      symbol: fx.quote.symbol,
      regularMarketPrice: fx.quote.regularMarketPrice,
      currency: fx.quote.currency,
      shortName: fx.quote.shortName,
      regularMarketChangePercent: fx.quote.regularMarketChangePercent,
    },
  };
}

function shouldUseBrapi(normalizedTicker) {
  if (!PREFER_BRAPI) return false;
  return brapiClient && brapiClient.isB3Ticker && brapiClient.isB3Ticker(normalizedTicker);
}

async function fetchYahooChartRaw(ticker, period) {
  const { period1 } = getDateRange(period, true);
  const chart = await yahooFinance.chart(ticker, {
    period1,
    interval: "1d",
    includePrePost: false,
  });
  return chart || { quotes: [], meta: {} };
}

async function fetchBrapiChartRaw(ticker, period) {
  return brapiClient.chart(ticker, { period });
}

async function fetchChart(ticker, period) {
  if (USE_MOCK) return buildMockHistorical();

  if (shouldUseBrapi(ticker)) {
    try {
      return await retry(() => fetchBrapiChartRaw(ticker, period));
    } catch (err) {
      const classified = classifyError(err);
      // For 401/403 (bad token) or transient failures, fall back to Yahoo silently
      if (classified.status === 401 || classified.status === 403 || classified.status === 502) {
        try {
          return await retry(() => fetchYahooChartRaw(ticker, period));
        } catch (yErr) {
          throw classifyError(yErr);
        }
      }
      throw classified;
    }
  }
  return retry(() => fetchYahooChartRaw(ticker, period));
}

async function getHistoricalAnalysis(normalizedTicker, period) {
  const cacheKey = `hist|${normalizedTicker}|${period}`;
  const cached = historicalCache.get(cacheKey);
  if (cached) return { ...cached, cache: "hit" };

  const errKey = `err|${cacheKey}`;
  const cachedErr = errorCache.get(errKey);
  if (cachedErr) {
    const stale = historicalCache.getStale(cacheKey);
    if (stale) return { ...stale, cache: "stale" };
    throw cachedErr;
  }

  return dedup(cacheKey, () => loadHistoricalAnalysis(normalizedTicker, period, cacheKey, errKey));
}

async function loadHistoricalAnalysis(normalizedTicker, period, cacheKey, errKey) {
  let raw;
  try {
    raw = await fetchChart(normalizedTicker, period);
  } catch (err) {
    const classified = classifyError(err);
    if (classified.retryable || classified.status === 429 || classified.status === 502) {
      errorCache.set(errKey, classified, 60 * 1000);
      const stale = historicalCache.getStale(cacheKey);
      if (stale) return { ...stale, cache: "stale" };
    }
    throw classified;
  }

  return buildAnalysisFromRaw(normalizedTicker, period, raw, cacheKey);
}

function buildAnalysisFromRaw(normalizedTicker, period, raw, cacheKey) {
  const quotes = (raw.quotes || []).filter((q) => q && q.date && q.close != null);
  if (quotes.length === 0) {
    const err = new Error("Ativo não encontrado ou sem dados");
    err.status = 404;
    throw err;
  }

  if (raw.meta) {
    quoteCache.set(`quote|${normalizedTicker}`, deriveQuoteSummary(normalizedTicker, raw.meta, quotes));
  }

  const { period1: visibleStart } = getDateRange(period, false);
  const sorted = quotes.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  const allClosePrices = sorted.map((d) => d.close);
  const indicators = computeIndicators(allClosePrices);

  const startIndex = sorted.findIndex((d) => new Date(d.date) >= visibleStart);
  const sliceFrom = startIndex === -1 ? 0 : startIndex;

  const visible = sorted.slice(sliceFrom);
  const dates = visible.map((d) => d.date);
  const closePrices = visible.map((d) => d.close);
  const volume = visible.map((d) => d.volume ?? null);
  const sma50 = indicators.sma50.slice(sliceFrom);
  const sma200 = indicators.sma200.slice(sliceFrom);
  const rsi = indicators.rsi.slice(sliceFrom);
  const macdLine = indicators.macdLine.slice(sliceFrom);
  const macdSignal = indicators.macdSignal.slice(sliceFrom);
  const macdHistogram = indicators.macdHistogram.slice(sliceFrom);

  const crossPoints = findMaCrossPoints(sma50, sma200, dates, closePrices);
  const macdCrossPoints = findMacdSignalCrossPoints(macdLine, macdSignal, dates, closePrices);

  const responseData = {
    ticker: normalizedTicker,
    period,
    dates,
    closePrices,
    volume,
    sma50,
    sma200,
    rsi,
    macdLine,
    macdSignal,
    macdHistogram,
    macd: macdLine,
    crossPoints,
    macdCrossPoints,
    meta: raw.meta || null,
    source: shouldUseBrapi(normalizedTicker) ? "brapi" : "yahoo",
  };
  responseData.analysis = dates.map((_, i) => analyzeIndicators(responseData, i));

  if (cacheKey) historicalCache.set(cacheKey, responseData, ttlForNow());
  return cacheKey ? { ...responseData, cache: "miss" } : responseData;
}

function deriveQuoteSummary(normalizedTicker, meta, quotes) {
  const last = quotes && quotes.length > 0 ? quotes[quotes.length - 1] : null;
  const prev = quotes && quotes.length > 1 ? quotes[quotes.length - 2] : null;
  const lastClose = last && last.close != null ? last.close : null;
  const prevClose = prev && prev.close != null ? prev.close : null;
  const derivedChange = lastClose != null && prevClose != null && prevClose !== 0
    ? ((lastClose - prevClose) / prevClose) * 100
    : null;

  return {
    symbol: (meta && meta.symbol) || normalizedTicker,
    shortName: (meta && (meta.shortName || meta.longName)) || normalizedTicker,
    regularMarketPrice: (meta && meta.regularMarketPrice != null) ? meta.regularMarketPrice : lastClose,
    regularMarketChangePercent: (meta && meta.regularMarketChangePercent != null) ? meta.regularMarketChangePercent : derivedChange,
    currency: (meta && meta.currency) || null,
  };
}

async function getHistoricalAnalysisBatch(normalizedTickers, period) {
  const results = new Map();
  const missing = [];

  for (const t of normalizedTickers) {
    const key = `hist|${t}|${period}`;
    const cached = historicalCache.get(key);
    if (cached) results.set(t, { ...cached, cache: "hit" });
    else missing.push(t);
  }

  if (missing.length === 0) return results;

  if (USE_MOCK) {
    for (const t of missing) {
      try {
        const raw = buildMockHistorical();
        const built = buildAnalysisFromRaw(t, period, raw, `hist|${t}|${period}`);
        results.set(t, built);
      } catch (_) {}
    }
    return results;
  }

  const brapiTickers = PREFER_BRAPI ? missing.filter(shouldUseBrapi) : [];
  const otherTickers = missing.filter((t) => !brapiTickers.includes(t));

  if (brapiTickers.length > 0 && brapiClient.chartBatch) {
    try {
      const batched = await retry(() => brapiClient.chartBatch(brapiTickers, { period }));
      const seen = new Set();
      for (const item of batched) {
        const found = brapiTickers.find((t) => t === item.symbol || t.replace(/\.SA$/, "") === item.symbol);
        if (!found) continue;
        seen.add(found);
        try {
          const built = buildAnalysisFromRaw(found, period, item.chart, `hist|${found}|${period}`);
          results.set(found, built);
        } catch (_) {}
      }
      // Anything brapi didn't return → fall through to Yahoo
      for (const t of brapiTickers) {
        if (!seen.has(t)) otherTickers.push(t);
      }
    } catch (_) {
      // Brapi batch failed entirely — fall back to Yahoo for all
      for (const t of brapiTickers) otherTickers.push(t);
    }
  }

  for (const t of otherTickers) {
    try {
      const data = await getHistoricalAnalysis(t, period);
      results.set(t, data);
    } catch (_) {}
  }

  return results;
}

async function getQuote(normalizedTicker) {
  const key = `quote|${normalizedTicker}`;
  const cached = quoteCache.get(key);
  if (cached) return cached;

  const errKey = `err|${key}`;
  const cachedErr = errorCache.get(errKey);
  if (cachedErr) {
    const stale = quoteCache.getStale(key);
    if (stale) return stale;
    throw cachedErr;
  }

  return dedup(key, () => loadQuote(normalizedTicker, key, errKey));
}

async function loadQuote(normalizedTicker, key, errKey) {
  if (USE_MOCK) {
    const fx = loadMockFixture();
    const summary = { ...fx.quote, symbol: normalizedTicker };
    quoteCache.set(key, summary);
    return summary;
  }

  let quote;
  try {
    if (shouldUseBrapi(normalizedTicker)) {
      quote = await retry(() => brapiClient.quote(normalizedTicker));
    } else {
      const raw = await retry(() => yahooFinance.quote(normalizedTicker));
      quote = {
        symbol: raw.symbol,
        shortName: raw.shortName ?? raw.longName ?? raw.symbol,
        regularMarketPrice: raw.regularMarketPrice ?? null,
        regularMarketChangePercent: raw.regularMarketChangePercent ?? null,
        currency: raw.currency ?? null,
      };
    }
  } catch (err) {
    const classified = classifyError(err);
    if (classified.retryable || classified.status === 429 || classified.status === 502) {
      errorCache.set(errKey, classified, 60 * 1000);
      const stale = quoteCache.getStale(key);
      if (stale) return stale;
    }
    throw classified;
  }
  quoteCache.set(key, quote);
  return quote;
}

async function searchTickers(query) {
  const key = `search|${query.toLowerCase()}`;
  const cached = searchCache.get(key);
  if (cached) return cached;

  if (USE_MOCK) {
    const fx = loadMockFixture();
    searchCache.set(key, fx.search);
    return fx.search;
  }

  return dedup(key, async () => {
    let result;
    try {
      result = await retry(() => yahooFinance.search(query, { newsCount: 0, quotesCount: 8 }));
    } catch (err) {
      throw classifyError(err);
    }
    const quotes = (result.quotes || []).map((q) => ({
      symbol: q.symbol,
      shortname: q.shortname ?? q.longname ?? q.symbol,
      exchange: q.exchange ?? null,
      type: q.quoteType ?? null,
    }));
    searchCache.set(key, quotes);
    return quotes;
  });
}

module.exports = {
  getHistoricalAnalysis,
  getHistoricalAnalysisBatch,
  getQuote,
  searchTickers,
  getDateRange,
  classifyError,
  retry,
  setYahooClient,
  getYahooClient,
  setBrapiClient,
  getBrapiClient,
  shouldUseBrapi,
  historicalCache,
  quoteCache,
  searchCache,
  errorCache,
};
