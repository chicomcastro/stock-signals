import { describe, it, expect } from "vitest";
import cacheMod from "./cache.js";
const { createCache, isMarketHoursBRT, ttlForNow } = cacheMod;

describe("createCache", () => {
  it("stores and retrieves values within TTL", () => {
    const c = createCache({ ttlMs: 1000 });
    c.set("k", { v: 1 });
    expect(c.get("k")).toEqual({ v: 1 });
  });

  it("expires values after TTL", async () => {
    const c = createCache({ ttlMs: 10 });
    c.set("k", "v");
    await new Promise((r) => setTimeout(r, 30));
    expect(c.get("k")).toBeNull();
  });

  it("supports custom TTL per entry", async () => {
    const c = createCache({ ttlMs: 10000 });
    c.set("short", "v", 10);
    await new Promise((r) => setTimeout(r, 30));
    expect(c.get("short")).toBeNull();
  });

  it("returns null for missing keys", () => {
    const c = createCache();
    expect(c.get("missing")).toBeNull();
  });

  it("reports size and clears", () => {
    const c = createCache();
    c.set("a", 1);
    c.set("b", 2);
    expect(c.size()).toBe(2);
    c.clear();
    expect(c.size()).toBe(0);
  });

  it("getStale returns value even after expiration", async () => {
    const c = createCache({ ttlMs: 10 });
    c.set("k", "v");
    await new Promise((r) => setTimeout(r, 30));
    expect(c.get("k")).toBeNull();
    expect(c.getStale("k")).toBe("v");
  });

  it("getStale returns null for missing key", () => {
    const c = createCache();
    expect(c.getStale("nope")).toBeNull();
  });

  it("getEntry includes expired flag", async () => {
    const c = createCache({ ttlMs: 10 });
    c.set("k", "v");
    const fresh = c.getEntry("k");
    expect(fresh.expired).toBe(false);
    await new Promise((r) => setTimeout(r, 30));
    const expired = c.getEntry("k");
    expect(expired.expired).toBe(true);
    expect(c.getEntry("none")).toBeNull();
  });
});

describe("isMarketHoursBRT", () => {
  it("is false on weekends", () => {
    const sat = new Date("2026-05-16T15:00:00.000Z");
    const sun = new Date("2026-05-17T15:00:00.000Z");
    expect(isMarketHoursBRT(sat)).toBe(false);
    expect(isMarketHoursBRT(sun)).toBe(false);
  });

  it("is true during weekday pregão (10h-18h BRT)", () => {
    const tueAfternoon = new Date("2026-05-19T17:00:00.000Z");
    expect(isMarketHoursBRT(tueAfternoon)).toBe(true);
  });

  it("is false before market open", () => {
    const tueEarly = new Date("2026-05-19T11:00:00.000Z");
    expect(isMarketHoursBRT(tueEarly)).toBe(false);
  });

  it("is false after market close", () => {
    const tueLate = new Date("2026-05-19T22:00:00.000Z");
    expect(isMarketHoursBRT(tueLate)).toBe(false);
  });
});

describe("ttlForNow", () => {
  it("returns short TTL during pregão", () => {
    const tueAfternoon = new Date("2026-05-19T17:00:00.000Z");
    expect(ttlForNow(tueAfternoon)).toBe(15 * 60 * 1000);
  });

  it("returns long TTL outside pregão", () => {
    const sat = new Date("2026-05-16T15:00:00.000Z");
    expect(ttlForNow(sat)).toBe(24 * 60 * 60 * 1000);
  });
});
