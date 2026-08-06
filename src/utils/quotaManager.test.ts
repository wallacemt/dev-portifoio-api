import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QuotaManager } from "./quotaManager";

// No REDIS_URL is set in the test env (see jest.setup.ts / .env.test), so these
// exercise the in-memory fallback path — the same path the API process uses
// when Redis is unavailable (RNF-03).
describe("QuotaManager (Fase 3 — ADR-04/ADR-07)", () => {
  beforeEach(async () => {
    await QuotaManager.clearMetrics();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shares one counter across two independent call sites (simulating API + worker)", async () => {
    const before = (await QuotaManager.getQuotaStatus()).dailyRequestsUsed;

    await QuotaManager.recordRequest(); // "API process" recording a call
    await QuotaManager.recordRequest(); // "worker process" recording a call

    expect((await QuotaManager.getQuotaStatus()).dailyRequestsUsed).toBe(before + 2);
  });

  it("rejects requests once the given ceiling is reached, regardless of which ceiling is passed", async () => {
    await QuotaManager.recordRequest();
    await QuotaManager.recordRequest();

    await expect(QuotaManager.canMakeRequest(2)).resolves.toBe(false);
    await expect(QuotaManager.canMakeRequest(3)).resolves.toBe(true);
  });

  it("rolls the counter over on a new day without manual reset bookkeeping", async () => {
    const realDateNow = Date.now;
    const day1 = new Date("2026-08-06T12:00:00.000Z").getTime();
    const day2 = new Date("2026-08-07T00:00:01.000Z").getTime();

    jest.spyOn(Date, "now").mockReturnValue(day1);
    await QuotaManager.recordRequest();
    expect((await QuotaManager.getQuotaStatus()).dailyRequestsUsed).toBe(1);

    jest.spyOn(Date, "now").mockReturnValue(day2);
    expect((await QuotaManager.getQuotaStatus()).dailyRequestsUsed).toBe(0);

    Date.now = realDateNow;
  });
});
