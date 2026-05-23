import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import ps from "./persistentStore.js";
const { get, set, del, isEnabled, setFetchImpl } = ps;

const URL_ENV = "UPSTASH_REDIS_REST_URL";
const TOKEN_ENV = "UPSTASH_REDIS_REST_TOKEN";

describe("persistentStore", () => {
  let originalUrl;
  let originalToken;

  beforeEach(() => {
    originalUrl = process.env[URL_ENV];
    originalToken = process.env[TOKEN_ENV];
    delete process.env[URL_ENV];
    delete process.env[TOKEN_ENV];
    setFetchImpl(null);
  });

  afterEach(() => {
    if (originalUrl != null) process.env[URL_ENV] = originalUrl;
    else delete process.env[URL_ENV];
    if (originalToken != null) process.env[TOKEN_ENV] = originalToken;
    else delete process.env[TOKEN_ENV];
  });

  describe("isEnabled", () => {
    it("returns false when env vars are missing", () => {
      expect(isEnabled()).toBe(false);
    });

    it("returns false when only URL is set", () => {
      process.env[URL_ENV] = "https://example.upstash.io";
      setFetchImpl(vi.fn());
      expect(isEnabled()).toBe(false);
    });

    it("returns false when only token is set", () => {
      process.env[TOKEN_ENV] = "tok";
      setFetchImpl(vi.fn());
      expect(isEnabled()).toBe(false);
    });

    it("returns false when fetch is unavailable", () => {
      process.env[URL_ENV] = "https://example.upstash.io";
      process.env[TOKEN_ENV] = "tok";
      setFetchImpl(null);
      expect(isEnabled()).toBe(false);
    });

    it("returns true when fully configured", () => {
      process.env[URL_ENV] = "https://example.upstash.io";
      process.env[TOKEN_ENV] = "tok";
      setFetchImpl(vi.fn());
      expect(isEnabled()).toBe(true);
    });
  });

  describe("get", () => {
    it("returns null when disabled", async () => {
      const r = await get("k");
      expect(r).toBeNull();
    });

    it("returns null when key missing", async () => {
      process.env[URL_ENV] = "https://example.upstash.io";
      process.env[TOKEN_ENV] = "tok";
      setFetchImpl(vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ result: null }),
      })));
      const r = await get("missing");
      expect(r).toBeNull();
    });

    it("parses JSON value", async () => {
      process.env[URL_ENV] = "https://example.upstash.io";
      process.env[TOKEN_ENV] = "tok";
      setFetchImpl(vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ result: JSON.stringify({ x: 1 }) }),
      })));
      const r = await get("k");
      expect(r).toEqual({ x: 1 });
    });

    it("returns null on HTTP error", async () => {
      process.env[URL_ENV] = "https://example.upstash.io";
      process.env[TOKEN_ENV] = "tok";
      setFetchImpl(vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({}),
      })));
      const r = await get("k");
      expect(r).toBeNull();
    });

    it("returns null on network throw", async () => {
      process.env[URL_ENV] = "https://example.upstash.io";
      process.env[TOKEN_ENV] = "tok";
      setFetchImpl(vi.fn(async () => { throw new Error("network"); }));
      const r = await get("k");
      expect(r).toBeNull();
    });
  });

  describe("set", () => {
    it("returns false when disabled", async () => {
      expect(await set("k", "v")).toBe(false);
    });

    it("sends SET command with EX when TTL provided", async () => {
      process.env[URL_ENV] = "https://example.upstash.io";
      process.env[TOKEN_ENV] = "tok";
      const fetchSpy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
      setFetchImpl(fetchSpy);

      await set("k", { x: 1 }, 60);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body[0]).toBe("SET");
      expect(body[1]).toBe("k");
      expect(body[2]).toBe(JSON.stringify({ x: 1 }));
      expect(body[3]).toBe("EX");
      expect(body[4]).toBe("60");
    });

    it("sends SET without EX when TTL missing", async () => {
      process.env[URL_ENV] = "https://example.upstash.io";
      process.env[TOKEN_ENV] = "tok";
      const fetchSpy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
      setFetchImpl(fetchSpy);

      await set("k", "v");
      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body).toHaveLength(3);
      expect(body[0]).toBe("SET");
    });

    it("returns false on HTTP error", async () => {
      process.env[URL_ENV] = "https://example.upstash.io";
      process.env[TOKEN_ENV] = "tok";
      setFetchImpl(vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
      expect(await set("k", "v")).toBe(false);
    });

    it("ignores non-positive TTL", async () => {
      process.env[URL_ENV] = "https://example.upstash.io";
      process.env[TOKEN_ENV] = "tok";
      const fetchSpy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
      setFetchImpl(fetchSpy);

      await set("k", "v", 0);
      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body).toHaveLength(3); // no EX
    });
  });

  describe("del", () => {
    it("returns false when disabled", async () => {
      expect(await del("k")).toBe(false);
    });

    it("sends DEL when enabled", async () => {
      process.env[URL_ENV] = "https://example.upstash.io";
      process.env[TOKEN_ENV] = "tok";
      const fetchSpy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
      setFetchImpl(fetchSpy);

      await del("k");
      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body).toEqual(["DEL", "k"]);
    });
  });
});
