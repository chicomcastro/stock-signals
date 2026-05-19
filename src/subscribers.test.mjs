import { describe, it, expect, beforeEach } from "vitest";
import path from "path";
import os from "os";
import fs from "fs";
import subs from "./subscribers.js";
const { createSubscriberStore, isValidEmail, sanitizeTickers, generateToken } = subs;

function tmpStorePath() {
  return path.join(os.tmpdir(), `subs-${Date.now()}-${Math.random()}.json`);
}

describe("isValidEmail", () => {
  it("accepts ok emails", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("nome.com.algo+plus@dominio.com.br")).toBe(true);
  });
  it("rejects bad emails", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("notanemail")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("a a@b.c")).toBe(false);
    expect(isValidEmail(null)).toBe(false);
  });
});

describe("sanitizeTickers", () => {
  it("deduplicates, uppercases, validates", () => {
    expect(sanitizeTickers(["petr4", "PETR4", "AAPL", "<bad>"]).sort()).toEqual(["AAPL", "PETR4"]);
  });
  it("limits to 100", () => {
    const big = Array.from({ length: 150 }, (_, i) => `T${i}`);
    const r = sanitizeTickers(big);
    expect(r.length).toBeLessThanOrEqual(100);
  });
  it("returns empty for bad input", () => {
    expect(sanitizeTickers(null)).toEqual([]);
    expect(sanitizeTickers("nope")).toEqual([]);
  });
});

describe("generateToken", () => {
  it("creates unique hex strings", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[a-f0-9]+$/);
  });
});

describe("createSubscriberStore", () => {
  let store;
  let storePath;
  beforeEach(() => {
    storePath = tmpStorePath();
    store = createSubscriberStore({ storePath });
  });

  it("subscribes and persists", () => {
    const sub = store.subscribe({ email: "a@b.co", tickers: ["PETR4", "AAPL"] });
    expect(sub.email).toBe("a@b.co");
    expect(sub.tickers).toEqual(["PETR4", "AAPL"]);
    expect(sub.confirmToken).toMatch(/^[a-f0-9]+$/);
    expect(sub.confirmed).toBe(false);

    const reload = createSubscriberStore({ storePath });
    expect(reload.list()).toHaveLength(1);
  });

  it("rejects invalid email", () => {
    expect(() => store.subscribe({ email: "x", tickers: ["PETR4"] })).toThrow(/inválido/);
  });

  it("rejects empty tickers", () => {
    expect(() => store.subscribe({ email: "a@b.co", tickers: [] })).toThrow(/ativo/);
    expect(() => store.subscribe({ email: "a@b.co", tickers: ["<bad>"] })).toThrow(/ativo/);
  });

  it("updates tickers if email already exists", () => {
    store.subscribe({ email: "a@b.co", tickers: ["PETR4"] });
    const updated = store.subscribe({ email: "a@b.co", tickers: ["VALE3"] });
    expect(updated.tickers).toEqual(["VALE3"]);
    expect(store.list()).toHaveLength(1);
  });

  it("confirms via token", () => {
    const sub = store.subscribe({ email: "a@b.co", tickers: ["PETR4"] });
    const confirmed = store.confirm(sub.confirmToken);
    expect(confirmed.confirmed).toBe(true);
    expect(confirmed.confirmedAt).toBeTruthy();
  });

  it("returns null for unknown token on confirm", () => {
    expect(store.confirm("nope")).toBeNull();
  });

  it("unsubscribes via token", () => {
    const sub = store.subscribe({ email: "a@b.co", tickers: ["PETR4"] });
    const removed = store.unsubscribe(sub.unsubscribeToken);
    expect(removed.email).toBe("a@b.co");
    expect(store.list()).toHaveLength(0);
  });

  it("returns null for unknown unsubscribe token", () => {
    expect(store.unsubscribe("nope")).toBeNull();
  });

  it("clears store", () => {
    store.subscribe({ email: "a@b.co", tickers: ["PETR4"] });
    store.clear();
    expect(store.list()).toHaveLength(0);
  });

  it("findByEmail returns subscriber or null", () => {
    store.subscribe({ email: "a@b.co", tickers: ["PETR4"] });
    expect(store.findByEmail("a@b.co").tickers).toEqual(["PETR4"]);
    expect(store.findByEmail("A@B.CO").tickers).toEqual(["PETR4"]);
    expect(store.findByEmail("zzz@example.com")).toBeNull();
  });

  it("findByToken finds by confirm or unsubscribe token", () => {
    const sub = store.subscribe({ email: "a@b.co", tickers: ["PETR4"] });
    expect(store.findByToken(sub.confirmToken).email).toBe("a@b.co");
    expect(store.findByToken(sub.unsubscribeToken).email).toBe("a@b.co");
    expect(store.findByToken("nope")).toBeNull();
  });

  it("returns empty list on missing file", () => {
    const fresh = createSubscriberStore({ storePath: path.join(os.tmpdir(), `nope-${Date.now()}.json`) });
    expect(fresh.list()).toEqual([]);
  });

  it("recovers from corrupt JSON file", () => {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, "this is not json");
    const fresh = createSubscriberStore({ storePath });
    expect(fresh.list()).toEqual([]);
  });
});
