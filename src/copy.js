const FRIENDLY = {
  signals: {
    golden: {
      label: "Cruzamento de alta",
      short: "Alta",
      tag: "🟢",
      tooltip:
        "A média móvel curta (50 dias) cruzou para cima da longa (200 dias). É clássico sinal de tendência de alta começando.",
    },
    death: {
      label: "Cruzamento de baixa",
      short: "Baixa",
      tag: "🔴",
      tooltip:
        "A média móvel curta (50 dias) cruzou para baixo da longa (200 dias). Sinal de tendência de baixa começando.",
    },
    bullish_cross: {
      label: "Momentum de alta (MACD)",
      short: "MACD ↑",
      tag: "🔺",
      tooltip:
        "A linha do MACD cruzou para cima da linha de sinal. Indica que o momentum (a 'pressa' do preço) está virando para o lado positivo.",
    },
    bearish_cross: {
      label: "Momentum de baixa (MACD)",
      short: "MACD ↓",
      tag: "🔻",
      tooltip:
        "A linha do MACD cruzou para baixo da linha de sinal. Indica que o momentum está virando para o lado negativo.",
    },
    rsi_oversold: {
      label: "Sobrevenda (RSI < 30)",
      short: "Sobrevenda",
      tag: "🟦",
      tooltip:
        "O RSI mede se o ativo está caindo de mais (sobrevenda) ou subindo de mais (sobrecompra). Abaixo de 30 = pode estar barato demais e em vias de reagir.",
    },
    rsi_overbought: {
      label: "Sobrecompra (RSI > 70)",
      short: "Sobrecompra",
      tag: "🟧",
      tooltip:
        "Acima de 70, o RSI sinaliza que o ativo subiu rápido demais e pode pausar ou corrigir.",
    },
  },
  indicators: {
    price_vs_ma200: {
      title: "Preço × média de 1 ano (MA200)",
      explain:
        "A MA200 é o preço médio dos últimos 200 pregões (≈1 ano). Preço acima dela = mercado paga mais que a média do ano (bull market). Abaixo = paga menos (bear market). Fundos e algoritmos usam essa linha como gatilho — vira profecia auto-realizada.",
    },
    rsi: {
      title: "RSI (Força do movimento)",
      explain:
        "Mede o ritmo da subida vs descida nos últimos 14 pregões (0 a 100). Acima de 70: subiu rápido demais, pode pausar. Abaixo de 30: caiu demais, pode reagir. Em tendências fortes, fica fora dessa faixa por semanas — não é gatilho automático.",
    },
    macd: {
      title: "MACD (Momentum)",
      explain:
        "Detecta quando o preço muda de marcha. Linha do MACD cruzando acima da linha de sinal = acelerando para cima. Cruzando abaixo = acelerando para baixo. O histograma mostra a força da tendência atual.",
    },
    cross: {
      title: "Cruzamento das médias (MA50 × MA200)",
      explain:
        "Golden Cross: a MA50 cruza acima da MA200 — início clássico de tendência de alta, costuma durar meses. Death Cross: o oposto. Sinais lentos — só aparecem quando a tendência já se estabeleceu.",
    },
  },
  periods: {
    "1M": { label: "1 mês", short: "1M" },
    "3M": { label: "3 meses", short: "3M" },
    "6M": { label: "6 meses", short: "6M" },
    "1Y": { label: "1 ano", short: "1A" },
    "5Y": { label: "5 anos", short: "5A" },
    ALL: { label: "Tudo", short: "Tudo" },
  },
  actions: {
    entry: { label: "Possível entrada", color: "var(--accent-up)", emoji: "📈" },
    exit: { label: "Possível saída", color: "var(--accent-down)", emoji: "📉" },
    neutral: { label: "Neutro", color: "var(--muted)", emoji: "➖" },
  },
  empty: {
    favorites: "Você ainda não favoritou nenhum ativo. Toque na estrela na página de um ativo para começar sua watchlist.",
    signals: "Nenhum sinal novo no último pregão. Volte amanhã ou ative os alertas.",
    search: "Digite ao menos 2 letras para buscar.",
  },
};

function describeSignal(type) {
  return FRIENDLY.signals[type] || { label: type, short: type, tag: "•", tooltip: "" };
}

function describeIndicator(key) {
  return FRIENDLY.indicators[key] || { title: key, explain: "" };
}

function describePeriod(period) {
  return FRIENDLY.periods[period] || { label: period, short: period };
}

function describeAction(signal) {
  return FRIENDLY.actions[signal] || FRIENDLY.actions.neutral;
}

module.exports = { FRIENDLY, describeSignal, describeIndicator, describePeriod, describeAction };
