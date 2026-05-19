import { describe, it, expect } from "vitest";
import cacheMod from "./cache.js";
const { createCache } = cacheMod;

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
});
