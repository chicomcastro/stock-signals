import { describe, it, expect } from "vitest";
import indicators from "./indicators.js";

const {
  findMaCrossPoints,
  findMacdSignalCrossPoints,
  analyzePrice,
  analyzeRSI,
  analyzeMACD,
  analyzeCross,
  computeIndicators,
  alignToDates,
} = indicators;

describe("findMaCrossPoints", () => {
  it("detects golden cross when sma50 crosses above sma200", () => {
    const sma50 = [10, 11, 12, 13, 14];
    const sma200 = [15, 14, 13, 12, 11];
    const dates = ["d1", "d2", "d3", "d4", "d5"];
    const closes = [100, 101, 102, 103, 104];
    const points = findMaCrossPoints(sma50, sma200, dates, closes);
    expect(points).toHaveLength(1);
    expect(points[0].type).toBe("golden");
  });

  it("detects death cross", () => {
    const sma50 = [15, 14, 13, 12, 11];
    const sma200 = [10, 11, 12, 13, 14];
    const points = findMaCrossPoints(sma50, sma200, ["d1", "d2", "d3", "d4", "d5"], [1, 2, 3, 4, 5]);
    expect(points).toHaveLength(1);
    expect(points[0].type).toBe("death");
  });

  it("ignores leading nulls", () => {
    const sma50 = [null, null, 10, 12];
    const sma200 = [null, null, 12, 10];
    const points = findMaCrossPoints(sma50, sma200, ["a", "b", "c", "d"], [1, 2, 3, 4]);
    expect(points).toHaveLength(1);
    expect(points[0].type).toBe("golden");
  });
});

describe("findMacdSignalCrossPoints (MACD vs signal, not zero)", () => {
  it("detects bullish cross: MACD line crosses above signal line", () => {
    const macdLine = [-1, -0.5, 0.5];
    const macdSignal = [0, 0, 0];
    const points = findMacdSignalCrossPoints(macdLine, macdSignal, ["a", "b", "c"], [10, 11, 12]);
    expect(points).toHaveLength(1);
    expect(points[0].type).toBe("bullish_cross");
    expect(points[0].date).toBe("c");
  });

  it("detects bearish cross: MACD line crosses below signal line", () => {
    const macdLine = [1, 0.5, -0.5];
    const macdSignal = [0, 0, 0];
    const points = findMacdSignalCrossPoints(macdLine, macdSignal, ["a", "b", "c"], [10, 11, 12]);
    expect(points).toHaveLength(1);
    expect(points[0].type).toBe("bearish_cross");
  });

  it("does NOT report cross when only zero-line is crossed but line stays below signal", () => {
    const macdLine = [-2, -1, 0.5];
    const macdSignal = [3, 3, 3];
    const points = findMacdSignalCrossPoints(macdLine, macdSignal, ["a", "b", "c"], [10, 11, 12]);
    expect(points).toHaveLength(0);
  });
});

describe("analyzePrice", () => {
  it("returns entry when price above SMA200", () => {
    expect(analyzePrice(100, 90).signal).toBe("entry");
  });
  it("returns exit when below", () => {
    expect(analyzePrice(80, 90).signal).toBe("exit");
  });
  it("returns neutral when no SMA200", () => {
    expect(analyzePrice(100, null).signal).toBe("neutral");
  });
});

describe("analyzeRSI", () => {
  it("flags overbought", () => {
    expect(analyzeRSI(80).signal).toBe("exit");
  });
  it("flags oversold", () => {
    expect(analyzeRSI(20).signal).toBe("entry");
  });
  it("neutral in middle", () => {
    expect(analyzeRSI(50).signal).toBe("neutral");
  });
  it("handles null", () => {
    expect(analyzeRSI(null).signal).toBe("neutral");
  });
});

