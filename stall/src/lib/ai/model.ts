import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import { env } from "@/lib/env";

export function getModel(): LanguageModel {
  return createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })(env.AI_MODEL);
}
