const staticTickers = require("./staticTickers");

const ALL = (() => {
  const out = [];
  const exchanges = {
    b3: "B3",
    bdrs: "B3",
    etfs: "B3",
    fiis: "B3",
    us: "NYSE/NASDAQ",
    crypto: "Crypto",
    fx: "FX",
  };
  const types = {
    b3: "EQUITY",
    bdrs: "BDR",
    etfs: "ETF",
    fiis: "FII",
    us: "EQUITY",
    crypto: "CRYPTO",
    fx: "FX",
  };
  for (const [bucket, entries] of Object.entries(staticTickers)) {
    for (const [symbol, shortname] of entries) {
      out.push({
        symbol,
        shortname,
        exchange: exchanges[bucket] || "",
        type: types[bucket] || "EQUITY",
        bucket,
      });
    }
  }
  return out;
})();

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function searchLocal(query, limit = 8) {
  const q = normalize(query).trim();
  if (q.length < 1) return [];

  const scored = [];
  for (const t of ALL) {
    const sym = normalize(t.symbol);
    const name = normalize(t.shortname);
    let score = 0;

    if (sym === q) score = 1000;
    else if (sym.startsWith(q)) score = 500;
    else if (name.startsWith(q)) score = 400;
    else if (sym.includes(q)) score = 250;
    else if (name.includes(q)) score = 100;
    else continue;

    // tiny tiebreak for shorter shortnames
    score -= name.length * 0.1;

    scored.push({ score, item: t });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.item);
}

function allTickers() {
  return ALL;
}

module.exports = { searchLocal, allTickers };
