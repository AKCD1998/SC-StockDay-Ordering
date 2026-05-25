import dotenv from "dotenv";

dotenv.config();

const dataMode = process.env.DATA_MODE || (String(process.env.USE_MOCK_DATA || "true") === "true" ? "mock" : "postgres");

export const config = {
  port: Number(process.env.SERVER_PORT || 4000),
  dataMode,
  databaseUrl: process.env.DATABASE_URL || "",
  databaseSsl:
    String(process.env.DATABASE_SSL || "").toLowerCase() === "true" ||
    /render\.com/i.test(process.env.DATABASE_URL || ""),
  defaultPeriodDays: Number(process.env.DEFAULT_PERIOD_DAYS || 30),
  isMockMode: dataMode === "mock",
};
