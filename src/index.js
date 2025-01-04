const express = require("express");
const yahooFinance = require("yahoo-finance2").default;
const { RSI, SMA, MACD } = require("technicalindicators");
const path = require("path");
const fs = require("fs");
const app = express();

app.use(express.static("public")); // Serve arquivos estáticos

async function fetchHistoricalData(ticker) {
  const historicalData = await yahooFinance.historical(ticker, {
    period1: "2023-01-01",
    interval: "1d",
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
    const data = await fetchHistoricalData(`${ticker}.SA`);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Inicia o servidor
app.listen(3000, () => {
  console.log("Servidor rodando em http://localhost:3000");
});
