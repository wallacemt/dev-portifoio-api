import { TranslationService } from '../services/geminiService';
import { devDebugger } from './devDebugger';

interface QuotaMetrics {
  dailyRequests: number;
  lastRequestTime: number;
  lastResetTime: number;
  rateLimitHit: boolean;
  consecutiveFailures: number;
}

//biome-ignore lint: This method is better for application
export class QuotaManager {
  private static metrics: QuotaMetrics = {
    dailyRequests: 0,
    lastRequestTime: 0,
    lastResetTime: Date.now(),
    rateLimitHit: false,
    consecutiveFailures: 0,
  };

  private static readonly MAX_DAILY_REQUESTS = 180;
  private static readonly MIN_REQUEST_INTERVAL = 1000;
  private static readonly MAX_CONSECUTIVE_FAILURES = 3;

   static async canMakeRequest(): Promise<boolean> {
    const now = Date.now();
    if (QuotaManager.isNewDay(now)) {
      QuotaManager.resetDailyMetrics();
    }
    if (QuotaManager.metrics.dailyRequests >= QuotaManager.MAX_DAILY_REQUESTS) {
      devDebugger('Daily Gemini API quota limit reached. Returning cached/original data only.', undefined, "warn");
      return false;
    }
    if (
      QuotaManager.metrics.consecutiveFailures >=
      QuotaManager.MAX_CONSECUTIVE_FAILURES
    ) {
      devDebugger('Too many consecutive API failures. Throttling requests.', undefined, "warn");
      return false;
    }
    const timeSinceLastRequest = now - QuotaManager.metrics.lastRequestTime;
    if (timeSinceLastRequest < QuotaManager.MIN_REQUEST_INTERVAL) {
      const waitTime = QuotaManager.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      devDebugger(`Waiting ${waitTime}ms before next request to respect rate limits`, undefined, );
      await QuotaManager.delay(waitTime);
    }

    return true;
  }

   static recordRequest(): void {
    QuotaManager.metrics.dailyRequests++;
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

   static getQuotaStatus(): {
    dailyRequestsUsed: number;
    dailyRequestsRemaining: number;
    rateLimitHit: boolean;
    consecutiveFailures: number;
    canMakeRequest: boolean;
  } {
    const now = Date.now();
    if (QuotaManager.isNewDay(now)) {
      QuotaManager.resetDailyMetrics();
    }

    return {
      dailyRequestsUsed: QuotaManager.metrics.dailyRequests,
      dailyRequestsRemaining:
        QuotaManager.MAX_DAILY_REQUESTS - QuotaManager.metrics.dailyRequests,
      rateLimitHit: QuotaManager.metrics.rateLimitHit,
      consecutiveFailures: QuotaManager.metrics.consecutiveFailures,
      canMakeRequest:
        QuotaManager.metrics.dailyRequests < QuotaManager.MAX_DAILY_REQUESTS &&
        QuotaManager.metrics.consecutiveFailures <
          QuotaManager.MAX_CONSECUTIVE_FAILURES,
    };
  }

   static clearMetrics(): void {
    QuotaManager.resetDailyMetrics();
    QuotaManager.metrics.consecutiveFailures = 0;
    QuotaManager.metrics.rateLimitHit = false;
    TranslationService.clearCache();

    devDebugger('Quota metrics and translation cache cleared', undefined);
  }

  private static isNewDay(now: number): boolean {
    const lastReset = new Date(QuotaManager.metrics.lastResetTime);
    const current = new Date(now);

    return (
      lastReset.getDate() !== current.getDate() ||
      lastReset.getMonth() !== current.getMonth() ||
      lastReset.getFullYear() !== current.getFullYear()
    );
  }

  private static resetDailyMetrics(): void {
    QuotaManager.metrics.dailyRequests = 0;
    QuotaManager.metrics.lastResetTime = Date.now();
    QuotaManager.metrics.rateLimitHit = false;
    devDebugger('Daily quota metrics reset', undefined);
  }

  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
