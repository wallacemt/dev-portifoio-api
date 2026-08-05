import { afterAll, afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { mock } from "bun:test";

// analyticsController.ts -> authPolice.ts -> ../env parses process.env eagerly
// with zod. Set required vars before requiring the controller below (`require`
// runs inline, unlike a static `import`, which is hoisted).
process.env.DATABASE_URL ??= "mongodb://localhost:27017/test";
process.env.PORT ??= "3000";
process.env.FRONTEND_URL ??= '["http://localhost:3000"]';
process.env.JWT_SECRET ??= "test-jwt-secret";
process.env.GEMINI_API_KEY ??= "test";
process.env.CLOUDINARY_CLOUD_NAME ??= "test";
process.env.CLOUDINARY_API_KEY ??= "test";
process.env.CLOUDINARY_API_SECRET ??= "test";
process.env.SELF_URL ??= "http://localhost:3000";
process.env.AI_MODEL ??= "test";

class FakeSubscriber {
  handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  quitCalled = false;
  unsubscribeCalled = false;
  shouldFailSubscribe = false;

  on(event: string, cb: (...args: unknown[]) => void) {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event].push(cb);
    return this;
  }

  removeAllListeners() {
    this.handlers = {};
    return this;
  }

  subscribe(_channel: string) {
    return this.shouldFailSubscribe ? Promise.reject(new Error("subscribe boom")) : Promise.resolve(1);
  }

  unsubscribe() {
    this.unsubscribeCalled = true;
    return Promise.resolve();
  }

  quit() {
    this.quitCalled = true;
    return Promise.resolve("OK");
  }

  emit(event: string, ...args: unknown[]) {
    for (const cb of this.handlers[event] ?? []) cb(...args);
  }
}

class FakeRedisClient {
  shouldFailSubscribe = false;
  lastSubscriber: FakeSubscriber | null = null;

  duplicate() {
    const subscriber = new FakeSubscriber();
    subscriber.shouldFailSubscribe = this.shouldFailSubscribe;
    this.lastSubscriber = subscriber;
    return subscriber;
  }
}

// Swapped per-test; the mocked module always reads through this reference.
// Bun compiles named exports as readonly bindings, so plain property
// assignment on the required module throws — mock.module is the supported
// way to override an ES module's exports for a test.
let currentFakeClient: FakeRedisClient | null = null;

mock.module("../utils/redisClient", () => ({
  getRedisClient: () => currentFakeClient,
}));

const { AnalyticsController } = require("./analyticsController");

function buildRes() {
  const res: {
    writes: string[];
    ended: boolean;
    writeHead: (...args: unknown[]) => typeof res;
    write: (chunk: string) => boolean;
    end: () => void;
  } = {
    writes: [],
    ended: false,
    writeHead(..._args: unknown[]) {
      return res;
    },
    write(chunk: string) {
      res.writes.push(chunk);
      return true;
    },
    end() {
      res.ended = true;
    },
  };
  return res;
}

function buildReq(userId: string) {
  let closeHandler: (() => void) | undefined;
  const req = {
    userId,
    on(event: string, cb: () => void) {
      if (event === "close") closeHandler = cb;
    },
  };
  return { req, triggerClose: () => closeHandler?.() };
}

// setInterval spy: real timers keep running otherwise (heartbeat/poll), which
// would leak across tests. We capture calls and let production code create
// real intervals so req.on("close") can clearInterval them normally, then
// restore the original afterEach.
const originalSetInterval = global.setInterval;
let intervalCalls: number[] = [];

beforeEach(() => {
  intervalCalls = [];
  global.setInterval = ((fn: () => void, ms: number) => {
    intervalCalls.push(ms);
    return originalSetInterval(fn, ms);
  }) as typeof setInterval;
});

afterEach(() => {
  global.setInterval = originalSetInterval;
});

const SSE_POLL_FALLBACK_MS = 10_000;

function buildControllerWithStubbedService() {
  const controller = new AnalyticsController();
  // Real AnalyticsService would hit Mongo/Redis for real data — irrelevant
  // to the fallback logic under test here, and slow without a live DB.
  controller.analyticsService = {
    getOnlineVisitorsCount: () => Promise.resolve(0),
    getRealTimeAnalytics: () =>
      Promise.resolve({ activeVisitors: 0, topActivePages: [], recentVisitors: [] }),
  };
  return controller;
}

describe("AnalyticsController.streamAnalytics — Redis subscriber resilience", () => {
  it("falls back to polling when subscribe() rejects at startup", async () => {
    currentFakeClient = new FakeRedisClient();
    currentFakeClient.shouldFailSubscribe = true;

    const controller = buildControllerWithStubbedService();
    const { req, triggerClose } = buildReq("owner-1");
    const res = buildRes();

    await controller.streamAnalytics(req, res);

    expect(intervalCalls).toContain(SSE_POLL_FALLBACK_MS);

    triggerClose();
  });

  it("falls back to polling when the subscriber emits a runtime error", async () => {
    currentFakeClient = new FakeRedisClient();

    const controller = buildControllerWithStubbedService();
    const { req, triggerClose } = buildReq("owner-2");
    const res = buildRes();

    await controller.streamAnalytics(req, res);

    // Subscribed successfully — no polling fallback yet.
    expect(intervalCalls).not.toContain(SSE_POLL_FALLBACK_MS);

    const subscriber = currentFakeClient.lastSubscriber as FakeSubscriber;
    subscriber.emit("error", new Error("connection lost"));

    // stopSubscriber() chains unsubscribe().finally(quit()) — both fake
    // promises, but still resolve on a later microtask than emit() itself.
    await Promise.resolve();
    await Promise.resolve();

    expect(subscriber.quitCalled).toBe(true);
    expect(intervalCalls).toContain(SSE_POLL_FALLBACK_MS);

    triggerClose();
  });

  afterAll(() => {
    // Other test files run in this same process and expect getRedisClient()
    // to behave like "no REDIS_URL" (returns null) unless they set up their
    // own stub — leave the shared module export in that state.
    currentFakeClient = null;
  });
});
