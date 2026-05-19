const B3_PATTERN = /^[A-Z]{4}[0-9]{1,2}$/;
const VALID_INPUT = /^[A-Za-z0-9.\-=^]{1,15}$/;

function isValidTickerInput(input) {
  if (typeof input !== "string" || input.length === 0) return false;
  return VALID_INPUT.test(input);
}

function normalizeTicker(input) {
  if (!isValidTickerInput(input)) {
    throw new Error("Ticker inválido");
  }
  const upper = input.toUpperCase();

  if (upper.includes(".") || upper.includes("-") || upper.includes("=") || upper.startsWith("^")) {
    return upper;
  }

  if (B3_PATTERN.test(upper)) {
    return `${upper}.SA`;
  }

  return upper;
}

function displayTicker(normalized) {
  if (typeof normalized !== "string") return "";
  return normalized.replace(/\.SA$/, "");
}

module.exports = { normalizeTicker, displayTicker, isValidTickerInput };
