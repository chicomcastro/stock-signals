const express = require("express");
const yahooFinance = require("yahoo-finance2").default;
const { RSI, SMA, MACD } = require("technicalindicators");
const path = require("path");
const fs = require("fs");
const app = express();

app.use(express.static("public")); // Serve arquivos estáticos

function getDateRange(period) {
  const now = new Date();
  switch (period) {
    case "1M":
      const oneMonthAgo = new Date(now);
      oneMonthAgo.setMonth(now.getMonth() - 1);
      return { period1: oneMonthAgo };
    case "3M":
      const threeMonthsAgo = new Date(now);
      threeMonthsAgo.setMonth(now.getMonth() - 3);
      return { period1: threeMonthsAgo };
    case "6M":
      const sixMonthsAgo = new Date(now);
      sixMonthsAgo.setMonth(now.getMonth() - 6);
      return { period1: sixMonthsAgo };
    case "1Y":
      const oneYearAgo = new Date(now);
      oneYearAgo.setFullYear(now.getFullYear() - 1);
      return { period1: oneYearAgo };
    case "5Y":
      const fiveYearsAgo = new Date(now);
      fiveYearsAgo.setFullYear(now.getFullYear() - 5);
      return { period1: fiveYearsAgo };
    case "ALL":
    default:
      return { period1: "2000-01-01" };
  }
}

async function fetchHistoricalData(ticker, period = "3M") {
  const dateRange = getDateRange(period);
  const historicalData = await yahooFinance.historical(ticker, {
    ...dateRange,
    interval: "1d"
  });

  if (!historicalData || historicalData.length === 0) {
    throw new Error("Ativo não encontrado ou sem dados.");
  }

  const closePrices = historicalData.map((data) => data.close);
  const dates = historicalData.map((data) => data.date);

  // Calcula indicadores
  const sma50 = SMA.calculate({ period: 50, values: closePrices });
  const sma200 = SMA.calculate({ period: 200, values: closePrices });
  const rsi = RSI.calculate({ period: 14, values: closePrices });
  const macd = MACD.calculate({
    values: closePrices,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });

  return {
    dates,
    closePrices,
    sma50,
    sma200,
    rsi,
    macd,
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
