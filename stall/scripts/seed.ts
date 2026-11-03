import { db } from "../src/db";
import { seed } from "../src/db/seed";

const result = await seed(db);
console.log("Seeded La Esquina:", result);
process.exit(0);
