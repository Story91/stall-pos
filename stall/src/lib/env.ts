import { z } from "zod";

const schema = z.object({
  PAYPAL_CLIENT_ID: z.string().min(1),
  PAYPAL_CLIENT_SECRET: z.string().min(1),
  PAYPAL_WEBHOOK_ID: z.string().min(1),
  PAYPAL_ENV: z.enum(["sandbox", "live"]).default("sandbox"),
  DATABASE_URL: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  AI_MODEL: z.string().min(1).default("claude-sonnet-5-5"),
  OWNER_PIN: z.string().min(1),
  CLOSE_TRIGGER_KEY: z.string().min(1),
  BUSINESS_TZ: z.string().min(1).default("America/Chicago"),
  APP_URL: z.string().min(1).default("http://localhost:3000"),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment variables: ${problems}`);
  }
  return result.data;
}

// `env` parses process.env on first property access, not at import time, so
// importing this module (e.g. in a test or during `next build`) never throws.
let cached: Env | undefined;
export const env: Env = new Proxy({} as Env, {
  get(_target, prop) {
    // Symbols and "then" are probed by await, console.log and pretty-printers;
    // answering them must not trigger validation.
    if (typeof prop === "symbol" || prop === "then") return undefined;
    cached ??= loadEnv(process.env);
    return cached[prop as keyof Env];
  },
});
