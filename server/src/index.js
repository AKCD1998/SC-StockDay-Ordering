import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { createRepository } from "./repositories/index.js";
import { createRouter } from "./routes.js";

const app = express();
const repository = await createRepository();

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(createRouter(repository));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    mode: config.dataMode,
    timestamp: new Date().toISOString(),
  });
});

const server = app.listen(config.port, () => {
  console.log(`SC-StockDay-Ordering API listening on http://localhost:${config.port}`);
});

async function shutdown() {
  server.close(async () => {
    if (repository?.close) {
      await repository.close();
    }
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
