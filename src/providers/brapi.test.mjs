import { describe, it, expect, beforeEach, vi } from "vitest";
import brapi from "./brapi.js";

const {
  chart, chartBatch, quote, isB3Ticker, brapiTicker, periodToRange,
  setFetchImpl, classifyHttpError, mapResultToChart,
} = brapi;

function mockFetchOk(body) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }));
}

function mockFetchFail(status, body) {
  return vi.fn(async () => ({
    ok: false,
    status,
    json: async () => body || {},
    text: async () => (typeof body === "string" ? body : JSON.stringify(body || {})),
  }));
}

function makeBrapiResult(symbol, n = 50) {
  const historicalDataPrice = [];
  const start = new Date("2024-01-02").getTime() / 1000;
  for (let i = 0; i < n; i++) {
    historicalDataPrice.push({
      date: start + i * 86400,
      open: 30,
      high: 31,
      low: 29,
      close: 30 + Math.sin(i / 8) * 4,
      volume: 1_000_000,
    });
  }
  return {
    symbol,
    shortName: `${symbol} NAME`,
    longName: `${symbol} LONG NAME`,
    regularMarketPrice: 38,
    regularMarketChangePercent: 1.5,
    currency: "BRL",
    historicalDataPrice,
  };
}

describe("brapiTicker", () => {
  it("strips .SA suffix and uppercases", () => {
    expect(brapiTicker("petr4.sa")).toBe("PETR4");
    expect(brapiTicker("PETR4")).toBe("PETR4");
    expect(brapiTicker("VALE3.SA")).toBe("VALE3");
  });
  it("handles empty/null safely", () => {
    expect(brapiTicker("")).toBe("");
    expect(brapiTicker(null)).toBe("");
    expect(brapiTicker(undefined)).toBe("");
  });
});

describe("periodToRange", () => {
  it("maps periods to brapi range strings", () => {
    expect(periodToRange("1M")).toBe("1mo");
    expect(periodToRange("3M")).toBe("3mo");
    expect(periodToRange("6M")).toBe("6mo");
    expect(periodToRange("1Y")).toBe("1y");
    expect(periodToRange("5Y")).toBe("5y");
    expect(periodToRange("ALL")).toBe("max");
    expect(periodToRange("unknown")).toBe("3mo");
  });
});

describe("isB3Ticker", () => {
  it("identifies B3 by .SA suffix", () => {
    expect(isB3Ticker("PETR4.SA")).toBe(true);
    expect(isB3Ticker("petr4.sa")).toBe(true);
    expect(isB3Ticker("AAPL")).toBe(false);
    expect(isB3Ticker("BTC-USD")).toBe(false);
    expect(isB3Ticker(null)).toBe(false);
    expect(isB3Ticker(undefined)).toBe(false);
  });
});

describe("classifyHttpError", () => {
  it("maps 429 to retryable", () => {
    const e = classifyHttpError(429, "rate limit");
    expect(e.status).toBe(429);
    expect(e.retryable).toBe(true);
  });
  it("maps 404 to not found", () => {
    expect(classifyHttpError(404, "Not Found").status).toBe(404);
  });
  it("maps 500+ to 502 retryable", () => {
    const e = classifyHttpError(503, "boom");
    expect(e.status).toBe(502);
    expect(e.retryable).toBe(true);
  });
  it("maps 401/403 to auth", () => {
    expect(classifyHttpError(401, "no token").status).toBe(401);
    expect(classifyHttpError(403, "forbidden").status).toBe(403);
  });
  it("passes through other status codes", () => {
    expect(classifyHttpError(418, "teapot").status).toBe(418);
  });
});

describe("mapResultToChart", () => {
  it("converts brapi result to {quotes, meta}", () => {
    const r = makeBrapiResult("PETR4", 5);
    const m = mapResultToChart(r);
    expect(m.quotes).toHaveLength(5);
    expect(m.quotes[0].date).toBeInstanceOf(Date);
    expect(m.meta.symbol).toBe("PETR4");
    expect(m.meta.regularMarketPrice).toBe(38);
    expect(m.meta.shortName).toMatch(/PETR4/);
    expect(m.meta.currency).toBe("BRL");
  });

  it("falls back gracefully for missing fields", () => {
    expect(mapResultToChart(null)).toEqual({ quotes: [], meta: {} });
    const m = mapResultToChart({ symbol: "X" });
    expect(m.quotes).toEqual([]);
    expect(m.meta.shortName).toBe("X");
  });

  it("filters out quotes without date/close", () => {
    const r = {
      symbol: "X",
      historicalDataPrice: [
        { date: 1700000000, close: 10 },
        { date: 1700100000, close: null },
        { close: 12 },
        { date: 1700200000, close: 11 },
      ],
    };
    expect(mapResultToChart(r).quotes).toHaveLength(2);
  });
});

describe("chart()", () => {
  beforeEach(() => {
    setFetchImpl(null);
  });

  it("fetches and returns mapped result", async () => {
    setFetchImpl(mockFetchOk({ results: [makeBrapiResult("PETR4", 10)] }));
    const r = await chart("PETR4.SA", { period: "3M" });
    expect(r.quotes).toHaveLength(10);
    expect(r.meta.symbol).toBe("PETR4");
  });

  it("throws 404 when no results", async () => {
    setFetchImpl(mockFetchOk({ results: [] }));
    await expect(chart("INVALID.SA", { period: "3M" })).rejects.toMatchObject({ status: 404 });
  });

  it("throws classified error on http failure", async () => {
    setFetchImpl(mockFetchFail(429, "rate limit"));
    await expect(chart("PETR4.SA")).rejects.toMatchObject({ status: 429, retryable: true });
  });

  it("throws when fetch is unavailable", async () => {
    setFetchImpl(null);
    await expect(chart("PETR4.SA")).rejects.toThrow(/fetch indisponível/);
  });
});

describe("chartBatch()", () => {
  it("returns one entry per symbol", async () => {
    setFetchImpl(mockFetchOk({
      results: [makeBrapiResult("PETR4"), makeBrapiResult("VALE3")],
    }));
    const r = await chartBatch(["PETR4.SA", "VALE3.SA"], { period: "3M" });
    expect(r).toHaveLength(2);
    expect(r[0].symbol).toBe("PETR4");
    expect(r[0].chart.quotes.length).toBeGreaterThan(0);
  });

  it("returns empty array for empty input", async () => {
    setFetchImpl(mockFetchOk({ results: [] }));
    const r = await chartBatch([], { period: "3M" });
    expect(r).toEqual([]);
  });

  it("propagates http errors", async () => {
    setFetchImpl(mockFetchFail(500, "boom"));
    await expect(chartBatch(["PETR4.SA"])).rejects.toMatchObject({ status: 502 });
  });
});

describe("quote()", () => {
  it("returns normalized summary", async () => {
    setFetchImpl(mockFetchOk({ results: [makeBrapiResult("PETR4")] }));
    const q = await quote("PETR4.SA");
    expect(q.symbol).toBe("PETR4");
    expect(q.regularMarketPrice).toBe(38);
    expect(q.currency).toBe("BRL");
  });

  it("throws 404 when not found", async () => {
    setFetchImpl(mockFetchOk({ results: [] }));
    await expect(quote("BAD.SA")).rejects.toMatchObject({ status: 404 });
  });
});
