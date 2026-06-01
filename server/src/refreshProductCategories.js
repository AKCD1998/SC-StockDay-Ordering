import { PostgresRepository } from "./repositories/postgresRepository.js";

async function run() {
  const productCodes = process.argv.slice(2).filter(Boolean);
  const repository = new PostgresRepository();
  await repository.init();
  const result = await repository.refreshProductCategories(productCodes);
  console.log(JSON.stringify(result, null, 2));
  await repository.close();
}

run().catch(async (error) => {
  console.error(error.message);
  process.exit(1);
});
