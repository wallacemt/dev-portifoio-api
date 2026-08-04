import { describe, expect, it } from "@jest/globals";
import type { TrackVisitorRequest } from "../types/analytics";
import { AnalyticsService } from "./analyticsService";

const baseVisitor: TrackVisitorRequest = {
  sessionId: "sess-1",
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
  device: "desktop",
  landingPage: "/",
};

describe("AnalyticsService — precisão da coleta", () => {
  it("trackVisitor ignores bot user-agents without touching the repository", async () => {
    const service = new AnalyticsService();
    // Repository stub that throws if called — a bot request must short-circuit
    // before any DB access happens.
    (service as unknown as { analyticsRepository: unknown }).analyticsRepository = {
      findVisitorBySessionId: () => {
        throw new Error("should not be called for a bot request");
      },
    };

    const result = await service.trackVisitor(
      { ...baseVisitor, userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
      "owner-1",
      "127.0.0.1"
    );

    expect(result).toEqual({ id: "bot", sessionId: "sess-1", isExisting: true });
  });

  it("trackPageView returns the existing record instead of creating a duplicate within the dedupe window", async () => {
    const service = new AnalyticsService();
    const existingVisitor = { id: "visitor-1", sessionId: "sess-1" };
    const recentDuplicate = { id: "pageview-existing", page: "/projects", visitorId: "visitor-1" };

    let createPageViewCalled = false;
    (service as unknown as { analyticsRepository: unknown }).analyticsRepository = {
      findVisitorBySessionId: () => Promise.resolve(existingVisitor),
      findRecentPageView: () => Promise.resolve(recentDuplicate),
      createPageView: () => {
        createPageViewCalled = true;
        return Promise.resolve({ id: "pageview-new", page: "/projects" });
      },
    };

    const result = await service.trackPageView(
      { sessionId: "sess-1", page: "/projects" },
      "owner-1",
      baseVisitor,
      "127.0.0.1"
    );

    expect(result).toBe(recentDuplicate);
    expect(createPageViewCalled).toBe(false);
  });
});
