import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["dev", "test", "production"]).default("dev"),
  MONGODB_URI: z.string().min(1),
  PORT: z.string().min(1),
  FRONTEND_URL: z.string().url(),
  JWT_SECRET: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
});

export const env = envSchema.parse(process.env);
