import { openDatabase } from "./client";

const handle = openDatabase();
await handle.migrate();
await handle.close();
console.log(`Migrations applied (${handle.kind}).`);
