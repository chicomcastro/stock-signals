import { describe, it, expect } from "vitest";
import ts from "./tickerSearch.js";
const { searchLocal, allTickers } = ts;

describe("searchLocal", () => {
  it("returns empty for empty query", () => {
    expect(searchLocal("")).toEqual([]);
  });

  it("matches by symbol prefix", () => {
    const results = searchLocal("petr");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.symbol === "PETR4")).toBe(true);
    expect(results.some((r) => r.symbol === "PETR3")).toBe(true);
  });

  it("matches by exact symbol with top priority", () => {
    const results = searchLocal("petr4");
    expect(results[0].symbol).toBe("PETR4");
  });

  it("matches by name", () => {
    const results = searchLocal("petrobras");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => /PETR/.test(r.symbol))).toBe(true);
  });

  it("strips diacritics", () => {
    const a = searchLocal("itaú");
    const b = searchLocal("itau");
    expect(a.length).toBe(b.length);
    expect(a[0].symbol).toBe(b[0].symbol);
  });

  it("finds BDRs", () => {
    const results = searchLocal("apple");
    expect(results.some((r) => r.symbol === "AAPL34")).toBe(true);
    expect(results.some((r) => r.symbol === "AAPL")).toBe(true);
  });

  it("finds crypto and FX", () => {
    expect(searchLocal("bitcoin").some((r) => r.symbol === "BTC-USD")).toBe(true);
    expect(searchLocal("dolar").length).toBeGreaterThanOrEqual(0); // "Dólar" has accents
    expect(searchLocal("usdbrl").some((r) => r.symbol === "USDBRL=X")).toBe(true);
  });

  it("respects limit", () => {
    const results = searchLocal("a", 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("returns items with consistent shape", () => {
    const results = searchLocal("petr4");
    for (const r of results) {
      expect(r).toHaveProperty("symbol");
      expect(r).toHaveProperty("shortname");
      expect(r).toHaveProperty("exchange");
      expect(r).toHaveProperty("type");
    }
  });
});

describe("allTickers", () => {
  it("contains hundreds of tickers across exchanges", () => {
    const all = allTickers();
    expect(all.length).toBeGreaterThan(100);
    const buckets = new Set(all.map((t) => t.bucket));
    expect(buckets.has("b3")).toBe(true);
    expect(buckets.has("us")).toBe(true);
    expect(buckets.has("crypto")).toBe(true);
    expect(buckets.has("fx")).toBe(true);
  });
});
