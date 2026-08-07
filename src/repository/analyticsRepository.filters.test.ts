import { describe, expect, it } from "@jest/globals";
import { prisma } from "../prisma/prismaClient";
import { AnalyticsRepository } from "./analyticsRepository";

/**
 * Regressão para #19: garante que device/country/page realmente chegam
 * no `where` da query do Prisma — não só são aceitos e ignorados.
 * Segue o mesmo padrão de swap direto do client usado em
 * src/translation/worker.test.ts, sem precisar de um Mongo real.
 */
describe("AnalyticsRepository — filtros restringem o where do Prisma", () => {
  const ownerId = "owner-1";
  const startDate = new Date("2026-01-01");
  const endDate = new Date("2026-01-31");

  /** Swaps `prisma.visitor.count` to capture the `where` it was called with. */
  function withCapturedVisitorCountWhere() {
    const original = prisma.visitor.count;
    let capturedWhere: Record<string, unknown> = {};
    //biome-ignore lint/suspicious/noExplicitAny: test double, matching the delegate's actual runtime shape is not the point here
    (prisma.visitor as any).count = ({ where }: { where: Record<string, unknown> }) => {
      capturedWhere = where;
      return Promise.resolve(0);
    };
    return {
      getCapturedWhere: () => capturedWhere,
      restore: () => {
        prisma.visitor.count = original;
      },
    };
  }

  /** Swaps `prisma.pageView.count` to capture the `where` it was called with. */
  function withCapturedPageViewCountWhere() {
    const original = prisma.pageView.count;
    let capturedWhere: Record<string, unknown> = {};
    //biome-ignore lint/suspicious/noExplicitAny: test double, matching the delegate's actual runtime shape is not the point here
    (prisma.pageView as any).count = ({ where }: { where: Record<string, unknown> }) => {
      capturedWhere = where;
      return Promise.resolve(0);
    };
    return {
      getCapturedWhere: () => capturedWhere,
      restore: () => {
        prisma.pageView.count = original;
      },
    };
  }

  it("getUniqueVisitors adds device/country/page to visitor.count where", async () => {
    const repository = new AnalyticsRepository();
    const { getCapturedWhere, restore } = withCapturedVisitorCountWhere();

    try {
      await repository.getUniqueVisitors(ownerId, startDate, endDate, {
        device: "mobile",
        country: "BR",
        page: "/projects",
      });
    } finally {
      restore();
    }

    expect(getCapturedWhere()).toMatchObject({
      ownerId,
      device: "mobile",
      country: "BR",
      pageViews: { some: { page: "/projects" } },
    });
  });

  it("getUniqueVisitors omits the filter keys entirely when no filters are given", async () => {
    const repository = new AnalyticsRepository();
    const { getCapturedWhere, restore } = withCapturedVisitorCountWhere();

    try {
      await repository.getUniqueVisitors(ownerId, startDate, endDate);
    } finally {
      restore();
    }

    const where = getCapturedWhere();
    expect(where.device).toBeUndefined();
    expect(where.country).toBeUndefined();
    expect(where.pageViews).toBeUndefined();
  });

  it("getTotalPageViews maps device/country onto the visitor relation and page onto its own field", async () => {
    const repository = new AnalyticsRepository();
    const { getCapturedWhere, restore } = withCapturedPageViewCountWhere();

    try {
      await repository.getTotalPageViews(ownerId, startDate, endDate, {
        device: "desktop",
        country: "PT",
        page: "/about",
      });
    } finally {
      restore();
    }

    expect(getCapturedWhere()).toMatchObject({
      ownerId,
      page: "/about",
      visitor: { is: { device: "desktop", country: "PT" } },
    });
  });
});
