import { TranslationService } from "../services/geminiService";

interface QuotaMetrics {
  dailyRequests: number;
  lastRequestTime: number;
  lastResetTime: number;
  rateLimitHit: boolean;
  consecutiveFailures: number;
}

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

  public static async canMakeRequest(): Promise<boolean> {
    const now = Date.now();
    if (this.isNewDay(now)) {
      this.resetDailyMetrics();
    }
    if (this.metrics.dailyRequests >= this.MAX_DAILY_REQUESTS) {
      console.warn("Daily Gemini API quota limit reached. Returning cached/original data only.");
      return false;
    }
    if (this.metrics.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
      console.warn("Too many consecutive API failures. Throttling requests.");
      return false;
    }
    const timeSinceLastRequest = now - this.metrics.lastRequestTime;
    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
      const waitTime = this.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      console.log(`Waiting ${waitTime}ms before next request to respect rate limits`);
      await this.delay(waitTime);
    }

    return true;
  }

  public static recordRequest(): void {
    this.metrics.dailyRequests++;
    this.metrics.lastRequestTime = Date.now();
  }

  public static recordSuccess(): void {
    this.metrics.consecutiveFailures = 0;
    this.metrics.rateLimitHit = false;
  }

  public static recordFailure(isQuotaError: boolean = false): void {
    this.metrics.consecutiveFailures++;
    if (isQuotaError) {
      this.metrics.rateLimitHit = true;
    }
  }

  public static getQuotaStatus(): {
    dailyRequestsUsed: number;
    dailyRequestsRemaining: number;
    rateLimitHit: boolean;
    consecutiveFailures: number;
    canMakeRequest: boolean;
  } {
    const now = Date.now();
    if (this.isNewDay(now)) {
      this.resetDailyMetrics();
    }

    return {
      dailyRequestsUsed: this.metrics.dailyRequests,
      dailyRequestsRemaining: this.MAX_DAILY_REQUESTS - this.metrics.dailyRequests,
      rateLimitHit: this.metrics.rateLimitHit,
      consecutiveFailures: this.metrics.consecutiveFailures,
      canMakeRequest:
        this.metrics.dailyRequests < this.MAX_DAILY_REQUESTS &&
        this.metrics.consecutiveFailures < this.MAX_CONSECUTIVE_FAILURES,
    };
  }

  public static clearMetrics(): void {
    this.resetDailyMetrics();
    this.metrics.consecutiveFailures = 0;
    this.metrics.rateLimitHit = false;
    TranslationService.clearCache();
    console.log("Quota metrics and translation cache cleared");
  }

  private static isNewDay(now: number): boolean {
    const lastReset = new Date(this.metrics.lastResetTime);
    const current = new Date(now);

    return (
      lastReset.getDate() !== current.getDate() ||
      lastReset.getMonth() !== current.getMonth() ||
      lastReset.getFullYear() !== current.getFullYear()
    );
  }

  private static resetDailyMetrics(): void {
    this.metrics.dailyRequests = 0;
    this.metrics.lastResetTime = Date.now();
    this.metrics.rateLimitHit = false;
    console.log("Daily quota metrics reset");
  }

  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
