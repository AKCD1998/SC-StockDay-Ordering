import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  return dotenv.parse(fs.readFileSync(filePath, "utf8"));
}

const rootEnvPath = path.resolve(__dirname, "../../.env");
const serverEnvPath = path.resolve(__dirname, "../.env");

const fileEnv = {
  ...readEnvFile(rootEnvPath),
  ...readEnvFile(serverEnvPath),
};

const env = {
  ...fileEnv,
  ...process.env,
};

const dataMode = env.DATA_MODE || (String(env.USE_MOCK_DATA || "true") === "true" ? "mock" : "postgres");

export const config = {
  port: Number(env.PORT || env.SERVER_PORT || 4000),
  dataMode,
  databaseUrl: env.DATABASE_URL || "",
  databaseSsl:
    String(env.DATABASE_SSL || "").toLowerCase() === "true" ||
    /render\.com/i.test(env.DATABASE_URL || ""),
  defaultPeriodDays: Number(env.DEFAULT_PERIOD_DAYS || 30),
  branchStockSyncToken: env.BRANCH_STOCK_SYNC_TOKEN || "",
  posApiKey: env.POS_API_KEY || env.BRANCH_STOCK_SYNC_TOKEN || "",
  isMockMode: dataMode === "mock",
  // Per-branch opaque tokens for PDA devices.
  // Each branch has its own token so a compromised branch-001 token
  // cannot be used to read branch-005 prices.
  // Set PDA_TOKEN_000 .. PDA_TOKEN_005 in .env / Render env vars.
  // Branches with an empty/unset token are always rejected.
  pdaBranchTokens: {
    "000": env.PDA_TOKEN_000 || "",
    "001": env.PDA_TOKEN_001 || "",
    "002": env.PDA_TOKEN_002 || "",
    "003": env.PDA_TOKEN_003 || "",
    "004": env.PDA_TOKEN_004 || "",
    "005": env.PDA_TOKEN_005 || "",
  },
};
