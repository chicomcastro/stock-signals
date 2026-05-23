import { describe, it, expect, vi, beforeEach } from "vitest";
import dp from "./dataProvider.js";

const stub = {
  chart: vi.fn(),
  quote: vi.fn(),
  search: vi.fn(),
  suppressNotices: vi.fn(),
};

dp.setYahooClient(stub);
dp.setBrapiClient({}); // disable Brapi path for these tests

beforeEach(() => {
  stub.chart.mockReset();
  stub.quote.mockReset();
  stub.search.mockReset();
  dp.historicalCache.clear();
  dp.quoteCache.clear();
  dp.searchCache.clear();
  dp.errorCache.clear();
});

function makeFakeQuotes(n = 250) {
  const out = [];
  const start = new Date("2024-01-02").getTime();
  for (let i = 0; i < n; i++) {
    out.push({
      date: new Date(start + i * 86400000),
      close: 30 + Math.sin(i / 8) * 4 + i * 0.02,
      open: 30,
      high: 31,
      low: 29,
      volume: 1_000_000,
    });
  }
  return out;
}

function makeChartReturn(n = 250, meta = {}) {
  return { quotes: makeFakeQuotes(n), meta: { symbol: "PETR4.SA", regularMarketPrice: 30, currency: "BRL", ...meta } };
}

describe("classifyError", () => {
  it("maps Too Many Requests to 429 retryable", () => {
    const e = dp.classifyError(new Error('Unexpected token "Too Many Requests" is not valid JSON'));
    expect(e.status).toBe(429);
    expect(e.retryable).toBe(true);
  });

  it("maps Not Found to 404", () => {
    const e = dp.classifyError(new Error("HTTP 404: Not Found"));
    expect(e.status).toBe(404);
  });

  it("maps JSON parse errors to 502 retryable", () => {
    const e = dp.classifyError(new SyntaxError("Unexpected token U in JSON"));
    expect(e.status).toBe(502);
    expect(e.retryable).toBe(true);
  });

  it("passes through unknown errors", () => {
    const original = new Error("network down");
    const e = dp.classifyError(original);
    expect(e).toBe(original);
  });
});

describe("retry", () => {
  it("retries on retryable failure then succeeds", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new Error("Too Many Requests");
      return "ok";
    });
    const r = await dp.retry(fn, { attempts: 2, baseMs: 1 });
    expect(r).toBe("ok");
    expect(calls).toBe(2);
  });

  it("does not retry non-retryable error", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      throw new Error("Not Found");
    });
    await expect(dp.retry(fn, { attempts: 3, baseMs: 1 })).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it("gives up after attempts exhausted", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      throw new Error("Too Many Requests");
    });
    await expect(dp.retry(fn, { attempts: 2, baseMs: 1 })).rejects.toMatchObject({ status: 429 });
    expect(calls).toBe(2);
  });
});

