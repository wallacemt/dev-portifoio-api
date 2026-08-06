import { env } from '../env';
import { TranslationCache } from '../services/translationCacheService';
import { devDebugger } from './devDebugger';
import { getRedisClient } from './redisClient';

interface QuotaMetrics {
  lastRequestTime: number;
  rateLimitHit: boolean;
  consecutiveFailures: number;
}

// In-memory fallback for the daily counter, used only when Redis is unavailable
// (the API process is allowed to run without Redis — RNF-03). The worker process
// requires REDIS_URL at boot (worker-entry.ts / ADR-04), so it never hits this path.
interface MemoryDailyCounter {
  day: string;
  count: number;
}

//biome-ignore lint: This method is better for application
export class QuotaManager {
  private static metrics: QuotaMetrics = {
    lastRequestTime: 0,
    rateLimitHit: false,
    consecutiveFailures: 0,
  };

  private static memoryCounter: MemoryDailyCounter = { day: '', count: 0 };

  private static readonly MIN_REQUEST_INTERVAL = 2500;
  private static readonly MAX_CONSECUTIVE_FAILURES = 3;
  // Comfortably past a day (accounts for clock drift), so a stale key never lingers.
  private static readonly DAILY_KEY_TTL_SECONDS = 26 * 60 * 60;

  // Routed through `Date.now()` (rather than `new Date()`) so tests can mock
  // a single primordial and reliably simulate day rollover.
  private static today(): string {
    return new Date(Date.now()).toISOString().slice(0, 10); // YYYY-MM-DD
  }

  private static dailyKey(): string {
    return `quota:daily:${QuotaManager.today()}`;
  }

  /**
   * Reads the shared daily request count. Backed by Redis (`INCR` + `EXPIRE`)
   * so the API process and the worker process count against the same total —
   * the day rollover is handled for free by the date-stamped key, no manual
   * "is it a new day" bookkeeping needed (ADR-04).
   */
  private static async getDailyRequests(): Promise<number> {
    const redis = getRedisClient();
    if (redis) {
      try {
        const value = await redis.get(QuotaManager.dailyKey());
        return value ? Number.parseInt(value, 10) : 0;
      } catch (err) {
        devDebugger(`Redis get error (quota counter): ${(err as Error).message}`, undefined, 'warn');
      }
    }
    return QuotaManager.readMemoryCounter();
  }

  private static async incrementDailyRequests(): Promise<void> {
    const redis = getRedisClient();
    if (redis) {
      try {
        const key = QuotaManager.dailyKey();
        const count = await redis.incr(key);
        if (count === 1) await redis.expire(key, QuotaManager.DAILY_KEY_TTL_SECONDS);
        return;
      } catch (err) {
        devDebugger(`Redis incr error (quota counter): ${(err as Error).message}`, undefined, 'warn');
      }
    }
    QuotaManager.memoryCounter = { day: QuotaManager.today(), count: QuotaManager.readMemoryCounter() + 1 };
  }

  private static readMemoryCounter(): number {
    if (QuotaManager.memoryCounter.day !== QuotaManager.today()) {
      QuotaManager.memoryCounter = { day: QuotaManager.today(), count: 0 };
    }
    return QuotaManager.memoryCounter.count;
  }

  /**
   * @param maxDailyRequests - which ceiling to enforce against the shared
   * counter. Defaults to the account-wide `MAX_DAILY_REQUESTS`. The worker
   * passes its own `WORKER_DAILY_BUDGET` before deciding to process a job,
   * so both processes bound their own path while still sharing one counter.
   */
  static async canMakeRequest(maxDailyRequests = env.MAX_DAILY_REQUESTS): Promise<boolean> {
    const dailyRequests = await QuotaManager.getDailyRequests();
    if (dailyRequests >= maxDailyRequests) {
      devDebugger('Daily OpenRouter API quota limit reached. Returning cached/original data only.', undefined, "warn");
      return false;
    }
    if (
      QuotaManager.metrics.consecutiveFailures >=
      QuotaManager.MAX_CONSECUTIVE_FAILURES
    ) {
      devDebugger('Too many consecutive API failures. Throttling requests.', undefined, "warn");
      return false;
    }
    const now = Date.now();
    const timeSinceLastRequest = now - QuotaManager.metrics.lastRequestTime;
    if (timeSinceLastRequest < QuotaManager.MIN_REQUEST_INTERVAL) {
      const waitTime = QuotaManager.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      devDebugger(`Waiting ${waitTime}ms before next request to respect rate limits`, undefined, );
      await QuotaManager.delay(waitTime);
    }

    return true;
  }

   static async recordRequest(): Promise<void> {
    await QuotaManager.incrementDailyRequests();
    QuotaManager.metrics.lastRequestTime = Date.now();
  }

   static recordSuccess(): void {
    QuotaManager.metrics.consecutiveFailures = 0;
    QuotaManager.metrics.rateLimitHit = false;
  }

   static recordFailure(isQuotaError = false): void {
    QuotaManager.metrics.consecutiveFailures++;
    if (isQuotaError) {
      QuotaManager.metrics.rateLimitHit = true;
    }
  }

   static async getQuotaStatus(): Promise<{
    dailyRequestsUsed: number;
    dailyRequestsRemaining: number;
    rateLimitHit: boolean;
    consecutiveFailures: number;
    canMakeRequest: boolean;
  }> {
    const dailyRequests = await QuotaManager.getDailyRequests();

    return {
      dailyRequestsUsed: dailyRequests,
      dailyRequestsRemaining: env.MAX_DAILY_REQUESTS - dailyRequests,
      rateLimitHit: QuotaManager.metrics.rateLimitHit,
      consecutiveFailures: QuotaManager.metrics.consecutiveFailures,
      canMakeRequest:
        dailyRequests < env.MAX_DAILY_REQUESTS &&
        QuotaManager.metrics.consecutiveFailures <
          QuotaManager.MAX_CONSECUTIVE_FAILURES,
    };
  }

   static async clearMetrics(): Promise<void> {
    const redis = getRedisClient();
    if (redis) {
      try {
        await redis.del(QuotaManager.dailyKey());
      } catch (err) {
        devDebugger(`Redis del error (quota counter): ${(err as Error).message}`, undefined, 'warn');
      }
    }
    QuotaManager.memoryCounter = { day: '', count: 0 };
    QuotaManager.metrics.consecutiveFailures = 0;
    QuotaManager.metrics.rateLimitHit = false;
    await TranslationCache.clearAll().catch((e) => devDebugger('Failed to clear translation cache', e, 'warn'));

    devDebugger('Quota metrics and translation cache cleared', undefined);
  }

  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
