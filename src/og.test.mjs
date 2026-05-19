import { describe, it, expect } from "vitest";
import og from "./og.js";
const { tickerOgSvg, defaultOgSvg, escapeXml } = og;

describe("escapeXml", () => {
  it("escapes special chars", () => {
    expect(escapeXml(`<script>alert('x')</script>`)).toBe(
      "&lt;script&gt;alert(&apos;x&apos;)&lt;/script&gt;"
    );
    expect(escapeXml(`"&"`)).toBe("&quot;&amp;&quot;");
  });

  it("handles non-string input", () => {
    expect(escapeXml(123)).toBe("123");
  });
});

describe("tickerOgSvg", () => {
  it("renders SVG with ticker and price", () => {
    const svg = tickerOgSvg({
      ticker: "PETR4",
      name: "Petrobras",
      price: 38.42,
      changePercent: 1.83,
      currency: "BRL",
      signalLabel: "Análise",
    });
    expect(svg).toContain("<svg");
    expect(svg).toContain("PETR4");
    expect(svg).toContain("Petrobras");
    expect(svg).toContain("+1.83%");
    expect(svg).toContain("#10b981");
  });

  it("uses red accent for negative change", () => {
    const svg = tickerOgSvg({ ticker: "X", name: "X Co", price: 10, changePercent: -2.5, currency: "USD" });
    expect(svg).toContain("-2.50%");
    expect(svg).toContain("#ef4444");
  });

  it("falls back to em-dash on null price", () => {
    const svg = tickerOgSvg({ ticker: "X", name: "X Co", price: null, changePercent: null });
    expect(svg).toContain("—");
  });

  it("escapes XML in user-controlled fields", () => {
    const svg = tickerOgSvg({
      ticker: "<bad>",
      name: "<inj>",
      price: 1,
      changePercent: 0,
    });
    expect(svg).toContain("&lt;bad&gt;");
    expect(svg).toContain("&lt;inj&gt;");
    expect(svg).not.toContain("<bad>");
  });
});

describe("defaultOgSvg", () => {
  it("renders default svg with brand copy", () => {
    const svg = defaultOgSvg();
    expect(svg).toContain("STOCK SIGNALS");
    expect(svg).toContain("Sinais técnicos da B3");
  });
});
