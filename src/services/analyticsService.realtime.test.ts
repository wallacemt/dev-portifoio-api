import { describe, expect, it } from "@jest/globals";
import { AnalyticsService } from "./analyticsService";

describe("AnalyticsService — SSE realtime helpers", () => {
  it("getOnlineVisitorsCount degrades to 0 when Redis is unavailable (no REDIS_URL)", async () => {
    // No REDIS_URL is set in this test environment, so getRedisClient() returns
    // null and the SSE endpoint must fall back to polling instead of throwing.
    process.env.REDIS_URL = undefined;
    const service = new AnalyticsService();

    const count = await service.getOnlineVisitorsCount("owner-123");

    expect(count).toBe(0);
  });
});