describe("analyzeMACD (vs signal line)", () => {
  it("signals entry on bullish cross", () => {
    const r = analyzeMACD(0.5, 0, -0.5, 0, 0.5);
    expect(r.signal).toBe("entry");
    expect(r.message).toMatch(/acima da linha de sinal/i);
  });

  it("signals exit on bearish cross", () => {
    const r = analyzeMACD(-0.5, 0, 0.5, 0, -0.5);
    expect(r.signal).toBe("exit");
    expect(r.message).toMatch(/abaixo da linha de sinal/i);
  });

  it("returns position (above signal) without recent cross", () => {
    const r = analyzeMACD(2, 1, 2.1, 1, 1);
    expect(r.signal).toBe("entry");
    expect(r.message).toMatch(/acima da linha de sinal/i);
  });

  it("returns null-safe neutral", () => {
    const r = analyzeMACD(null, null, null, null, null);
    expect(r.signal).toBe("neutral");
  });
});

describe("analyzeCross", () => {
  it("emits Golden Cross on transition", () => {
    expect(analyzeCross(12, 11, 10, 11).message).toMatch(/Golden Cross/);
  });
  it("emits Death Cross on transition", () => {
    expect(analyzeCross(10, 11, 12, 11).message).toMatch(/Death Cross/);
  });
  it("returns position when no transition", () => {
    expect(analyzeCross(12, 11, 12, 11).message).toMatch(/MA50 acima/);
  });
});

describe("analyzeIndicators", () => {
  it("returns full analysis for a given index", () => {
    const data = {
      dates: ["d1", "d2", "d3"],
      closePrices: [100, 102, 101],
      sma50: [null, 100, 101],
      sma200: [null, 99, 100],
      rsi: [null, 55, 60],
      macdLine: [null, 0.5, 0.7],
      macdSignal: [null, 0.4, 0.5],
      macdHistogram: [null, 0.1, 0.2],
    };
    const r = indicators.analyzeIndicators(data, 2);
    expect(r.date).toBe("d3");
    expect(r.price.signal).toBe("entry");
    expect(r.rsi.signal).toBe("neutral");
    expect(r.macd.signal).toBe("entry");
    expect(r.cross.signal).toBe("entry");
  });
});

describe("analyzeCross null edge cases", () => {
  it("returns neutral when smas are missing", () => {
    expect(analyzeCross(null, 10, null, null).signal).toBe("neutral");
    expect(analyzeCross(10, null, null, null).signal).toBe("neutral");
  });

  it("returns position-only when previous values are missing", () => {
    const above = analyzeCross(12, 10, null, null);
    expect(above.signal).toBe("entry");
    const below = analyzeCross(10, 12, null, null);
    expect(below.signal).toBe("exit");
  });
});

describe("alignToDates", () => {
  it("pads with nulls so values align to end of series", () => {
    const aligned = alignToDates([5, 6, 7], 5, 3);
    expect(aligned).toEqual([null, null, 5, 6, 7]);
  });
  it("truncates if necessary", () => {
    const aligned = alignToDates([1, 2, 3, 4, 5], 3, 1);
    expect(aligned).toHaveLength(3);
  });
});

describe("computeIndicators (integration on known series)", () => {
  it("returns arrays aligned to closePrices length", () => {
    const closes = Array.from({ length: 250 }, (_, i) => 100 + Math.sin(i / 10) * 5);
    const r = computeIndicators(closes);
    expect(r.sma50).toHaveLength(closes.length);
    expect(r.sma200).toHaveLength(closes.length);
    expect(r.rsi).toHaveLength(closes.length);
    expect(r.macdLine).toHaveLength(closes.length);
    expect(r.macdSignal).toHaveLength(closes.length);
    expect(r.macdHistogram).toHaveLength(closes.length);
    expect(r.sma50[49]).not.toBeNull();
    expect(r.sma50[48]).toBeNull();
    expect(r.sma200[199]).not.toBeNull();
    expect(r.sma200[198]).toBeNull();
  });
});
