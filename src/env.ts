import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  PORT: z.string().min(1),
  FRONTEND_URL: z
    .string({
      invalid_type_error: "Expected array, received string",
    })
    .transform((urlsString) => {
      const urls = JSON.parse(urlsString);
      //biome-ignore lint:regex is correct
      return urls.map((url: string) => url.replace(/\/$/, ""));
    }),
  JWT_SECRET: z.string().min(1),
  OPENROUTER_API_KEY: z.string(),
  CLOUDINARY_CLOUD_NAME: z.string(),
  CLOUDINARY_API_KEY: z.string(),
  CLOUDINARY_API_SECRET: z.string(),
  SELF_URL: z.string(),
  AI_MODEL: z.string().default("google/gemma-4-31b-it:free"),
  // Chat-completions endpoint the translation service calls. Defaults to
  // OpenRouter; point at a local Ollama instead (e.g.
  // http://ollama:11434/v1/chat/completions) to run bulk translation against
  // a local model without touching OPENROUTER_API_KEY/quota — Ollama ignores
  // the bearer token it's sent. Swap back to the OpenRouter default when done.
  AI_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1/chat/completions"),
  REDIS_URL: z.string().optional(),
  // OpenRouter's free-tier daily cap is per-account (depends on account credit —
  // ~50/day under $10, ~1000/day above it), so it must be changeable without a
  // redeploy (ADR-07).
  MAX_DAILY_REQUESTS: z.coerce.number().int().positive().default(45),
  // Worker's own sub-ceiling against the same shared counter (ADR-04), so the
  // on-demand/API path always keeps budget left over.
  WORKER_DAILY_BUDGET: z.coerce.number().int().positive().default(25),
  // Target languages for the translation worker/backfill (ADR-01/RF-03). `pt` is
  // the source language and is never a target.
  SUPPORTED_LANGUAGES: z.string().default("en,es,fr,ja,ko,zh,it"),
}).refine((data) => data.WORKER_DAILY_BUDGET < data.MAX_DAILY_REQUESTS, {
  message:
    "WORKER_DAILY_BUDGET must be lower than MAX_DAILY_REQUESTS — otherwise the worker's sub-ceiling never protects the on-demand path (ADR-04).",
  path: ["WORKER_DAILY_BUDGET"],
});

const parsedEnv = envSchema.parse(process.env);

export const env = {
  ...parsedEnv,
  SUPPORTED_LANGUAGES: parsedEnv.SUPPORTED_LANGUAGES.split(",")
    .map((lang) => lang.trim())
    .filter(Boolean),
};
