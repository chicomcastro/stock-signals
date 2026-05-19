const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_STORE_PATH = path.join(__dirname, "..", ".data", "subscribers.json");
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  return typeof email === "string" && EMAIL_REGEX.test(email) && email.length < 200;
}

function sanitizeTickers(arr) {
  if (!Array.isArray(arr)) return [];
  return Array.from(
    new Set(
      arr
        .filter((t) => typeof t === "string")
        .map((t) => t.trim().toUpperCase())
        .filter((t) => /^[A-Z0-9.\-=^]{1,15}$/.test(t))
        .slice(0, 100)
    )
  );
}

function generateToken() {
  return crypto.randomBytes(16).toString("hex");
}

function createSubscriberStore({ storePath = DEFAULT_STORE_PATH } = {}) {
  function load() {
    try {
      const raw = fs.readFileSync(storePath, "utf8");
      const data = JSON.parse(raw);
      return Array.isArray(data.subscribers) ? data.subscribers : [];
    } catch (_) {
      return [];
    }
  }

  function persist(subscribers) {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify({ subscribers }, null, 2));
  }

  function list() {
    return load();
  }

  function findByEmail(email) {
    return load().find((s) => s.email.toLowerCase() === String(email).toLowerCase()) || null;
  }

  function findByToken(token) {
    return load().find((s) => s.confirmToken === token || s.unsubscribeToken === token) || null;
  }

  function subscribe({ email, tickers }) {
    if (!isValidEmail(email)) throw Object.assign(new Error("E-mail inválido"), { status: 400 });
    const safeTickers = sanitizeTickers(tickers);
    if (safeTickers.length === 0)
      throw Object.assign(new Error("Selecione pelo menos um ativo"), { status: 400 });

    const subs = load();
    const existing = subs.find((s) => s.email.toLowerCase() === email.toLowerCase());
    const now = new Date().toISOString();
    if (existing) {
      existing.tickers = safeTickers;
      existing.updatedAt = now;
      persist(subs);
      return existing;
    }
    const sub = {
      email: email.toLowerCase(),
      tickers: safeTickers,
      confirmed: false,
      confirmToken: generateToken(),
      unsubscribeToken: generateToken(),
      createdAt: now,
      updatedAt: now,
    };
    subs.push(sub);
    persist(subs);
    return sub;
  }

  function confirm(token) {
    const subs = load();
    const sub = subs.find((s) => s.confirmToken === token);
    if (!sub) return null;
    sub.confirmed = true;
    sub.confirmedAt = new Date().toISOString();
    persist(subs);
    return sub;
  }

  function unsubscribe(token) {
    const subs = load();
    const idx = subs.findIndex((s) => s.unsubscribeToken === token);
    if (idx === -1) return null;
    const [removed] = subs.splice(idx, 1);
    persist(subs);
    return removed;
  }

  function clear() {
    persist([]);
  }

  return { list, findByEmail, findByToken, subscribe, confirm, unsubscribe, clear };
}

module.exports = { createSubscriberStore, isValidEmail, sanitizeTickers, generateToken };