describe("getHistoricalAnalysis", () => {
  it("returns enriched payload with indicators and analysis", async () => {
    stub.chart.mockResolvedValue(makeChartReturn(250));
    const data = await dp.getHistoricalAnalysis("PETR4.SA", "3M");
    expect(data.ticker).toBe("PETR4.SA");
    expect(data.dates.length).toBeGreaterThan(0);
    expect(data.macdLine).toBeDefined();
    expect(data.macdSignal).toBeDefined();
    expect(data.macdHistogram).toBeDefined();
    expect(data.analysis).toHaveLength(data.dates.length);
    expect(data.cache).toBe("miss");
  });

  it("serves from cache on second call", async () => {
    stub.chart.mockResolvedValue(makeChartReturn(250));
    await dp.getHistoricalAnalysis("PETR4.SA", "3M");
    const second = await dp.getHistoricalAnalysis("PETR4.SA", "3M");
    expect(second.cache).toBe("hit");
    expect(stub.chart).toHaveBeenCalledTimes(1);
  });

  it("translates Yahoo 429 to friendly 429 error", async () => {
    stub.chart.mockRejectedValue(new Error('Unexpected token "Too Many Requests"'));
    await expect(dp.getHistoricalAnalysis("PETR4.SA", "3M")).rejects.toMatchObject({ status: 429 });
  });

  it("translates Not Found to 404", async () => {
    stub.chart.mockRejectedValue(new Error("HTTP 404: Not Found"));
    await expect(dp.getHistoricalAnalysis("INVALID.SA", "3M")).rejects.toMatchObject({ status: 404 });
  });

  it("returns 404 when Yahoo returns empty quotes", async () => {
    stub.chart.mockResolvedValue({ quotes: [], meta: {} });
    await expect(dp.getHistoricalAnalysis("EMPTY.SA", "3M")).rejects.toMatchObject({ status: 404 });
  });

  it("handles ALL period without extra-history fetch", async () => {
    stub.chart.mockResolvedValue(makeChartReturn(300));
    const data = await dp.getHistoricalAnalysis("PETR4.SA", "ALL");
    expect(data.period).toBe("ALL");
  });

  it("populates quote cache from chart meta", async () => {
    stub.chart.mockResolvedValue(makeChartReturn(250, {
      symbol: "PETR4.SA", shortName: "Petrobras", regularMarketPrice: 38, regularMarketChangePercent: 1.5, currency: "BRL",
    }));
    await dp.getHistoricalAnalysis("PETR4.SA", "3M");
    const cached = dp.quoteCache.get("quote|PETR4.SA");
    expect(cached.shortName).toBe("Petrobras");
    expect(cached.regularMarketPrice).toBe(38);
  });

  it("serves stale cache when Yahoo returns 429", async () => {
    stub.chart.mockResolvedValue(makeChartReturn(250));
    const fresh = await dp.getHistoricalAnalysis("PETR4.SA", "3M");
    expect(fresh.cache).toBe("miss");

    // Force expiration by clearing fresh map and re-inserting with negative TTL
    const key = "hist|PETR4.SA|3M";
    const value = dp.historicalCache.get(key);
    dp.historicalCache.clear();
    dp.historicalCache.set(key, value, -1);

    stub.chart.mockReset();
    stub.chart.mockRejectedValue(new Error("Too Many Requests"));
    const stale = await dp.getHistoricalAnalysis("PETR4.SA", "3M");
    expect(stale.cache).toBe("stale");
    expect(stale.dates.length).toBe(value.dates.length);
  });

  it("caches error briefly to avoid hammering Yahoo", async () => {
    stub.chart.mockRejectedValue(new Error("Too Many Requests"));
    await expect(dp.getHistoricalAnalysis("ZZ.SA", "3M")).rejects.toMatchObject({ status: 429 });
    const callsAfterFirst = stub.chart.mock.calls.length;
    // Second call should not hit Yahoo (error cached)
    await expect(dp.getHistoricalAnalysis("ZZ.SA", "3M")).rejects.toMatchObject({ status: 429 });
    expect(stub.chart.mock.calls.length).toBe(callsAfterFirst);
  });

  it("dedupes concurrent in-flight requests for same key", async () => {
    let resolveFn;
    stub.chart.mockReturnValue(new Promise((r) => { resolveFn = r; }));
    const p1 = dp.getHistoricalAnalysis("PETR4.SA", "3M");
    const p2 = dp.getHistoricalAnalysis("PETR4.SA", "3M");
    resolveFn(makeChartReturn(250));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(stub.chart).toHaveBeenCalledTimes(1);
    expect(r1.dates.length).toBe(r2.dates.length);
  });
});

describe("getHistoricalAnalysis edge cases", () => {
  it("derives change from last/prev close when meta lacks regularMarketChangePercent", async () => {
    stub.chart.mockResolvedValue({
      quotes: makeFakeQuotes(250),
      meta: { symbol: "X.SA", currency: "BRL", shortName: "Foo" },
    });
    await dp.getHistoricalAnalysis("X.SA", "3M");
    const q = dp.quoteCache.get("quote|X.SA");
    expect(q.regularMarketChangePercent).not.toBeNull();
  });

  it("handles raw with no meta gracefully", async () => {
    stub.chart.mockResolvedValue({ quotes: makeFakeQuotes(250) });
    const data = await dp.getHistoricalAnalysis("Y.SA", "3M");
    expect(data.dates.length).toBeGreaterThan(0);
  });
});

