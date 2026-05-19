import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { createRequire } from "module";
import request from "supertest";

process.env.NODE_ENV = "test";

const r = createRequire(import.meta.url);
const dp = r("../../src/dataProvider.js");
const server = r("../../src/server.js");

const stub = {
  chart: vi.fn(),
  quote: vi.fn(),
  search: vi.fn(),
  suppressNotices: vi.fn(),
};

let app;
beforeAll(() => {
  dp.setYahooClient(stub);
  app = server.createApp();
});

beforeEach(() => {
  stub.chart.mockReset();
  stub.quote.mockReset();
  stub.search.mockReset();
  dp.historicalCache.clear();
  dp.quoteCache.clear();
  dp.searchCache.clear();
});

function fakeQuotes(n = 250) {
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

describe("Static endpoints", () => {
  it("GET /robots.txt", async () => {
    const res = await request(app).get("/robots.txt");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Sitemap:");
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
  });

  it("GET /sitemap.xml", async () => {
    const res = await request(app).get("/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.text).toContain("<urlset");
    expect(res.text).toContain("/PETR4");
    expect(res.headers["content-type"]).toMatch(/xml/);
  });

  it("GET /og/default.svg", async () => {
    const res = await request(app).get("/og/default.svg").buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/svg/);
    const body = Buffer.isBuffer(res.body) ? res.body.toString() : res.text || "";
    expect(body).toContain("<svg");
  });

  it("GET /og/:ticker.svg uses quote for accent color", async () => {
    stub.quote.mockResolvedValue({
      symbol: "PETR4.SA",
      shortName: "Petrobras",
      regularMarketPrice: 38.4,
      regularMarketChangePercent: 2.1,
      currency: "BRL",
    });
    const res = await request(app).get("/og/PETR4.svg").buffer(true);
    expect(res.status).toBe(200);
    const body = Buffer.isBuffer(res.body) ? res.body.toString() : res.text || "";
    expect(body).toContain("PETR4");
    expect(body).toContain("Petrobras");
  });

  it("GET /og/:ticker.svg falls back when quote fails", async () => {
    stub.quote.mockRejectedValue(new Error("Too Many Requests"));
    const res = await request(app).get("/og/PETR4.svg").buffer(true);
    expect(res.status).toBe(200);
    const body = Buffer.isBuffer(res.body) ? res.body.toString() : res.text || "";
    expect(body).toContain("PETR4");
  });

  it("GET /og/:ticker.svg rejects invalid ticker", async () => {
    const res = await request(app).get("/og/%3Cscript%3E.svg");
    expect(res.status).toBe(400);
  });

  it("GET /favicon.svg", async () => {
    const res = await request(app).get("/favicon.svg");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/svg/);
  });

  it("GET /manifest.webmanifest", async () => {
    const res = await request(app).get("/manifest.webmanifest");
    expect(res.status).toBe(200);
  });

  it("GET /css/base.css", async () => {
    const res = await request(app).get("/css/base.css");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/css/);
  });
});

describe("Template rendering", () => {
  it("GET / renders landing with SEO meta", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Stock Signals");
    expect(res.text).toContain('<meta name="description"');
    expect(res.text).toContain('<link rel="canonical"');
    expect(res.text).toContain("og:title");
    expect(res.text).toContain('lang="pt-BR"');
  });

  it("GET /:ticker renders chart template with ticker substituted", async () => {
    stub.quote.mockResolvedValue({
      symbol: "PETR4.SA",
      shortName: "Petrobras",
      regularMarketPrice: 38.4,
      regularMarketChangePercent: 2.1,
      currency: "BRL",
    });
    const res = await request(app).get("/PETR4");
    expect(res.status).toBe(200);
    expect(res.text).toContain("<title>PETR4 — Análise técnica");
    expect(res.text).toMatch(/canonical.*PETR4/);
    expect(res.text).toContain("og/PETR4.svg");
  });

  it("GET /:ticker works when quote API fails", async () => {
    stub.quote.mockRejectedValue(new Error("Too Many Requests"));
    const res = await request(app).get("/PETR4");
    expect(res.status).toBe(200);
    expect(res.text).toContain("PETR4");
  });

  it("GET /favorites.html renders template", async () => {
    const res = await request(app).get("/favorites.html");
    expect(res.status).toBe(200);
    expect(res.text).toContain("favoritos");
    expect(res.text).toContain("noindex");
  });

  it("GET /favorites alias works", async () => {
    const res = await request(app).get("/favorites");
    expect(res.status).toBe(200);
  });
});

