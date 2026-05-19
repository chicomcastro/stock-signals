import { describe, it, expect } from "vitest";
import copy from "./copy.js";
const { FRIENDLY, describeSignal, describeIndicator, describePeriod, describeAction } = copy;

describe("describeSignal", () => {
  it("returns friendly label for known signals", () => {
    expect(describeSignal("golden").label).toMatch(/alta/i);
    expect(describeSignal("death").label).toMatch(/baixa/i);
    expect(describeSignal("bullish_cross").label).toMatch(/MACD/i);
    expect(describeSignal("rsi_oversold").label).toMatch(/sobrevenda/i);
  });
  it("falls back gracefully for unknown signals", () => {
    expect(describeSignal("invented").label).toBe("invented");
  });
});

describe("describeIndicator", () => {
  it("explains indicators in plain language", () => {
    expect(describeIndicator("rsi").explain.length).toBeGreaterThan(20);
    expect(describeIndicator("macd").explain).toMatch(/momentum|cruz/i);
  });
});

describe("describePeriod", () => {
  it("translates period codes to readable labels", () => {
    expect(describePeriod("1Y").label).toBe("1 ano");
    expect(describePeriod("ALL").label).toBe("Tudo");
  });
});

describe("describeAction", () => {
  it("provides emoji + label per signal type", () => {
    expect(describeAction("entry").emoji).toBe("📈");
    expect(describeAction("exit").emoji).toBe("📉");
    expect(describeAction("neutral").emoji).toBe("➖");
  });
  it("defaults to neutral for unknown", () => {
    expect(describeAction("nope").label).toBe("Neutro");
  });
});

describe("FRIENDLY content", () => {
  it("exposes all expected signal keys", () => {
    for (const key of ["golden", "death", "bullish_cross", "bearish_cross", "rsi_oversold", "rsi_overbought"]) {
      expect(FRIENDLY.signals[key]).toBeDefined();
      expect(FRIENDLY.signals[key].tooltip.length).toBeGreaterThan(20);
    }
  });
});
