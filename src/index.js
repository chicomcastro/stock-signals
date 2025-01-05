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
  console.log('allClosePrices', allClosePrices, allClosePrices.length)
  console.log('historicalData', historicalData.map((data) => data.close), historicalData.length)
  console.log('allRsiValues', allRsiValues, allRsiValues.length)
  
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

  return {
    dates,
    closePrices,
    sma50: sma50Values,
    sma200: sma200Values,
    rsi: rsiValues,
    macd: macdValues.map(m => m.MACD),
  };
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
