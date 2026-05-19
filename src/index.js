const { createApp } = require("./server");

const app = createApp();

if (require.main === module) {
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Stock Signals rodando em http://localhost:${port}`);
  });
}

module.exports = app;
