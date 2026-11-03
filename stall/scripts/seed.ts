import { db } from "../src/db";
import { seed } from "../src/db/seed";

const url = process.env.DATABASE_URL ?? "";
const safe = ["localhost", "127.0.0.1", "neon.tech"].some((h) => url.includes(h));
if (!safe && process.env.SEED_FORCE !== "1") {
  console.error(
    "Refusing to seed: DATABASE_URL is not localhost, 127.0.0.1 or neon.tech (seeding wipes all tables). Set SEED_FORCE=1 to override.",
  );
  process.exit(1);
}

const result = await seed(db);
console.log("Seeded La Esquina:", result);
process.exit(0);
