function escapeXml(unsafe) {
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case '"': return "&quot;";
      default: return c;
    }
  });
}

function formatPrice(price, currency) {
  if (price == null || Number.isNaN(price)) return "—";
  const formatted = Number(price).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${currency} ${formatted}` : formatted;
}

function formatChange(changePercent) {
  if (changePercent == null || Number.isNaN(changePercent)) return null;
  const sign = changePercent >= 0 ? "+" : "";
  return `${sign}${Number(changePercent).toFixed(2)}%`;
}

function tickerOgSvg({ ticker, name, price, changePercent, currency, signalLabel }) {
  const isUp = changePercent != null && changePercent >= 0;
  const accent = isUp ? "#10b981" : "#ef4444";
  const change = formatChange(changePercent);
  const safeTicker = escapeXml(ticker);
  const safeName = escapeXml(name ?? "");
  const safePrice = escapeXml(formatPrice(price, currency));
  const safeChange = change ? escapeXml(change) : "";
  const safeSignal = signalLabel ? escapeXml(signalLabel) : "Stock Signals";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="0" y="0" width="12" height="630" fill="${accent}"/>
  <text x="80" y="120" fill="#94a3b8" font-size="28" font-weight="500" letter-spacing="6">STOCK SIGNALS</text>
  <text x="80" y="260" fill="#f8fafc" font-size="140" font-weight="800" letter-spacing="-2">${safeTicker}</text>
  <text x="80" y="320" fill="#cbd5e1" font-size="36" font-weight="400">${safeName}</text>
  <text x="80" y="450" fill="#f8fafc" font-size="72" font-weight="700">${safePrice}</text>
  ${safeChange ? `<text x="80" y="510" fill="${accent}" font-size="44" font-weight="600">${safeChange}</text>` : ""}
  <text x="80" y="580" fill="#64748b" font-size="24" font-weight="500">${safeSignal}</text>
</svg>`;
}

function defaultOgSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="0" y="0" width="12" height="630" fill="#10b981"/>
  <text x="80" y="200" fill="#94a3b8" font-size="32" font-weight="500" letter-spacing="8">STOCK SIGNALS</text>
  <text x="80" y="340" fill="#f8fafc" font-size="92" font-weight="800" letter-spacing="-2">Sinais técnicos da B3</text>
  <text x="80" y="410" fill="#cbd5e1" font-size="40" font-weight="400">Golden Cross, MACD, RSI — sem ruído</text>
  <text x="80" y="560" fill="#10b981" font-size="28" font-weight="600">stock-signals · gratuito · educacional</text>
</svg>`;
}

module.exports = { tickerOgSvg, defaultOgSvg, escapeXml };
