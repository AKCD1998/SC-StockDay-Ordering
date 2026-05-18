import { config } from "../config.js";
import { MockRepository } from "./mockRepository.js";
import { PostgresRepository } from "./postgresRepository.js";

export async function createRepository() {
  if (config.dataMode === "mock") {
    return new MockRepository();
  }

  if (config.dataMode !== "postgres") {
    throw new Error(`Unsupported DATA_MODE: ${config.dataMode}`);
  }

  const repository = new PostgresRepository();
  await repository.init();
  return repository;
}
