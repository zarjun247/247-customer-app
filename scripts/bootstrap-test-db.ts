import { applyTestMigrations } from "../server/testUtils/dbTestLifecycle";

await applyTestMigrations();
console.log("Test MySQL database is reachable and Drizzle migrations are applied.");
