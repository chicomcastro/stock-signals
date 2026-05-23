const { RSI, SMA, MACD } = require("technicalindicators");

function findMaCrossPoints(sma50Values, sma200Values, dates, closePrices) {
  const crossPoints = [];
  let lastState = null;

  for (let i = 0; i < sma50Values.length; i++) {
    const sma50 = sma50Values[i];
    const sma200 = sma200Values[i];

    if (sma50 == null || sma200 == null) continue;

    const currentState = sma50 > sma200;

    if (lastState !== null && currentState !== lastState) {
      crossPoints.push({
        date: dates[i],
        type: currentState ? "golden" : "death",
        value: closePrices[i],
      });
    }

    lastState = currentState;
  }

  return crossPoints;
}

function findMacdSignalCrossPoints(macdLineValues, macdSignalValues, dates, closePrices) {
  const crossPoints = [];

  for (let i = 1; i < macdLineValues.length; i++) {
    const currLine = macdLineValues[i];
    const currSignal = macdSignalValues[i];
    const prevLine = macdLineValues[i - 1];
    const prevSignal = macdSignalValues[i - 1];

    if (currLine == null || currSignal == null || prevLine == null || prevSignal == null) continue;

    const currDiff = currLine - currSignal;
    const prevDiff = prevLine - prevSignal;

    if (prevDiff <= 0 && currDiff > 0) {
      crossPoints.push({
        date: dates[i],
        type: "bullish_cross",
        value: closePrices[i],
      });
    } else if (prevDiff >= 0 && currDiff < 0) {
      crossPoints.push({
        date: dates[i],
        type: "bearish_cross",
        value: closePrices[i],
      });
    }
  }

  return crossPoints;
}

function analyzePrice(currentPrice, currentSMA200) {
  if (currentPrice == null || currentSMA200 == null) {
    return { value: currentPrice, signal: "neutral", message: "Sem dados suficientes" };
  }
  return {
    value: currentPrice,
    signal: currentPrice > currentSMA200 ? "entry" : "exit",
    message: currentPrice > currentSMA200
      ? "Acima da média de 1 ano — favorece alta"
      : "Abaixo da média de 1 ano — favorece baixa",
  };
}

function analyzeRSI(currentRSI) {
  if (currentRSI == null) {
    return { value: currentRSI, signal: "neutral", message: "Sem dados suficientes" };
  }
  if (currentRSI > 70) return { value: currentRSI, signal: "exit", message: "Sobrecomprado — subiu rápido, pode pausar" };
  if (currentRSI < 30) return { value: currentRSI, signal: "entry", message: "Sobrevendido — caiu demais, pode reagir" };
  return { value: currentRSI, signal: "neutral", message: "Em zona neutra" };
}

function analyzeMACD(currentLine, currentSignal, prevLine, prevSignal, currentHistogram) {
  if (currentLine == null || currentSignal == null || prevLine == null || prevSignal == null) {
    return {
      value: currentLine,
      signal: "neutral",
      message: "Sem dados suficientes",
      histogram: currentHistogram ?? null,
    };
  }

  const currDiff = currentLine - currentSignal;
  const prevDiff = prevLine - prevSignal;

  let signal = "neutral";
  let message = "Sem cruzamento recente";

  if (prevDiff <= 0 && currDiff > 0) {
    signal = "entry";
    message = "Cruzou acima da linha de sinal — momentum virou para cima";
  } else if (prevDiff >= 0 && currDiff < 0) {
    signal = "exit";
    message = "Cruzou abaixo da linha de sinal — momentum virou para baixo";
  } else if (currDiff > 0) {
    signal = "entry";
    message = "Acima da linha de sinal — momentum a favor da alta";
  } else if (currDiff < 0) {
    signal = "exit";
    message = "Abaixo da linha de sinal — momentum a favor da baixa";
  }

  return {
    value: currentLine,
    signal,
    message,
    histogram: currentHistogram ?? null,
  };
}

function analyzeCross(currentSMA50, currentSMA200, prevSMA50, prevSMA200) {
  if (currentSMA50 == null || currentSMA200 == null) {
    return { signal: "neutral", message: "Sem dados suficientes" };
  }

  const currentCross = currentSMA50 > currentSMA200;
  const prevCross = prevSMA50 != null && prevSMA200 != null ? prevSMA50 > prevSMA200 : null;

  if (prevCross === false && currentCross) return { signal: "entry", message: "Golden Cross — começo de tendência de alta" };
  if (prevCross === true && !currentCross) return { signal: "exit", message: "Death Cross — começo de tendência de baixa" };
  if (currentCross) return { signal: "entry", message: "MA50 acima da MA200 — favorável" };
  return { signal: "exit", message: "MA50 abaixo da MA200 — desfavorável" };
}

function analyzeIndicators(data, index) {
  const currentPrice = data.closePrices[index];
  const currentSMA50 = data.sma50[index];
  const currentSMA200 = data.sma200[index];
  const currentRSI = data.rsi[index];
  const currentMacdLine = data.macdLine[index];
  const currentMacdSignal = data.macdSignal[index];
  const currentMacdHist = data.macdHistogram[index];

  const prevSMA50 = data.sma50[index - 1];
  const prevSMA200 = data.sma200[index - 1];
  const prevMacdLine = data.macdLine[index - 1];
  const prevMacdSignal = data.macdSignal[index - 1];

  return {
    date: data.dates[index],
    price: analyzePrice(currentPrice, currentSMA200),
    rsi: analyzeRSI(currentRSI),
    macd: analyzeMACD(currentMacdLine, currentMacdSignal, prevMacdLine, prevMacdSignal, currentMacdHist),
    cross: analyzeCross(currentSMA50, currentSMA200, prevSMA50, prevSMA200),
  };
}

function alignToDates(values, totalDates, lookback) {
  const padding = new Array(Math.max(0, lookback - 1)).fill(null);
  const aligned = padding.concat(values);
  while (aligned.length < totalDates) aligned.push(null);
  return aligned.slice(0, totalDates);
}

function computeIndicators(closePrices) {
  const sma50Raw = SMA.calculate({ period: 50, values: closePrices });
  const sma200Raw = SMA.calculate({ period: 200, values: closePrices });
  const rsiRaw = RSI.calculate({ period: 14, values: closePrices });
  const macdRaw = MACD.calculate({
    values: closePrices,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });

  const total = closePrices.length;
  const sma50 = alignToDates(sma50Raw, total, 50);
  const sma200 = alignToDates(sma200Raw, total, 200);
  const rsi = alignToDates(rsiRaw, total, 15);

  const macdLineRaw = macdRaw.map((m) => (m.MACD == null ? null : m.MACD));
  const macdSignalRaw = macdRaw.map((m) => (m.signal == null ? null : m.signal));
  const macdHistRaw = macdRaw.map((m) => (m.histogram == null ? null : m.histogram));

  const macdLine = alignToDates(macdLineRaw, total, 26);
  const macdSignal = alignToDates(macdSignalRaw, total, 26 + 9 - 1);
  const macdHistogram = alignToDates(macdHistRaw, total, 26 + 9 - 1);

  return { sma50, sma200, rsi, macdLine, macdSignal, macdHistogram };
}

module.exports = {
  findMaCrossPoints,
  findMacdSignalCrossPoints,
  analyzePrice,
  analyzeRSI,
  analyzeMACD,
  analyzeCross,
  analyzeIndicators,
  computeIndicators,
  alignToDates,
};