describe("/data/:ticker", () => {
  it("returns JSON with indicators for valid ticker", async () => {
    stub.chart.mockResolvedValue({ quotes: fakeQuotes(250) });
    const res = await request(app).get("/data/PETR4?period=3M");
    expect(res.status).toBe(200);
    expect(res.body.ticker).toBe("PETR4.SA");
    expect(res.body.dates.length).toBeGreaterThan(0);
    expect(res.body.macdLine).toBeDefined();
    expect(res.body.macdSignal).toBeDefined();
    expect(res.body.macdHistogram).toBeDefined();
    expect(res.body.analysis).toBeDefined();
    expect(res.headers["cache-control"]).toMatch(/max-age=300/);
  });

  it("returns 429 with friendly message on Yahoo rate limit", async () => {
    stub.chart.mockRejectedValue(new Error('Unexpected token "Too Many Requests" is not valid JSON'));
    const res = await request(app).get("/data/PETR4?period=3M");
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/Limite de requisições/);
  });

  it("returns 404 for unknown ticker", async () => {
    stub.chart.mockRejectedValue(new Error("HTTP 404: Not Found"));
    const res = await request(app).get("/data/INVAL?period=3M");
    expect(res.status).toBe(404);
  });

  it("rejects invalid ticker input with 400", async () => {
    const res = await request(app).get("/data/%3Cscript%3E");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inválido/);
  });

  it("uses .SA suffix for B3 patterns", async () => {
    stub.chart.mockResolvedValue({ quotes: fakeQuotes(50) });
    await request(app).get("/data/PETR4?period=1M");
    expect(stub.chart).toHaveBeenCalledWith("PETR4.SA", expect.any(Object));
  });

  it("passes through suffixed tickers unchanged", async () => {
    stub.chart.mockResolvedValue({ quotes: fakeQuotes(50) });
    await request(app).get("/data/BTC-USD?period=1M");
    expect(stub.chart).toHaveBeenCalledWith("BTC-USD", expect.any(Object));
  });
});

describe("/api/search", () => {
  it("returns empty array for short queries", async () => {
    const res = await request(app).get("/api/search?q=a");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(stub.search).not.toHaveBeenCalled();
  });

  it("returns search results from Yahoo", async () => {
    stub.search.mockResolvedValue({
      quotes: [{ symbol: "PETR4.SA", shortname: "Petrobras", exchange: "SAO", quoteType: "EQUITY" }],
    });
    const res = await request(app).get("/api/search?q=petr");
    expect(res.status).toBe(200);
    expect(res.body[0].symbol).toBe("PETR4.SA");
  });
});

describe("/api/quote/:ticker", () => {
  it("returns quote summary", async () => {
    stub.quote.mockResolvedValue({
      symbol: "PETR4.SA",
      shortName: "Petrobras",
      regularMarketPrice: 38.4,
      regularMarketChangePercent: 1.5,
      currency: "BRL",
    });
    const res = await request(app).get("/api/quote/PETR4");
    expect(res.status).toBe(200);
    expect(res.body.shortName).toBe("Petrobras");
  });

  it("rejects invalid ticker", async () => {
    const res = await request(app).get("/api/quote/%3Cscript%3E");
    expect(res.status).toBe(400);
  });

  it("propagates 429 from Yahoo", async () => {
    stub.quote.mockRejectedValue(new Error("Too Many Requests"));
    const res = await request(app).get("/api/quote/PETR4");
    expect(res.status).toBe(429);
  });
});

describe("Security and hardening", () => {
  it("returns 400 on invalid ticker page", async () => {
    const res = await request(app).get("/" + encodeURIComponent("<script>alert(1)</script>"));
    expect(res.status).toBe(400);
  });

  it("returns 404 for static-looking missing assets without calling Yahoo", async () => {
    const res = await request(app).get("/missing.json");
    expect(res.status).toBe(404);
    expect(stub.chart).not.toHaveBeenCalled();
  });

  it("404 for unknown deep path", async () => {
    const res = await request(app).get("/some/deep/path");
    expect(res.status).toBe(404);
  });
});
