import { describe, it, expect } from "vitest";
import tickerMod from "./ticker.js";
const { normalizeTicker, displayTicker, isValidTickerInput } = tickerMod;

describe("normalizeTicker", () => {
  it("adds .SA suffix to B3 tickers", () => {
    expect(normalizeTicker("PETR4")).toBe("PETR4.SA");
    expect(normalizeTicker("petr4")).toBe("PETR4.SA");
    expect(normalizeTicker("BBAS3")).toBe("BBAS3.SA");
    expect(normalizeTicker("HGLG11")).toBe("HGLG11.SA");
    expect(normalizeTicker("AAPL34")).toBe("AAPL34.SA");
  });

  it("leaves tickers with explicit suffix untouched", () => {
    expect(normalizeTicker("PETR4.SA")).toBe("PETR4.SA");
    expect(normalizeTicker("AAPL")).toBe("AAPL");
    expect(normalizeTicker("BTC-USD")).toBe("BTC-USD");
    expect(normalizeTicker("USDBRL=X")).toBe("USDBRL=X");
    expect(normalizeTicker("^BVSP")).toBe("^BVSP");
  });

  it("uppercases input", () => {
    expect(normalizeTicker("aapl")).toBe("AAPL");
  });

  it("rejects invalid input", () => {
    expect(() => normalizeTicker("<script>")).toThrow();
    expect(() => normalizeTicker("petr4'")).toThrow();
    expect(() => normalizeTicker("")).toThrow();
    expect(() => normalizeTicker("a".repeat(20))).toThrow();
  });
});

describe("displayTicker", () => {
  it("strips .SA suffix", () => {
    expect(displayTicker("PETR4.SA")).toBe("PETR4");
    expect(displayTicker("AAPL")).toBe("AAPL");
    expect(displayTicker("BTC-USD")).toBe("BTC-USD");
  });
});

describe("isValidTickerInput", () => {
  it("accepts valid forms", () => {
    expect(isValidTickerInput("PETR4")).toBe(true);
    expect(isValidTickerInput("BTC-USD")).toBe(true);
    expect(isValidTickerInput("USDBRL=X")).toBe(true);
    expect(isValidTickerInput("^BVSP")).toBe(true);
  });

  it("rejects injection attempts", () => {
    expect(isValidTickerInput("<script>")).toBe(false);
    expect(isValidTickerInput("../etc")).toBe(false);
    expect(isValidTickerInput("AAPL;rm")).toBe(false);
    expect(isValidTickerInput("")).toBe(false);
  });
});
