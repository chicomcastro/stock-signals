import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { createRequire } from "module";
import request from "supertest";
import path from "path";
import os from "os";

process.env.NODE_ENV = "test";

const r = createRequire(import.meta.url);
const dp = r("../../src/dataProvider.js");
const server = r("../../src/server.js");
const subs = r("../../src/subscribers.js");

const stub = {
  chart: vi.fn(),
  quote: vi.fn(),
  search: vi.fn(),
  suppressNotices: vi.fn(),
};

let app;
let subscriberStore;
beforeAll(() => {
  dp.setYahooClient(stub);
  dp.setBrapiClient({}); // disable Brapi path for these tests
  subscriberStore = subs.createSubscriberStore({
    storePath: path.join(os.tmpdir(), `subs-test-${Date.now()}.json`),
  });
  app = server.createApp({ subscriberStore });
});

beforeEach(() => {
  stub.chart.mockReset();
  stub.quote.mockReset();
  stub.search.mockReset();
  dp.historicalCache.clear();
  dp.quoteCache.clear();
  dp.searchCache.clear();
  subscriberStore.clear();
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
  });

  it("GET /sitemap.xml includes new pages", async () => {
    const res = await request(app).get("/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.text).toContain("/sinais");
    expect(res.text).toContain("/alertas");
    expect(res.text).toContain("/favorites");
  });

  it("GET /og/default.svg", async () => {
    const res = await request(app).get("/og/default.svg").buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/svg/);
  });

  it("GET /og/:ticker.svg renders with quote data", async () => {
    stub.quote.mockResolvedValue({
      symbol: "PETR4.SA", shortName: "Petrobras", regularMarketPrice: 38.4,
      regularMarketChangePercent: 2.1, currency: "BRL",
    });
    const res = await request(app).get("/og/PETR4.svg").buffer(true);
    expect(res.status).toBe(200);
    const body = Buffer.isBuffer(res.body) ? res.body.toString() : res.text || "";
    expect(body).toContain("PETR4");
  });

  it("GET /og/:ticker.svg rejects invalid ticker", async () => {
    const res = await request(app).get("/og/%3Cscript%3E.svg");
    expect(res.status).toBe(400);
  });

  it("GET /css/base.css and /css/components.css", async () => {
    const a = await request(app).get("/css/base.css");
    const b = await request(app).get("/css/components.css");
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
  });

  it("GET /js/app-shell.js", async () => {
    const res = await request(app).get("/js/app-shell.js");
    expect(res.status).toBe(200);
    expect(res.text).toContain("themeToggleBtn");
  });

  it("GET /favicon.svg and manifest", async () => {
    expect((await request(app).get("/favicon.svg")).status).toBe(200);
    expect((await request(app).get("/manifest.webmanifest")).status).toBe(200);
  });
});

describe("Template rendering with app shell", () => {
  it("GET / injects app shell and SEO meta", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="app-header"');
    expect(res.text).toContain('class="bottom-nav"');
    expect(res.text).toContain("Sinais de compra e venda");
    expect(res.text).toContain('lang="pt-BR"');
    expect(res.text).toContain('og:title');
  });

  it("GET /sinais renders shell + screener container", async () => {
    const res = await request(app).get("/sinais");
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="app-header"');
    expect(res.text).toContain("Sinais do dia");
    expect(res.text).toContain("/api/signals");
  });

  it("GET /alertas renders subscription form", async () => {
    const res = await request(app).get("/alertas");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Alertas por e-mail");
    expect(res.text).toContain("alertForm");
  });

  it("GET /:ticker renders chart template with shell", async () => {
    stub.quote.mockResolvedValue({
      symbol: "PETR4.SA", shortName: "Petrobras", regularMarketPrice: 38.4,
      regularMarketChangePercent: 2.1, currency: "BRL",
    });
    const res = await request(app).get("/PETR4");
    expect(res.status).toBe(200);
    expect(res.text).toContain("<title>PETR4 — Análise técnica");
    expect(res.text).toContain('class="bottom-nav"');
    expect(res.text).toContain("frameworkDrawer");
  });

  it("GET /favorites and /favorites.html serve the same template", async () => {
    const a = await request(app).get("/favorites");
    const b = await request(app).get("/favorites.html");
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.text).toContain("favoritos");
    expect(b.text).toContain("favoritos");
  });

  it("GET /buscar redirects to home with search param", async () => {
    const res = await request(app).get("/buscar");
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("search=1");
  });
});

describe("/data/:ticker", () => {
  it("returns JSON with indicators", async () => {
    stub.chart.mockResolvedValue({ quotes: fakeQuotes(250) });
    const res = await request(app).get("/data/PETR4?period=3M");
    expect(res.status).toBe(200);
    expect(res.body.ticker).toBe("PETR4.SA");
    expect(res.body.macdLine).toBeDefined();
    expect(res.body.analysis).toBeDefined();
  });

  it("returns 429 on Yahoo rate limit", async () => {
    stub.chart.mockRejectedValue(new Error('Unexpected token "Too Many Requests" is not valid JSON'));
    const res = await request(app).get("/data/PETR4?period=3M");
    expect(res.status).toBe(429);
  });

  it("returns 404 on Not Found", async () => {
    stub.chart.mockRejectedValue(new Error("HTTP 404: Not Found"));
    const res = await request(app).get("/data/INVAL?period=3M");
    expect(res.status).toBe(404);
  });

  it("rejects invalid input with 400", async () => {
    const res = await request(app).get("/data/%3Cscript%3E");
    expect(res.status).toBe(400);
  });
});

