import { createHash } from "node:crypto";
import { getRedisClient } from "../utils/redisClient";
import { devDebugger } from "../utils/devDebugger";

const REDIS_KEY_PREFIX = "translation:";
const REDIS_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const MEM_TTL_MS = 24 * 60 * 60 * 1000; // 1 day (in-memory fallback)

interface MemCacheItem {
  data: object;
  expires: number;
}

const memCache = new Map<string, MemCacheItem>();

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function buildCacheKey(obj: object, targetLang: string, sourceLang: string): string {
  const raw = `${JSON.stringify(obj)}_${sourceLang}_${targetLang}`;
  return hashKey(raw);
}

export const TranslationCache = {
  makeKey: buildCacheKey,

  async get(key: string): Promise<object | null> {
    const redis = getRedisClient();
    if (redis) {
      try {
        const stored = await redis.get(`${REDIS_KEY_PREFIX}${key}`);
        if (stored) return JSON.parse(stored) as object;
      } catch (err) {
        devDebugger(`Redis get error: ${(err as Error).message}`, undefined, "warn");
      }
    }

    // Fallback: in-memory
    const item = memCache.get(key);
    if (item && Date.now() < item.expires) return item.data;
    if (item) memCache.delete(key);
    return null;
  },

  async set(key: string, data: object): Promise<void> {
    const redis = getRedisClient();
    if (redis) {
      try {
        await redis.set(`${REDIS_KEY_PREFIX}${key}`, JSON.stringify(data), "EX", REDIS_TTL_SECONDS);
        return;
      } catch (err) {
        devDebugger(`Redis set error: ${(err as Error).message}`, undefined, "warn");
      }
    }

    // Fallback: in-memory
    memCache.set(key, { data, expires: Date.now() + MEM_TTL_MS });
    cleanMemCache();
  },

  async delete(key: string): Promise<void> {
    const redis = getRedisClient();
    if (redis) {
      try {
        await redis.del(`${REDIS_KEY_PREFIX}${key}`);
      } catch (err) {
        devDebugger(`Redis del error: ${(err as Error).message}`, undefined, "warn");
      }
    }
    memCache.delete(key);
  },

  async clearAll(): Promise<void> {
    const redis = getRedisClient();
    if (redis) {
      try {
        const keys = await redis.keys(`${REDIS_KEY_PREFIX}*`);
        if (keys.length > 0) await redis.del(...keys);
      } catch (err) {
        devDebugger(`Redis clear error: ${(err as Error).message}`, undefined, "warn");
      }
    }
    memCache.clear();
  },

  async stats(): Promise<{ backend: "redis" | "memory"; size: number; ttlDays: number }> {
    const redis = getRedisClient();
    if (redis) {
      try {
        const keys = await redis.keys(`${REDIS_KEY_PREFIX}*`);
        return { backend: "redis", size: keys.length, ttlDays: 30 };
      } catch {
        // fall through
      }
    }
    return { backend: "memory", size: memCache.size, ttlDays: 1 };
  },
};

function cleanMemCache(): void {
  const now = Date.now();
  for (const [key, item] of memCache.entries()) {
    if (now >= item.expires) memCache.delete(key);
  }
}
