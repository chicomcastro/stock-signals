function createCache({ ttlMs } = { ttlMs: 5 * 60 * 1000 }) {
  const store = new Map();

  function get(key) {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return null;
    }
    return entry.value;
  }

  function set(key, value, customTtl) {
    const ttl = customTtl ?? ttlMs;
    store.set(key, { value, expiresAt: Date.now() + ttl });
  }

  function size() {
    return store.size;
  }

  function clear() {
    store.clear();
  }

  return { get, set, size, clear };
}

function isMarketHoursBRT(now = new Date()) {
  const brt = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const day = brt.getDay();
  if (day === 0 || day === 6) return false;
  const hour = brt.getHours();
  return hour >= 10 && hour < 18;
}

function ttlForNow(now = new Date()) {
  return isMarketHoursBRT(now) ? 5 * 60 * 1000 : 6 * 60 * 60 * 1000;
}

module.exports = { createCache, isMarketHoursBRT, ttlForNow };
