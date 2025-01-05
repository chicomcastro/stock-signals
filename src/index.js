const express = require("express");
const yahooFinance = require("yahoo-finance2").default;
const { RSI, SMA, MACD } = require("technicalindicators");
const path = require("path");
const fs = require("fs");
const app = express();

app.use(express.static("public")); // Serve arquivos estáticos

function getDateRange(period, includeExtraHistory = false) {
  const now = new Date();
  let date;
  
  switch (period) {
    case "1M":
      date = new Date(now);
      date.setMonth(now.getMonth() - 1);
      break;
    case "3M":
      date = new Date(now);
      date.setMonth(now.getMonth() - 3);
      break;
    case "6M":
      date = new Date(now);
      date.setMonth(now.getMonth() - 6);
      break;
    case "1Y":
      date = new Date(now);
      date.setFullYear(now.getFullYear() - 1);
      break;
    case "5Y":
      date = new Date(now);
      date.setFullYear(now.getFullYear() - 5);
      break;
    case "ALL":
    default:
      return { period1: "2000-01-01" };
  }

  // Se precisamos de dados extras para os indicadores, adiciona períodos extras
  if (includeExtraHistory) {
    // Adiciona 200 dias para SMA200 + 26 dias para MACD + 14 dias para RSI
    const extraDays = 2 * Math.max(200, 26 + 9, 14);
    const backExtraDays = new Date(date.getTime() - (extraDays * 24 * 60 * 60 * 1000));
    return { period1: backExtraDays };
  }

  return { period1: date };
}

function findCrossPoints(sma50Values, sma200Values, dates, closePrices) {
  const crossPoints = [];
  let lastState = null;
  
  // Começamos do início para identificar os cruzamentos na ordem correta
  for (let i = 0; i < sma50Values.length; i++) {
    const sma50Value = sma50Values[i];
    const sma200Value = sma200Values[i];
    
    if (sma50Value && sma200Value) {
      const currentState = sma50Value > sma200Value;
      
      if (lastState !== null && currentState !== lastState) {
        crossPoints.push({
          date: dates[i],
          type: currentState ? 'golden' : 'death',
          value: closePrices[i]
        });
      }
      
      lastState = currentState;
    }
  }
  
  return crossPoints;
}

function findMacdCrossPoints(macdValues, dates, closePrices) {
  const macdCrossPoints = [];
  
  for (let i = 1; i < macdValues.length; i++) {
    const currentMacd = macdValues[i];
    const prevMacd = macdValues[i - 1];
    
    if (prevMacd !== null && currentMacd !== null) {
      // Verifica se houve cruzamento (mudança de sinal)
      if ((prevMacd < 0 && currentMacd >= 0) || (prevMacd > 0 && currentMacd <= 0)) {
        macdCrossPoints.push({
          date: dates[i],
          type: prevMacd < 0 ? 'up' : 'down',
          value: closePrices[i]
        });
      }
    }
  }
  
  return macdCrossPoints;
}

function analyzePrice(currentPrice, currentSMA200) {
  return {
    value: currentPrice,
    signal: currentPrice > currentSMA200 ? 'entry' : 'exit',
    message: currentPrice > currentSMA200 ? 
      'Acima da MA200 (Entrada)' : 
      'Abaixo da MA200 (Saída)'
  };
}

function analyzeRSI(currentRSI) {
  let signal = 'neutral';
  let message = 'Neutro';
  
  if (currentRSI > 70) {
    signal = 'exit';
    message = 'Sobrecomprado (Saída)';
  } else if (currentRSI < 30) {
    signal = 'entry';
    message = 'Sobrevendido (Entrada)';
  }
  
  return {
    value: currentRSI,
    signal,
    message
  };
}

function analyzeMACD(currentMACD, prevMACD) {
  let signal = 'neutral';
  let message = 'Sem sinal';
  
  if (currentMACD > 0 && prevMACD < 0) {
    signal = 'entry';
    message = 'MACD cruza acima da linha de sinal (Tendência de alta)';
  } else if (currentMACD < 0 && prevMACD > 0) {
    signal = 'exit';
    message = 'MACD cruza abaixo da linha de sinal (Tendência de baixa)';
  }
  
  return {
    value: currentMACD,
    signal,
    message
  };
}

