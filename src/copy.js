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
      title: "Preço vs média de 200 dias",
      explain:
        "A MA200 é o termômetro de longo prazo. Acima dela, a tendência geral é de alta; abaixo, de baixa.",
    },
    rsi: {
      title: "RSI (Força do movimento)",
      explain:
        "Mede quão forte é a alta ou a baixa recente. Acima de 70 = pode estar 'esticado' demais para cima. Abaixo de 30 = pode ter caído demais.",
    },
    macd: {
      title: "MACD (Momentum)",
      explain:
        "Compara duas médias de curto prazo para mostrar se o preço está acelerando ou desacelerando. Quando a linha do MACD cruza a linha de sinal, costuma marcar uma virada.",
    },
    cross: {
      title: "Cruzamento das médias 50 × 200",
      explain:
        "Quando a média de 50 dias cruza acima da de 200, o mercado costuma encarar como início de tendência de alta (Golden Cross). O oposto é o Death Cross.",
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
