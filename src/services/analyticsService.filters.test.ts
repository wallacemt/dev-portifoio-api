import { describe, expect, it } from "@jest/globals";
import { AnalyticsService } from "./analyticsService";

/**
 * Regressão para #19: `device`/`country`/`page` eram validados e entravam
 * na chave de cache, mas nenhuma chamada ao repository recebia esses
 * filtros — todas as agregações usavam só (ownerId, startDate, endDate).
 * Os testes abaixo travam a wiring: se algum filtro parar de ser
 * propagado, a call recorder abaixo pega.
 */
describe("AnalyticsService.getAnalytics — wiring dos filtros", () => {
  function buildRepositoryStub() {
    // Guarda só os args da última chamada de cada método — é o suficiente
    // pra provar que os filtros chegam (ou não) no repository.
    const lastCallArgs: Record<string, unknown[]> = {};
    const record =
      (name: string, resolvedValue: unknown) =>
      (...args: unknown[]) => {
        lastCallArgs[name] = args;
        return Promise.resolve(resolvedValue);
      };

    const repository = {
      getUniqueVisitors: record("getUniqueVisitors", 0),
      getTotalPageViews: record("getTotalPageViews", 0),
      getDeviceBreakdown: record("getDeviceBreakdown", {}),
      getTopPages: record("getTopPages", []),
      getTopCountries: record("getTopCountries", []),
      getTopBrowsers: record("getTopBrowsers", []),
      getBounceRate: record("getBounceRate", 0),
      getAverageTimeSpent: record("getAverageTimeSpent", 0),
      getDailyAnalytics: record("getDailyAnalytics", []),
    };

    return { repository, lastCallArgs };
  }

  it("propagates device/country/page filters to every repository aggregation call", async () => {
    const service = new AnalyticsService();
    const { repository, lastCallArgs } = buildRepositoryStub();
    (service as unknown as { analyticsRepository: unknown }).analyticsRepository = repository;

    await service.getAnalytics("owner-1", {
      device: "mobile",
      country: "BR",
      page: "/projects",
    });

    const expectedFilters = { device: "mobile", country: "BR", page: "/projects" };

    // (ownerId, startDate, endDate, filters) — filters is the 4th arg (index 3).
    expect(lastCallArgs.getUniqueVisitors?.[3]).toEqual(expectedFilters);
    expect(lastCallArgs.getTotalPageViews?.[3]).toEqual(expectedFilters);
    expect(lastCallArgs.getDeviceBreakdown?.[3]).toEqual(expectedFilters);
    expect(lastCallArgs.getBounceRate?.[3]).toEqual(expectedFilters);
    expect(lastCallArgs.getAverageTimeSpent?.[3]).toEqual(expectedFilters);

    // (ownerId, startDate, endDate, limit, filters) — filters is the 5th arg (index 4).
    expect(lastCallArgs.getTopPages?.[4]).toEqual(expectedFilters);
    expect(lastCallArgs.getTopCountries?.[4]).toEqual(expectedFilters);
    expect(lastCallArgs.getTopBrowsers?.[4]).toEqual(expectedFilters);
  });

  it("passes undefined filter fields through when no filters are given, preserving current behavior", async () => {
    const service = new AnalyticsService();
    const { repository, lastCallArgs } = buildRepositoryStub();
    (service as unknown as { analyticsRepository: unknown }).analyticsRepository = repository;

    await service.getAnalytics("owner-1");

    expect(lastCallArgs.getUniqueVisitors?.[3]).toEqual({
      device: undefined,
      country: undefined,
      page: undefined,
    });
  });
});
