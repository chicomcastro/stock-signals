import { describe, it, expect } from "vitest";
import bt from "./backtest.js";
const { backtestSignal, backtestAllForTicker, returnAfter, mean, median, hitRate } = bt;

describe("returnAfter", () => {
  it("computes simple return", () => {
    expect(returnAfter([10, 11, 12], 0, 1)).toBeCloseTo(0.1);
    expect(returnAfter([10, 11, 12], 0, 2)).toBeCloseTo(0.2);
  });
  it("returns null if target out of bounds", () => {
    expect(returnAfter([10, 11], 0, 5)).toBeNull();
  });
  it("handles nulls and zeros", () => {
    expect(returnAfter([null, 11, 12], 0, 1)).toBeNull();
    expect(returnAfter([0, 1, 2], 0, 1)).toBeNull();
  });
});

describe("stats helpers", () => {
  it("mean / median / hitRate", () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(hitRate([1, -1, 2], (r) => r > 0)).toBeCloseTo(2 / 3);
    expect(mean([])).toBeNull();
    expect(median([])).toBeNull();
    expect(hitRate([], () => true)).toBeNull();
  });
});

function makeSeries(n) {
  const dates = [];
  const closes = [];
  const start = new Date("2024-01-02").getTime();
  for (let i = 0; i < n; i++) {
    dates.push(new Date(start + i * 86400000).toISOString());
    closes.push(100 + i * 0.5);
  }
  return { dates, closes };
}

describe("backtestSignal", () => {
  it("returns zero stats when no signal dates", () => {
    const { dates, closes } = makeSeries(120);
    const r = backtestSignal(closes, dates, [], [30, 60]);
    expect(r.n).toBe(0);
    expect(r.horizons[30].n).toBe(0);
  });

  it("computes positive returns for monotonic uptrend", () => {
    const { dates, closes } = makeSeries(120);
    const signalDates = [dates[5], dates[10], dates[15]];
    const r = backtestSignal(closes, dates, signalDates, [30]);
    expect(r.n).toBe(3);
    expect(r.horizons[30].n).toBe(3);
    expect(r.horizons[30].avg).toBeGreaterThan(0);
    expect(r.horizons[30].hitRate).toBe(1);
  });

  it("falls back gracefully on invalid inputs", () => {
    expect(backtestSignal(null, [], [])).toEqual({ n: 0, horizons: {} });
  });

  it("skips signals where horizon exceeds available data", () => {
    const { dates, closes } = makeSeries(40);
    const signalDates = [dates[35]];
    const r = backtestSignal(closes, dates, signalDates, [30]);
    expect(r.horizons[30].n).toBe(0);
  });
});

describe("backtestAllForTicker", () => {
  it("returns stats per signal type from a full data payload", () => {
    const { dates, closes } = makeSeries(200);
    const data = {
      closePrices: closes,
      dates,
      crossPoints: [
        { type: "golden", date: dates[10] },
        { type: "death", date: dates[50] },
      ],
      macdCrossPoints: [
        { type: "bullish_cross", date: dates[20] },
        { type: "bearish_cross", date: dates[80] },
      ],
    };
    const result = backtestAllForTicker(data, [30]);
    expect(result.golden.n).toBe(1);
    expect(result.death.n).toBe(1);
    expect(result.bullish_cross.n).toBe(1);
    expect(result.bearish_cross.n).toBe(1);
  });

  it("handles missing crossPoints", () => {
    const { dates, closes } = makeSeries(40);
    const r = backtestAllForTicker({ closePrices: closes, dates }, [30]);
    expect(r.golden.n).toBe(0);
  });
});
