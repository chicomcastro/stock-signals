const yahooFinanceModule = require("yahoo-finance2");
let yahooFinance = yahooFinanceModule.default || yahooFinanceModule;
const path = require("path");
const fs = require("fs");
const { createCache, ttlForNow } = require("./cache");
const { computeIndicators, findMaCrossPoints, findMacdSignalCrossPoints, analyzeIndicators } = require("./indicators");

if (typeof yahooFinance.suppressNotices === "function") {
  yahooFinance.suppressNotices(["yahooSurvey", "ripHistorical"]);
}

function setYahooClient(client) {
  yahooFinance = client;
}

function getYahooClient() {
  return yahooFinance;
}

const historicalCache = createCache({ ttlMs: 15 * 60 * 1000 });
const quoteCache = createCache({ ttlMs: 5 * 60 * 1000 });
const searchCache = createCache({ ttlMs: 24 * 60 * 60 * 1000 });
const errorCache = createCache({ ttlMs: 60 * 1000 });
const inFlight = new Map();

const USE_MOCK = process.env.MOCK_YAHOO === "1";
let mockFixture = null;
function loadMockFixture() {
  if (mockFixture) return mockFixture;
  const fixturePath = path.join(__dirname, "..", "test", "fixtures", "historical.json");
  mockFixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  return mockFixture;
}

function classifyError(err) {
  const msg = String(err && err.message ? err.message : err);
  if (/Too Many Requests|429|rate limit/i.test(msg)) {
    const e = new Error("Limite de requisições do Yahoo Finance atingido. Tente novamente em 1-2 minutos.");
    e.status = 429;
    e.retryable = true;
    return e;
  }
  if (/Not Found|404|No data|HTTP 404|symbol may be delisted/i.test(msg)) {
    const e = new Error("Ativo não encontrado");
    e.status = 404;
    return e;
  }
  if (/Unexpected token|JSON/i.test(msg)) {
    const e = new Error("Yahoo Finance retornou uma resposta inesperada. Tente novamente em alguns instantes.");
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

async function fetchYahooChart(ticker, period) {
  if (USE_MOCK) return buildMockHistorical();

  const { period1 } = getDateRange(period, true);
  return retry(async () => {
    const chart = await yahooFinance.chart(ticker, {
      period1,
      interval: "1d",
      includePrePost: false,
    });
    return chart || { quotes: [], meta: {} };
  });
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
    raw = await fetchYahooChart(normalizedTicker, period);
  } catch (err) {
    const classified = classifyError(err);
    if (classified.retryable || classified.status === 429 || classified.status === 502) {
      errorCache.set(errKey, classified, 60 * 1000);
      const stale = historicalCache.getStale(cacheKey);
      if (stale) return { ...stale, cache: "stale" };
    }
    throw classified;
  }

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
  };
  responseData.analysis = dates.map((_, i) => analyzeIndicators(responseData, i));

  historicalCache.set(cacheKey, responseData, ttlForNow());
  return { ...responseData, cache: "miss" };
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
    quote = await retry(() => yahooFinance.quote(normalizedTicker));
  } catch (err) {
    const classified = classifyError(err);
    if (classified.retryable || classified.status === 429 || classified.status === 502) {
      errorCache.set(errKey, classified, 60 * 1000);
      const stale = quoteCache.getStale(key);
      if (stale) return stale;
    }
    throw classified;
  }
  const summary = {
    symbol: quote.symbol,
    shortName: quote.shortName ?? quote.longName ?? quote.symbol,
    regularMarketPrice: quote.regularMarketPrice ?? null,
    regularMarketChangePercent: quote.regularMarketChangePercent ?? null,
    currency: quote.currency ?? null,
  };
  quoteCache.set(key, summary);
  return summary;
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
  getQuote,
  searchTickers,
  getDateRange,
  classifyError,
  retry,
  setYahooClient,
  getYahooClient,
  historicalCache,
  quoteCache,
  searchCache,
  errorCache,
};
