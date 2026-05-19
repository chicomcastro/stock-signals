function returnAfter(closePrices, fromIndex, horizon) {
  const target = fromIndex + horizon;
  if (target >= closePrices.length) return null;
  const start = closePrices[fromIndex];
  const end = closePrices[target];
  if (start == null || end == null || start === 0) return null;
  return (end - start) / start;
}

function mean(values) {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function hitRate(values, predicate) {
  if (values.length === 0) return null;
  const hits = values.filter(predicate).length;
  return hits / values.length;
}

function backtestSignal(closePrices, dates, signalDates, horizons = [30, 60, 90]) {
  if (!Array.isArray(closePrices) || !Array.isArray(dates) || !Array.isArray(signalDates)) {
    return { n: 0, horizons: {} };
  }

  const dateIndex = new Map();
  for (let i = 0; i < dates.length; i++) {
    const key = new Date(dates[i]).toISOString().slice(0, 10);
    dateIndex.set(key, i);
  }

  const indices = [];
  for (const sd of signalDates) {
    const key = new Date(sd).toISOString().slice(0, 10);
    const idx = dateIndex.get(key);
    if (idx != null) indices.push(idx);
  }

  const horizonStats = {};
  for (const h of horizons) {
    const returns = [];
    for (const idx of indices) {
      const r = returnAfter(closePrices, idx, h);
      if (r != null) returns.push(r);
    }
    horizonStats[h] = {
      n: returns.length,
      avg: mean(returns),
      median: median(returns),
      hitRate: hitRate(returns, (r) => r > 0),
      best: returns.length > 0 ? Math.max(...returns) : null,
      worst: returns.length > 0 ? Math.min(...returns) : null,
    };
  }

  return {
    n: indices.length,
    horizons: horizonStats,
  };
}

function backtestAllForTicker(data, horizons = [30, 60, 90]) {
  const { closePrices, dates, crossPoints = [], macdCrossPoints = [] } = data;

  const golden = crossPoints.filter((p) => p.type === "golden").map((p) => p.date);
  const death = crossPoints.filter((p) => p.type === "death").map((p) => p.date);
  const macdUp = macdCrossPoints.filter((p) => p.type === "bullish_cross").map((p) => p.date);
  const macdDown = macdCrossPoints.filter((p) => p.type === "bearish_cross").map((p) => p.date);

  return {
    golden: backtestSignal(closePrices, dates, golden, horizons),
    death: backtestSignal(closePrices, dates, death, horizons),
    bullish_cross: backtestSignal(closePrices, dates, macdUp, horizons),
    bearish_cross: backtestSignal(closePrices, dates, macdDown, horizons),
  };
}

module.exports = {
  backtestSignal,
  backtestAllForTicker,
  returnAfter,
  mean,
  median,
  hitRate,
};
