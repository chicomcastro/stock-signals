import { describe, it, expect } from "vitest";
import sig from "./signals.js";
const { extractDailySignals, aggregateSignals, isWithinDays, DEFAULT_UNIVERSE } = sig;

function mkAnalysis(rows) {
  return {
    analysis: rows.map(r => ({
      cross: { signal: r.cross || "neutral", message: r.crossMsg || "Sem Cruzamento" },
      macd: { signal: r.macd || "neutral", message: r.macdMsg || "Sem cruzamento recente", value: 0 },
      rsi: { signal: r.rsi || "neutral", message: r.rsiMsg || "Neutro", value: r.rsiVal != null ? r.rsiVal : 50 },
      price: { signal: "entry", message: "ok", value: 10 },
    })),
    dates: rows.map(r => r.date),
  };
}

describe("isWithinDays", () => {
  it("accepts dates within window", () => {
    const ref = new Date("2026-05-19T00:00:00Z");
    expect(isWithinDays("2026-05-18T00:00:00Z", ref, 3)).toBe(true);
    expect(isWithinDays("2026-05-16T00:00:00Z", ref, 3)).toBe(true);
    expect(isWithinDays("2026-05-10T00:00:00Z", ref, 3)).toBe(false);
  });
});

describe("extractDailySignals", () => {
  const ref = new Date("2026-05-19T12:00:00Z");

  it("picks up Golden Cross", () => {
    const { analysis, dates } = mkAnalysis([
      { date: "2026-05-18T00:00:00Z", cross: "entry", crossMsg: "Golden Cross (Entrada)" },
    ]);
    const out = extractDailySignals(analysis, dates, 5, ref);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("golden");
  });

  it("picks up Death Cross", () => {
    const { analysis, dates } = mkAnalysis([
      { date: "2026-05-18T00:00:00Z", cross: "exit", crossMsg: "Death Cross (Saída)" },
    ]);
    const out = extractDailySignals(analysis, dates, 5, ref);
    expect(out[0].type).toBe("death");
  });

  it("picks up MACD bullish and bearish crosses", () => {
    const { analysis, dates } = mkAnalysis([
      { date: "2026-05-18T00:00:00Z", macd: "entry", macdMsg: "MACD cruzou acima da linha de sinal (Tendência de alta)" },
      { date: "2026-05-17T00:00:00Z", macd: "exit", macdMsg: "MACD cruzou abaixo da linha de sinal (Tendência de baixa)" },
    ]);
    const out = extractDailySignals(analysis, dates, 5, ref);
    expect(out.find(s => s.type === "bullish_cross")).toBeDefined();
    expect(out.find(s => s.type === "bearish_cross")).toBeDefined();
  });

  it("picks up RSI extremes", () => {
    const { analysis, dates } = mkAnalysis([
      { date: "2026-05-18T00:00:00Z", rsi: "entry", rsiVal: 22, rsiMsg: "Sobrevendido (Entrada)" },
      { date: "2026-05-17T00:00:00Z", rsi: "exit", rsiVal: 78, rsiMsg: "Sobrecomprado (Saída)" },
    ]);
    const out = extractDailySignals(analysis, dates, 5, ref);
    expect(out.find(s => s.type === "rsi_oversold")).toBeDefined();
    expect(out.find(s => s.type === "rsi_overbought")).toBeDefined();
  });

  it("filters out signals beyond recency window", () => {
    const { analysis, dates } = mkAnalysis([
      { date: "2026-01-01T00:00:00Z", cross: "entry", crossMsg: "Golden Cross (Entrada)" },
    ]);
    const out = extractDailySignals(analysis, dates, 5, ref);
    expect(out).toHaveLength(0);
  });

  it("returns empty for empty input", () => {
    expect(extractDailySignals([], [], 5, ref)).toEqual([]);
  });

  it("returns empty when analysis is not an array", () => {
    expect(extractDailySignals(null, [], 5, ref)).toEqual([]);
    expect(extractDailySignals(undefined, [], 5, ref)).toEqual([]);
  });

  it("skips entries with no date", () => {
    const { analysis } = mkAnalysis([{ date: "2026-05-18T00:00:00Z", cross: "entry", crossMsg: "Golden Cross (Entrada)" }]);
    const dates = [null];
    expect(extractDailySignals(analysis, dates, 5, ref)).toEqual([]);
  });
});

describe("aggregateSignals", () => {
  it("buckets signals by type", () => {
    const buckets = aggregateSignals([
      { ticker: "A", signals: [{ type: "golden", date: "2026-05-18" }] },
      { ticker: "B", signals: [{ type: "death", date: "2026-05-18" }, { type: "golden", date: "2026-05-17" }] },
    ]);
    expect(buckets.golden.length).toBe(2);
    expect(buckets.death.length).toBe(1);
    expect(buckets.golden[0].ticker).toBe("A");
  });

  it("ignores unknown types", () => {
    const buckets = aggregateSignals([{ ticker: "A", signals: [{ type: "weird" }] }]);
    expect(buckets.golden).toEqual([]);
  });

  it("sorts each bucket by descending date", () => {
    const buckets = aggregateSignals([
      { ticker: "A", signals: [{ type: "golden", date: "2026-05-01" }] },
      { ticker: "B", signals: [{ type: "golden", date: "2026-05-18" }] },
    ]);
    expect(buckets.golden[0].ticker).toBe("B");
  });
});

describe("DEFAULT_UNIVERSE", () => {
  it("contains a healthy mix of asset classes", () => {
    expect(DEFAULT_UNIVERSE).toContain("PETR4");
    expect(DEFAULT_UNIVERSE).toContain("AAPL");
    expect(DEFAULT_UNIVERSE).toContain("BTC-USD");
    expect(DEFAULT_UNIVERSE).toContain("USDBRL=X");
    expect(DEFAULT_UNIVERSE.length).toBeGreaterThan(20);
  });
});
