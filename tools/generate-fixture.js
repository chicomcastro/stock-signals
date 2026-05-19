#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const DAYS = 400;
const START_DATE = new Date("2024-01-02");
const START_PRICE = 30;

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function isWeekday(d) {
  const day = d.getDay();
  return day !== 0 && day !== 6;
}

function buildHistorical() {
  const rand = seededRandom(42);
  const data = [];
  let price = START_PRICE;
  let date = new Date(START_DATE);

  while (data.length < DAYS) {
    if (isWeekday(date)) {
      const drift = 0.0002;
      const vol = 0.018;
      const shock = (rand() - 0.5) * 2 * vol;
      price = Math.max(1, price * (1 + drift + shock));
      const open = price * (1 - (rand() - 0.5) * 0.005);
      const high = Math.max(open, price) * (1 + rand() * 0.005);
      const low = Math.min(open, price) * (1 - rand() * 0.005);
      data.push({
        date: date.toISOString(),
        open: round(open),
        high: round(high),
        low: round(low),
        close: round(price),
        volume: Math.floor(1_000_000 + rand() * 5_000_000),
      });
    }
    date = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  }
  return data;
}

function round(n) {
  return Math.round(n * 100) / 100;
}

const fixture = {
  generatedAt: new Date().toISOString(),
  ticker: "PETR4.SA",
  historical: buildHistorical(),
  quote: {
    symbol: "PETR4.SA",
    shortName: "Petrobras PN",
    regularMarketPrice: 38.42,
    regularMarketChangePercent: 1.83,
    currency: "BRL",
  },
  search: [
    { symbol: "PETR4.SA", shortname: "Petrobras PN", exchange: "SAO", type: "EQUITY" },
    { symbol: "PETR3.SA", shortname: "Petrobras ON", exchange: "SAO", type: "EQUITY" },
    { symbol: "PBR", shortname: "Petroleo Brasileiro ADR", exchange: "NYSE", type: "EQUITY" },
  ],
};

const outPath = path.join(__dirname, "..", "test", "fixtures", "historical.json");
fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2));
console.log(`Wrote ${fixture.historical.length} bars to ${outPath}`);
