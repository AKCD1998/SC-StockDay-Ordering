import cors from "cors";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import { createRepository } from "./repositories/index.js";
import { createRouter } from "./routes.js";

const app = express();
const repository = await createRepository();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminDistPath = path.resolve(__dirname, "../../dist/admin-web");

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(createRouter(repository));
app.use(express.static(adminDistPath));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    mode: config.dataMode,
    timestamp: new Date().toISOString(),
  });
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/admin/")) {
    return next();
  }

  return res.sendFile(path.join(adminDistPath, "index.html"));
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