describe("/api/backtest/:ticker", () => {
  it("returns backtest stats per signal type", async () => {
    stub.chart.mockResolvedValue({ quotes: fakeQuotes(500) });
    const res = await request(app).get("/api/backtest/PETR4");
    expect(res.status).toBe(200);
    expect(res.body.ticker).toBe("PETR4.SA");
    expect(res.body.golden).toBeDefined();
    expect(res.body.death).toBeDefined();
    expect(res.body.bullish_cross).toBeDefined();
    expect(res.body.bearish_cross).toBeDefined();
  });

  it("rejects invalid ticker", async () => {
    const res = await request(app).get("/api/backtest/%3Cscript%3E");
    expect(res.status).toBe(400);
  });

  it("propagates Yahoo errors", async () => {
    stub.chart.mockRejectedValue(new Error("Too Many Requests"));
    const res = await request(app).get("/api/backtest/PETR4");
    expect(res.status).toBe(429);
  });
});

describe("/api/signals", () => {
  it("returns aggregated daily signals", async () => {
    stub.chart.mockResolvedValue({ quotes: fakeQuotes(400) });
    const res = await request(app).get("/api/signals?universe=PETR4,VALE3");
    expect(res.status).toBe(200);
    expect(res.body.date).toBeDefined();
    expect(res.body.buckets).toBeDefined();
    expect(typeof res.body.universeSize).toBe("number");
  });

  it("filters invalid tickers from universe", async () => {
    stub.chart.mockResolvedValue({ quotes: fakeQuotes(400) });
    const res = await request(app).get("/api/signals?universe=PETR4,%3Cbad%3E,VALE3");
    expect(res.status).toBe(200);
    expect(res.body.universeSize).toBeLessThanOrEqual(2);
  });
});

describe("/api/search and /api/quote", () => {
  it("search returns empty for short queries", async () => {
    const res = await request(app).get("/api/search?q=a");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("search returns results", async () => {
    stub.search.mockResolvedValue({
      quotes: [{ symbol: "PETR4.SA", shortname: "Petrobras", exchange: "SAO", quoteType: "EQUITY" }],
    });
    const res = await request(app).get("/api/search?q=petr");
    expect(res.status).toBe(200);
    expect(res.body[0].symbol).toBe("PETR4.SA");
  });

  it("quote returns summary", async () => {
    stub.quote.mockResolvedValue({
      symbol: "PETR4.SA", shortName: "Petrobras", regularMarketPrice: 38,
      regularMarketChangePercent: 1.5, currency: "BRL",
    });
    const res = await request(app).get("/api/quote/PETR4");
    expect(res.status).toBe(200);
    expect(res.body.shortName).toBe("Petrobras");
  });
});

describe("/api/alerts/*", () => {
  it("subscribes with valid email + tickers", async () => {
    const res = await request(app).post("/api/alerts/subscribe").send({
      email: "user@example.com",
      tickers: ["PETR4", "AAPL"],
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.confirmUrl).toMatch(/\/api\/alerts\/confirm\//);
    expect(res.body.unsubscribeUrl).toMatch(/\/api\/alerts\/unsubscribe\//);
  });

  it("rejects invalid email", async () => {
    const res = await request(app).post("/api/alerts/subscribe").send({
      email: "not-an-email",
      tickers: ["PETR4"],
    });
    expect(res.status).toBe(400);
  });

  it("rejects empty tickers", async () => {
    const res = await request(app).post("/api/alerts/subscribe").send({
      email: "user@example.com",
      tickers: [],
    });
    expect(res.status).toBe(400);
  });

  it("rejects unsanitized tickers", async () => {
    const res = await request(app).post("/api/alerts/subscribe").send({
      email: "user@example.com",
      tickers: ["<bad>"],
    });
    expect(res.status).toBe(400);
  });

  it("confirms via token", async () => {
    const sub = await request(app).post("/api/alerts/subscribe").send({
      email: "user@example.com",
      tickers: ["PETR4"],
    });
    const url = new URL(sub.body.confirmUrl);
    const res = await request(app).get(url.pathname);
    expect(res.status).toBe(200);
    expect(res.text).toContain("confirmada");
  });

  it("unsubscribes via token", async () => {
    const sub = await request(app).post("/api/alerts/subscribe").send({
      email: "user@example.com",
      tickers: ["PETR4"],
    });
    const url = new URL(sub.body.unsubscribeUrl);
    const res = await request(app).get(url.pathname);
    expect(res.status).toBe(200);
    expect(res.text).toContain("cancelada");
  });

  it("returns 404 on bad confirm/unsubscribe token", async () => {
    expect((await request(app).get("/api/alerts/confirm/nope")).status).toBe(404);
    expect((await request(app).get("/api/alerts/unsubscribe/nope")).status).toBe(404);
  });
});

describe("Security and hardening", () => {
  it("400 on invalid ticker page", async () => {
    const res = await request(app).get("/" + encodeURIComponent("<script>"));
    expect(res.status).toBe(400);
  });

  it("404 for missing static asset, no Yahoo call", async () => {
    const res = await request(app).get("/missing.json");
    expect(res.status).toBe(404);
    expect(stub.chart).not.toHaveBeenCalled();
  });

  it("404 for unknown deep path", async () => {
    const res = await request(app).get("/some/deep/path");
    expect(res.status).toBe(404);
  });
});