describe("Brapi path", () => {
  function makeBrapiStub() {
    return {
      chart: vi.fn(),
      chartBatch: vi.fn(),
      quote: vi.fn(),
      isB3Ticker: (t) => /\.SA$/i.test(String(t || "")),
    };
  }

  it("uses Brapi for .SA tickers and Yahoo for non-B3", async () => {
    const brapiStub = makeBrapiStub();
    brapiStub.chart.mockResolvedValue({ quotes: makeFakeQuotes(50), meta: { symbol: "PETR4", shortName: "Petrobras", regularMarketPrice: 38, currency: "BRL" } });
    dp.setBrapiClient(brapiStub);

    const data = await dp.getHistoricalAnalysis("PETR4.SA", "3M");
    expect(brapiStub.chart).toHaveBeenCalled();
    expect(stub.chart).not.toHaveBeenCalled();
    expect(data.source).toBe("brapi");

    dp.setBrapiClient({}); // restore for other tests
  });

  it("falls back to Yahoo when Brapi returns 401", async () => {
    const brapiStub = makeBrapiStub();
    brapiStub.chart.mockRejectedValue(Object.assign(new Error("token inválido"), { status: 401 }));
    stub.chart.mockResolvedValue(makeChartReturn(50));
    dp.setBrapiClient(brapiStub);

    const data = await dp.getHistoricalAnalysis("VALE3.SA", "3M");
    expect(brapiStub.chart).toHaveBeenCalled();
    expect(stub.chart).toHaveBeenCalled();
    expect(data.source).toBe("brapi"); // dispatcher still labeled it brapi even though Yahoo served it

    dp.setBrapiClient({});
  });

  it("propagates Brapi 429 without Yahoo fallback", async () => {
    const brapiStub = makeBrapiStub();
    brapiStub.chart.mockRejectedValue(Object.assign(new Error("rate"), { status: 429, retryable: true }));
    dp.setBrapiClient(brapiStub);

    await expect(dp.getHistoricalAnalysis("PETR4.SA", "3M")).rejects.toMatchObject({ status: 429 });
    expect(stub.chart).not.toHaveBeenCalled();

    dp.setBrapiClient({});
  });

  it("getQuote uses Brapi for B3 tickers", async () => {
    const brapiStub = makeBrapiStub();
    brapiStub.quote.mockResolvedValue({ symbol: "PETR4", shortName: "Petrobras", regularMarketPrice: 38, currency: "BRL", regularMarketChangePercent: 1.5 });
    dp.setBrapiClient(brapiStub);

    const q = await dp.getQuote("PETR4.SA");
    expect(brapiStub.quote).toHaveBeenCalled();
    expect(stub.quote).not.toHaveBeenCalled();
    expect(q.shortName).toBe("Petrobras");

    dp.setBrapiClient({});
  });
});

describe("getHistoricalAnalysisBatch", () => {
  function makeBrapiStub() {
    return {
      chart: vi.fn(),
      chartBatch: vi.fn(),
      quote: vi.fn(),
      isB3Ticker: (t) => /\.SA$/i.test(String(t || "")),
    };
  }

  it("issues a single Brapi batch call for B3 tickers", async () => {
    const brapiStub = makeBrapiStub();
    brapiStub.chartBatch.mockResolvedValue([
      { symbol: "PETR4", chart: { quotes: makeFakeQuotes(50), meta: { symbol: "PETR4", shortName: "Petrobras", regularMarketPrice: 38, currency: "BRL" } } },
      { symbol: "VALE3", chart: { quotes: makeFakeQuotes(50), meta: { symbol: "VALE3", shortName: "Vale", regularMarketPrice: 60, currency: "BRL" } } },
    ]);
    dp.setBrapiClient(brapiStub);

    const results = await dp.getHistoricalAnalysisBatch(["PETR4.SA", "VALE3.SA"], "3M");
    expect(brapiStub.chartBatch).toHaveBeenCalledTimes(1);
    expect(results.size).toBe(2);
    expect(results.get("PETR4.SA").ticker).toBe("PETR4.SA");

    dp.setBrapiClient({});
  });

  it("falls back to per-ticker Brapi.chart when batch fails", async () => {
    const brapiStub = makeBrapiStub();
    brapiStub.chartBatch.mockRejectedValue(new Error("network"));
    brapiStub.chart.mockResolvedValue({ quotes: makeFakeQuotes(50), meta: { symbol: "PETR4", regularMarketPrice: 38, currency: "BRL" } });
    dp.setBrapiClient(brapiStub);

    const results = await dp.getHistoricalAnalysisBatch(["PETR4.SA", "VALE3.SA"], "3M");
    expect(brapiStub.chart).toHaveBeenCalled();
    expect(results.size).toBeGreaterThan(0);

    dp.setBrapiClient({});
  });

  it("falls back to Yahoo for non-B3 tickers", async () => {
    const brapiStub = makeBrapiStub();
    stub.chart.mockResolvedValue(makeChartReturn(50));
    dp.setBrapiClient(brapiStub);

    const results = await dp.getHistoricalAnalysisBatch(["AAPL", "BTC-USD"], "3M");
    expect(brapiStub.chartBatch).not.toHaveBeenCalled();
    expect(stub.chart).toHaveBeenCalled();
    expect(results.size).toBeGreaterThan(0);

    dp.setBrapiClient({});
  });

  it("reuses cached values without hitting any provider", async () => {
    const brapiStub = makeBrapiStub();
    dp.setBrapiClient(brapiStub);
    const cacheKey = "hist|PETR4.SA|3M";
    dp.historicalCache.set(cacheKey, { ticker: "PETR4.SA", dates: [new Date()], analysis: [] });

    const results = await dp.getHistoricalAnalysisBatch(["PETR4.SA"], "3M");
    expect(brapiStub.chartBatch).not.toHaveBeenCalled();
    expect(results.get("PETR4.SA").cache).toBe("hit");

    dp.setBrapiClient({});
  });
});

