import Redis from "ioredis";
import { devDebugger } from "./devDebugger";

let client: Redis | null = null;
let permanentlyFailed = false;

export function getRedisClient(): Redis | null {
  if (permanentlyFailed) return null;
  if (client) return client;

  const url = process.env.REDIS_URL;
  if (!url) return null;

  client = new Redis(url, {
    connectTimeout: 3000,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => {
      if (times > 4) {
        permanentlyFailed = true;
        devDebugger("Redis: max reconnection attempts reached, disabling", undefined, "warn");
        return null;
      }
      return Math.min(times * 500, 2000);
    },
  });

  client.on("error", (err) => {
    devDebugger(`Redis error: ${err.message}`, undefined, "warn");
  });

  client.on("end", () => {
    devDebugger("Redis connection ended");
    client = null;
  });

  client.on("connect", () => {
    devDebugger("Redis connected");
  });

  return client;
}

export function resetRedisClient(): void {
  client?.disconnect();
  client = null;
  permanentlyFailed = false;
}
