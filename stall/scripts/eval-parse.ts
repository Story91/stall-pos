// Real-model eval for the speech -> sale parser. Not part of `npm test`.
// Usage: ANTHROPIC_API_KEY=... npm run eval:parse   (also reads .env.local / .env)
import { readFileSync } from "node:fs";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { CatalogItem } from "../src/db/schema";
import { parseSale } from "../src/lib/parse/parseSale";
import type { Language, ParsedItem } from "../src/lib/parse/schema";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // file absent: fine
  }
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY missing: set it in the environment or in stall/.env.local, then rerun `npm run eval:parse`.");
  process.exit(1);
}

type ExpectedItem = { nameIncludes: string; qty: number; unitCents: number };
type Case = { id: string; language: Language; transcript: string; expected: ExpectedItem[] };
type Fixture = {
  catalog: { name: string; aliases: string[]; defaultPriceCents: number | null; taxable: boolean }[];
  cases: Case[];
};

const fixture = JSON.parse(
  readFileSync(new URL("../evals/parse-transcripts.json", import.meta.url), "utf8"),
) as Fixture;

const catalog: CatalogItem[] = fixture.catalog.map((entry, i) => ({
  id: `eval-${i}`,
  businessId: "eval",
  sightings: 0,
  createdAt: new Date(0),
  ...entry,
}));

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function check(expected: ExpectedItem[], actual: ParsedItem[]): string[] {
  const problems: string[] = [];
  if (actual.length !== expected.length) {
    problems.push(`expected ${expected.length} items, got ${actual.length}`);
  }
  for (const want of expected) {
    const got = actual.find((item) => fold(item.name).includes(want.nameIncludes));
    if (!got) {
      problems.push(`missing item containing "${want.nameIncludes}"`);
    } else if (got.qty !== want.qty || got.unitCents !== want.unitCents) {
      problems.push(`${want.nameIncludes}: want ${want.qty} x ${want.unitCents}c, got ${got.qty} x ${got.unitCents}c`);
    }
  }
  return problems;
}

const model = createAnthropic({ apiKey })(process.env.AI_MODEL ?? "claude-sonnet-5-5");
let passed = 0;

for (const testCase of fixture.cases) {
  try {
    const sale = await parseSale(
      { transcript: testCase.transcript, language: testCase.language, catalog },
      { model },
    );
    const problems = check(testCase.expected, sale.items);
    if (problems.length === 0) {
      passed += 1;
      console.log(`PASS ${testCase.id}  "${testCase.transcript}"`);
    } else {
      console.log(`FAIL ${testCase.id}  "${testCase.transcript}"`);
      for (const problem of problems) console.log(`       ${problem}`);
    }
  } catch (error) {
    console.log(`FAIL ${testCase.id}  "${testCase.transcript}"`);
    console.log(`       error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(`\n${passed}/${fixture.cases.length} passed`);
process.exit(passed >= 10 ? 0 : 1);