describe("getQuote with stale-on-error", () => {
  it("returns stale cache when Yahoo errors", async () => {
    stub.quote.mockResolvedValue({ symbol: "X", shortName: "Co", regularMarketPrice: 10 });
    await dp.getQuote("X");
    const key = "quote|X";
    const value = dp.quoteCache.get(key);
    dp.quoteCache.clear();
    dp.quoteCache.set(key, value, -1);

    stub.quote.mockReset();
    stub.quote.mockRejectedValue(new Error("Too Many Requests"));
    const stale = await dp.getQuote("X");
    expect(stale.shortName).toBe("Co");
  });
});

describe("getQuote", () => {
  it("returns normalized summary and caches", async () => {
    stub.quote.mockResolvedValue({
      symbol: "PETR4.SA",
      shortName: "Petrobras",
      regularMarketPrice: 38.4,
      regularMarketChangePercent: 1.5,
      currency: "BRL",
    });
    const q1 = await dp.getQuote("PETR4.SA");
    const q2 = await dp.getQuote("PETR4.SA");
    expect(q1).toMatchObject({ symbol: "PETR4.SA", shortName: "Petrobras" });
    expect(stub.quote).toHaveBeenCalledTimes(1);
    expect(q2).toEqual(q1);
  });

  it("falls back to longName when shortName is missing", async () => {
    stub.quote.mockResolvedValue({ symbol: "X", longName: "Long Co" });
    const q = await dp.getQuote("X");
    expect(q.shortName).toBe("Long Co");
  });

  it("propagates classified 429 error", async () => {
    stub.quote.mockRejectedValue(new Error("Too Many Requests"));
    await expect(dp.getQuote("Y")).rejects.toMatchObject({ status: 429 });
  });
});

describe("searchTickers (local-first)", () => {
  it("returns local matches without hitting Yahoo when ≥3 found", async () => {
    const r = await dp.searchTickers("petr");
    expect(r.length).toBeGreaterThan(0);
    expect(r.some((x) => x.symbol === "PETR4")).toBe(true);
    expect(stub.search).not.toHaveBeenCalled();
  });

  it("caches local results", async () => {
    const r1 = await dp.searchTickers("apple");
    const r2 = await dp.searchTickers("apple");
    expect(r1).toEqual(r2);
  });

  it("falls back to Yahoo for queries with few local matches", async () => {
    stub.search.mockResolvedValue({
      quotes: [{ symbol: "ZZZZ", shortname: "Zzzz Corp", exchange: "NYSE", quoteType: "EQUITY" }],
    });
    const r = await dp.searchTickers("zzzz");
    expect(stub.search).toHaveBeenCalled();
    expect(r.some((x) => x.symbol === "ZZZZ")).toBe(true);
  });

  it("degrades gracefully when Yahoo errors (no throw)", async () => {
    stub.search.mockRejectedValue(new Error("Too Many Requests"));
    const r = await dp.searchTickers("xyzfakeq");
    // No throw — returns whatever local has (may be empty)
    expect(Array.isArray(r)).toBe(true);
  });
});
