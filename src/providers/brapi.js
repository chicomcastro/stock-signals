const BRAPI_BASE = process.env.BRAPI_BASE || "https://brapi.dev/api";
const BRAPI_TOKEN = process.env.BRAPI_TOKEN || "";

let fetchImpl = typeof fetch === "function" ? fetch : null;

function setFetchImpl(impl) {
  fetchImpl = impl;
}

function periodToRange(period) {
  switch (period) {
    case "1M": return "1mo";
    case "3M": return "3mo";
    case "6M": return "6mo";
    case "1Y": return "1y";
    case "5Y": return "5y";
    case "ALL": return "max";
    default: return "3mo";
  }
}

function brapiTicker(normalizedOrDisplay) {
  return String(normalizedOrDisplay || "").toUpperCase().replace(/\.SA$/, "");
}

function buildUrl(pathSegments, queryParams = {}) {
  const path = pathSegments.map(encodeURIComponent).join("/");
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(queryParams)) {
    if (v != null && v !== "") params.set(k, String(v));
  }
  if (BRAPI_TOKEN) params.set("token", BRAPI_TOKEN);
  const qs = params.toString();
  return `${BRAPI_BASE}/${path}${qs ? `?${qs}` : ""}`;
}

function classifyHttpError(status, body) {
  const text = typeof body === "string" ? body : JSON.stringify(body || {});
  if (status === 429 || /rate limit|too many requests/i.test(text)) {
    const e = new Error("Brapi: limite de requisições atingido");
    e.status = 429;
    e.retryable = true;
    return e;
  }
  if (status === 404 || /not found|not.found|inexistente/i.test(text)) {
    const e = new Error("Ativo não encontrado");
    e.status = 404;
    return e;
  }
  if (status >= 500) {
    const e = new Error(`Brapi: erro ${status}`);
    e.status = 502;
    e.retryable = true;
    return e;
  }
  if (status === 401 || status === 403) {
    const e = new Error("Brapi: token inválido ou sem permissão");
    e.status = status;
    return e;
  }
  const e = new Error(`Brapi: erro ${status}`);
  e.status = status;
  return e;
}

async function brapiFetch(url) {
  if (!fetchImpl) throw new Error("fetch indisponível neste runtime");
  const res = await fetchImpl(url, {
    headers: { "Accept": "application/json", "User-Agent": "stock-signals/1.0" },
  });
  let body;
  try {
    body = await res.json();
  } catch (_) {
    body = await res.text().catch(() => "");
  }
  if (!res.ok) throw classifyHttpError(res.status, body);
  return body;
}

function mapResultToChart(result) {
  if (!result) return { quotes: [], meta: {} };
  const quotes = (result.historicalDataPrice || [])
    .filter((q) => q && q.date && q.close != null)
    .map((q) => ({
      date: new Date(q.date * 1000),
      close: q.close,
      open: q.open ?? null,
      high: q.high ?? null,
      low: q.low ?? null,
      volume: q.volume ?? null,
    }));
  const meta = {
    symbol: result.symbol,
    shortName: result.shortName ?? result.longName ?? result.symbol,
    longName: result.longName ?? null,
    regularMarketPrice: result.regularMarketPrice ?? null,
    regularMarketChangePercent: result.regularMarketChangePercent ?? null,
    currency: result.currency ?? "BRL",
  };
  return { quotes, meta };
}

async function chart(ticker, opts = {}) {
  const symbol = brapiTicker(ticker);
  const period = opts.period || opts._period || "3M";
  const url = buildUrl(["quote", symbol], {
    range: periodToRange(period),
    interval: "1d",
    fundamental: "false",
    dividends: "false",
  });
  const body = await brapiFetch(url);
  const result = (body.results || [])[0];
  if (!result) {
    const e = new Error("Ativo não encontrado");
    e.status = 404;
    throw e;
  }
  return mapResultToChart(result);
}

async function chartBatch(tickers, opts = {}) {
  const symbols = tickers.map(brapiTicker).filter(Boolean);
  if (symbols.length === 0) return [];
  const period = opts.period || "3M";
  const url = buildUrl(["quote", symbols.join(",")], {
    range: periodToRange(period),
    interval: "1d",
    fundamental: "false",
    dividends: "false",
  });
  const body = await brapiFetch(url);
  const results = body.results || [];
  return results.map((r) => ({
    symbol: r.symbol,
    chart: mapResultToChart(r),
  }));
}

async function quote(ticker) {
  const symbol = brapiTicker(ticker);
  const url = buildUrl(["quote", symbol], { range: "1d", interval: "1d", fundamental: "false", dividends: "false" });
  const body = await brapiFetch(url);
  const result = (body.results || [])[0];
  if (!result) {
    const e = new Error("Ativo não encontrado");
    e.status = 404;
    throw e;
  }
  return {
    symbol: result.symbol,
    shortName: result.shortName ?? result.longName ?? result.symbol,
    regularMarketPrice: result.regularMarketPrice ?? null,
    regularMarketChangePercent: result.regularMarketChangePercent ?? null,
    currency: result.currency ?? "BRL",
  };
}

function isB3Ticker(normalized) {
  return typeof normalized === "string" && /\.SA$/i.test(normalized);
}

module.exports = {
  chart,
  chartBatch,
  quote,
  isB3Ticker,
  brapiTicker,
  periodToRange,
  setFetchImpl,
  classifyHttpError,
  mapResultToChart,
};
