# Stock Signals 📈

Uma aplicação web para análise técnica de ações, fornecendo sinais de compra e venda baseados em indicadores técnicos.

## Funcionalidades 🚀

- **Visualização de Preços**: Gráfico interativo com preços de fechamento
- **Médias Móveis**: 
  - MA50 (Média Móvel de 50 períodos)
  - MA200 (Média Móvel de 200 períodos)
  - Identificação automática de Golden Cross e Death Cross
- **Indicadores Técnicos**:
  - RSI (Índice de Força Relativa)
  - MACD (Convergência/Divergência de Médias Móveis)
- **Sinais Automáticos**:
  - Golden Cross (MA50 cruza acima da MA200)
  - Death Cross (MA50 cruza abaixo da MA200)
  - Cruzamentos do MACD com zero
  - Níveis de Sobrecompra/Sobrevenda do RSI
- **Análise em Tempo Real**:
  - Box de análise com interpretação dos indicadores
  - Atualização dinâmica ao clicar em qualquer ponto do gráfico
- **Períodos Flexíveis**:
  - 1 Mês
  - 3 Meses
  - 6 Meses
  - 1 Ano
  - 5 Anos
  - Histórico Completo

## Framework de Análise 📊

A aplicação utiliza um framework simplificado para identificar pontos de entrada e saída:

1. **Análise de Tendência**:
   - Preço em relação às médias móveis
   - Identificação de Golden Cross e Death Cross

2. **Força do Movimento**:
   - RSI para identificar sobrecompra/sobrevenda
   - MACD para confirmar momentum

3. **Sinais Combinados**:
   - Integração de múltiplos indicadores
   - Redução de falsos sinais

## Instalação 🛠️

1. Clone o repositório:
```bash
git clone https://github.com/seu-usuario/stock-signals.git
cd stock-signals
```

2. Instale as dependências:
```bash
npm install
```

3. Inicie o servidor de desenvolvimento:
```bash
npm run dev
```

4. Acesse a aplicação em:
```
http://localhost:3000
```

## Uso 💡

1. Na página inicial, você encontrará exemplos de tickers para analisar
2. Clique em um ticker ou digite um novo na URL (ex: /PETR4)
3. Use os botões de período para ajustar o intervalo de tempo
4. Clique em qualquer ponto do gráfico para ver a análise daquele dia
5. Observe os sinais automáticos marcados no gráfico:
   - ⭐ Golden Cross (amarelo)
   - ⭐ Death Cross (vermelho)
   - 🔺 MACD Cruzamento Alta (verde)
   - 🔻 MACD Cruzamento Baixa (vermelho)

## Tecnologias Utilizadas 🔧

- **Backend**:
  - Node.js
  - Express
  - Yahoo Finance API

- **Frontend**:
  - HTML5
  - CSS3
  - JavaScript
  - Chart.js

## Desenvolvimento 👨‍💻

Para desenvolvimento, o projeto usa nodemon para auto-reload:

```bash
npm run dev
```

## Contribuindo 🤝

1. Faça um Fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## Licença 📝

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## Disclaimer ⚠️

Esta aplicação é apenas para fins educacionais e não constitui recomendação de investimento. Sempre faça sua própria análise e consulte um profissional financeiro antes de investir. 