function analyzeCross(currentSMA50, currentSMA200, prevSMA50, prevSMA200) {
  const currentCross = currentSMA50 > currentSMA200;
  const prevCross = prevSMA50 > prevSMA200;
  let signal = 'neutral';
  let message = 'Sem Cruzamento';
  
  if (currentCross && !prevCross) {
    signal = 'entry';
    message = 'Golden Cross (Entrada)';
  } else if (!currentCross && prevCross) {
    signal = 'exit';
    message = 'Death Cross (Saída)';
  } else if (currentCross) {
    signal = 'entry';
    message = 'MA50 acima da MA200';
  } else {
    signal = 'exit';
    message = 'MA50 abaixo da MA200';
  }
  
  return {
    signal,
    message
  };
}

function analyzeIndicators(data, index) {
  const currentPrice = data.closePrices[index];
  const currentSMA50 = data.sma50[index];
  const currentSMA200 = data.sma200[index];
  const currentRSI = data.rsi[index];
  const currentMACD = data.macd[index];
  
  const prevPrice = data.closePrices[index - 1];
  const prevSMA50 = data.sma50[index - 1];
  const prevSMA200 = data.sma200[index - 1];
  const prevRSI = data.rsi[index - 1];
  const prevMACD = data.macd[index - 1];

  return {
    date: data.dates[index],
    price: analyzePrice(currentPrice, currentSMA200),
    rsi: analyzeRSI(currentRSI),
    macd: analyzeMACD(currentMACD, prevMACD),
    cross: analyzeCross(currentSMA50, currentSMA200, prevSMA50, prevSMA200)
  };
}

async function fetchHistoricalData(ticker, period = "3M") {
  // Primeiro, busca dados extras para calcular os indicadores
  const extraDateRange = getDateRange(period, true);
  const historicalDataExtra = await yahooFinance.historical(ticker, {
    ...extraDateRange,
    interval: "1d"
  });

  if (!historicalDataExtra || historicalDataExtra.length === 0) {
    throw new Error("Ativo não encontrado ou sem dados.");
  }

  // Agora busca apenas os dados do período solicitado
  const dateRange = getDateRange(period, false);
  const startDate = dateRange.period1;
  
  // Filtra os dados para o período solicitado
  const historicalData = historicalDataExtra.filter(data => new Date(data.date) >= startDate);

  // Calcula todos os indicadores usando o dataset completo
  const allClosePrices = historicalDataExtra.map((data) => data.close);
  
  // Calcula as médias móveis
  const allSma50Values = SMA.calculate({ period: 50, values: allClosePrices });
  const allSma200Values = SMA.calculate({ period: 200, values: allClosePrices });
  
  // Calcula RSI
  const allRsiValues = RSI.calculate({ 
    period: 14, 
    values: allClosePrices,
  });
  
  // Calcula MACD
  const allMacdValues = MACD.calculate({
    values: allClosePrices,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });

  // Pega apenas os valores correspondentes ao período solicitado
  const offset = allClosePrices.length - historicalData.length;
  const sma50Values = allSma50Values.slice(offset - 49);
  const sma200Values = allSma200Values.slice(offset - 199);
  const rsiValues = allRsiValues.slice(offset - 14);
  const macdValues = allMacdValues.slice(offset - 25);

  const closePrices = historicalData.map((data) => data.close);
  const dates = historicalData.map((data) => data.date);

  // Calcula os pontos de cruzamento
  const crossPoints = findCrossPoints(sma50Values, sma200Values, dates, closePrices);
  const macdCrossPoints = findMacdCrossPoints(macdValues.map(m => m.MACD), dates, closePrices);

  // Prepara os dados para retorno
  const responseData = {
    dates,
    closePrices,
    sma50: sma50Values,
    sma200: sma200Values,
    rsi: rsiValues,
    macd: macdValues.map(m => m.MACD),
    crossPoints,
    macdCrossPoints
  };

  // Adiciona análise para cada ponto do gráfico
  responseData.analysis = dates.map((_, index) => analyzeIndicators(responseData, index));

  return responseData;
}

// Rota para servir o template do gráfico
app.get("/:ticker", (req, res) => {
  const { ticker } = req.params;
  if (ticker.toLowerCase() === "favicon.ico") {
    return res.status(404).send();
  }

  const templatePath = path.join(__dirname, "../public/chart.html");
  fs.readFile(templatePath, "utf8", (err, template) => {
    if (err) {
      return res.status(500).send("Erro ao carregar o template");
    }
    const html = template.replace(/{{ticker}}/g, ticker.toUpperCase());
    res.send(html);
  });
});

app.get("/data/:ticker", async (req, res) => {
  try {
    const { ticker } = req.params;
    const period = req.query.period || "3M";
    const data = await fetchHistoricalData(`${ticker}.SA`, period);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Inicia o servidor
app.listen(3000, () => {
  console.log("Servidor rodando em http://localhost:3000");
});
