const yahooFinance = require("yahoo-finance2").default;
const { createCache, ttlForNow } = require("./cache");
const { computeIndicators, findMaCrossPoints, findMacdSignalCrossPoints, analyzeIndicators } = require("./indicators");

yahooFinance.suppressNotices?.(["yahooSurvey", "ripHistorical"]);

const historicalCache = createCache({ ttlMs: 5 * 60 * 1000 });
const quoteCache = createCache({ ttlMs: 60 * 1000 });
const searchCache = createCache({ ttlMs: 24 * 60 * 60 * 1000 });

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

async function fetchYahooHistorical(ticker, period) {
  const { period1 } = getDateRange(period, true);
  const chart = await yahooFinance.chart(ticker, {
    period1,
    interval: "1d",
    includePrePost: false,
  });
  const quotes = chart?.quotes || [];
  return quotes
    .filter((q) => q && q.date && q.close != null)
    .map((q) => ({
      date: q.date instanceof Date ? q.date : new Date(q.date),
      close: q.close,
      open: q.open ?? null,
      high: q.high ?? null,
      low: q.low ?? null,
      volume: q.volume ?? null,
    }));
}

async function getHistoricalAnalysis(normalizedTicker, period) {
  const cacheKey = `hist|${normalizedTicker}|${period}`;
  const cached = historicalCache.get(cacheKey);
  if (cached) return { ...cached, cache: "hit" };

  let raw;
  try {
    raw = await fetchYahooHistorical(normalizedTicker, period);
  } catch (err) {
    if (/Not Found|404|No data/i.test(err.message)) {
      const error = new Error("Ativo não encontrado");
      error.status = 404;
      throw error;
    }
    throw err;
  }

  if (!raw || raw.length === 0) {
    const err = new Error("Ativo não encontrado ou sem dados");
    err.status = 404;
    throw err;
  }

  const { period1: visibleStart } = getDateRange(period, false);
  const sorted = raw.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
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
  };
  responseData.analysis = dates.map((_, i) => analyzeIndicators(responseData, i));

  historicalCache.set(cacheKey, responseData, ttlForNow());
  return { ...responseData, cache: "miss" };
}

async function getQuote(normalizedTicker) {
  const key = `quote|${normalizedTicker}`;
  const cached = quoteCache.get(key);
  if (cached) return cached;

  const quote = await yahooFinance.quote(normalizedTicker);
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

  const result = await yahooFinance.search(query, { newsCount: 0, quotesCount: 8 });
  const quotes = (result.quotes || []).map((q) => ({
    symbol: q.symbol,
    shortname: q.shortname ?? q.longname ?? q.symbol,
    exchange: q.exchange ?? null,
    type: q.quoteType ?? null,
  }));
  searchCache.set(key, quotes);
  return quotes;
}

module.exports = {
  getHistoricalAnalysis,
  getQuote,
  searchTickers,
  getDateRange,
  historicalCache,
  quoteCache,
};
