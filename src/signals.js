function isWithinDays(date, refDate, days) {
  const ms = days * 24 * 60 * 60 * 1000;
  return refDate.getTime() - new Date(date).getTime() <= ms;
}

function extractDailySignals(analysis, dates, recencyDays = 3, referenceDate = new Date()) {
  if (!Array.isArray(analysis) || analysis.length === 0) return [];
  const out = [];

  for (let i = 0; i < analysis.length; i++) {
    const a = analysis[i];
    const d = dates[i];
    if (!d) continue;
    if (!isWithinDays(d, referenceDate, recencyDays)) continue;

    if (a.cross && a.cross.message && /Golden Cross/.test(a.cross.message)) {
      out.push({ date: d, type: "golden", message: a.cross.message });
    } else if (a.cross && a.cross.message && /Death Cross/.test(a.cross.message)) {
      out.push({ date: d, type: "death", message: a.cross.message });
    }

    if (a.macd && a.macd.message && /cruzou acima da linha de sinal/.test(a.macd.message)) {
      out.push({ date: d, type: "bullish_cross", message: a.macd.message });
    } else if (a.macd && a.macd.message && /cruzou abaixo da linha de sinal/.test(a.macd.message)) {
      out.push({ date: d, type: "bearish_cross", message: a.macd.message });
    }

    if (a.rsi && a.rsi.signal === "entry" && a.rsi.value != null && a.rsi.value < 30) {
      out.push({ date: d, type: "rsi_oversold", message: `RSI em ${a.rsi.value.toFixed(1)}` });
    } else if (a.rsi && a.rsi.signal === "exit" && a.rsi.value != null && a.rsi.value > 70) {
      out.push({ date: d, type: "rsi_overbought", message: `RSI em ${a.rsi.value.toFixed(1)}` });
    }
  }

  return out;
}

function aggregateSignals(perTickerResults) {
  const buckets = {
    golden: [],
    death: [],
    bullish_cross: [],
    bearish_cross: [],
    rsi_oversold: [],
    rsi_overbought: [],
  };

  for (const { ticker, signals } of perTickerResults) {
    for (const s of signals) {
      if (!buckets[s.type]) continue;
      buckets[s.type].push({ ticker, ...s });
    }
  }

  for (const k of Object.keys(buckets)) {
    buckets[k].sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  return buckets;
}

const DEFAULT_UNIVERSE = [
  "PETR4", "VALE3", "ITUB4", "BBDC4", "BBAS3", "MGLU3", "TOTS3", "LWSA3",
  "WEGE3", "RENT3", "LREN3", "JBSS3", "BRFS3", "ABEV3", "B3SA3", "BPAC11",
  "BOVA11", "IVVB11", "SMAL11", "HASH11",
  "AAPL34", "MSFT34", "GOGL34", "AMZO34", "TSLA34", "NVDA34",
  "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA",
  "BTC-USD", "ETH-USD", "SOL-USD",
  "USDBRL=X", "EURBRL=X",
];

module.exports = {
  extractDailySignals,
  aggregateSignals,
  isWithinDays,
  DEFAULT_UNIVERSE,
};
