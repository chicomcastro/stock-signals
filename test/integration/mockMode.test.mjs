import { describe, it, expect, beforeAll } from "vitest";
import { createRequire } from "module";
import request from "supertest";

process.env.MOCK_YAHOO = "1";
process.env.NODE_ENV = "test";

const r = createRequire(import.meta.url);

let app;
let dp;
beforeAll(async () => {
  delete r.cache[r.resolve("../../src/dataProvider.js")];
  delete r.cache[r.resolve("../../src/server.js")];
  dp = r("../../src/dataProvider.js");
  const server = r("../../src/server.js");
  app = server.createApp();
  dp.historicalCache.clear();
  dp.quoteCache.clear();
  dp.searchCache.clear();
});

describe("MOCK_YAHOO mode (fixture-based)", () => {
  it("/data/:ticker returns full analysis from fixture", async () => {
    const res = await request(app).get("/data/PETR4?period=3M");
    expect(res.status).toBe(200);
    expect(res.body.ticker).toBe("PETR4.SA");
    expect(res.body.dates.length).toBeGreaterThan(40);
    expect(res.body.macdLine.length).toBe(res.body.dates.length);
    expect(res.body.analysis.length).toBe(res.body.dates.length);
  });

  it("/api/quote returns fixture quote", async () => {
    const res = await request(app).get("/api/quote/PETR4");
    expect(res.status).toBe(200);
    expect(res.body.shortName).toBeDefined();
  });

  it("/api/search returns fixture matches", async () => {
    const res = await request(app).get("/api/search?q=petro");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("/og/:ticker.svg includes fixture quote info", async () => {
    const res = await request(app).get("/og/PETR4.svg").buffer(true);
    expect(res.status).toBe(200);
    const body = Buffer.isBuffer(res.body) ? res.body.toString() : res.text || "";
    expect(body).toContain("PETR4");
  });

  it("/api/backtest works with fixture", async () => {
    const res = await request(app).get("/api/backtest/PETR4");
    expect(res.status).toBe(200);
    expect(res.body.ticker).toBe("PETR4.SA");
    expect(res.body.golden).toBeDefined();
  });

  it("/api/signals works with fixture", async () => {
    const res = await request(app).get("/api/signals?universe=PETR4&limit=1");
    expect(res.status).toBe(200);
    expect(res.body.buckets).toBeDefined();
  });

  it("/sinais renders with shell", async () => {
    const res = await request(app).get("/sinais");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Sinais do dia");
  });

  it("/alertas renders form", async () => {
    const res = await request(app).get("/alertas");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Alertas por e-mail");
  });
});
