/**
 * Optional persistent cache layer backed by Upstash Redis (REST API).
 *
 * Activated when both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
 * env vars are set (and a global `fetch` is available).
 *
 * When inactive, all operations are no-ops — callers fall back to the
 * in-memory cache transparently.
 *
 * Free tier of Upstash gives 10k commands/day, which is plenty for the
 * Stock Signals workload (with 15min in-memory cache, persistent cache
 * is only hit on cold starts and cache misses).
 */

const URL_ENV = "UPSTASH_REDIS_REST_URL";
const TOKEN_ENV = "UPSTASH_REDIS_REST_TOKEN";

let fetchImpl = typeof fetch === "function" ? fetch : null;
function setFetchImpl(impl) { fetchImpl = impl; }

function readConfig() {
  return {
    url: (process.env[URL_ENV] || "").replace(/\/$/, ""),
    token: process.env[TOKEN_ENV] || "",
  };
}

function isEnabled() {
  const { url, token } = readConfig();
  return Boolean(url && token && fetchImpl);
}

async function send(commandArray) {
  const { url, token } = readConfig();
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commandArray),
  });
  if (!res.ok) {
    throw new Error(`Upstash HTTP ${res.status}`);
  }
  return res.json();
}

async function get(key) {
  if (!isEnabled()) return null;
  try {
    const body = await send(["GET", key]);
    if (!body || body.result == null) return null;
    return JSON.parse(body.result);
  } catch (_) {
    return null;
  }
}

async function set(key, value, ttlSeconds) {
  if (!isEnabled()) return false;
  try {
    const args = ["SET", key, JSON.stringify(value)];
    if (ttlSeconds && Number.isFinite(ttlSeconds) && ttlSeconds > 0) {
      args.push("EX", String(Math.floor(ttlSeconds)));
    }
    await send(args);
    return true;
  } catch (_) {
    return false;
  }
}

async function del(key) {
  if (!isEnabled()) return false;
  try {
    await send(["DEL", key]);
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = { get, set, del, isEnabled, setFetchImpl };
