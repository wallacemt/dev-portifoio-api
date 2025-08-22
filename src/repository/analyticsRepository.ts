//@viom
import { prisma } from "../prisma/prismaClient";
import type {
  AnalyticsFilters,
  DailyAnalytics,
  PageViewData,
  RealTimeAnalytics,
  VisitorData,
} from "../types/analytics";

export class AnalyticsRepository {
  /**
   * Cria ou atualiza um visitante
   */
  async upsertVisitor(visitorData: VisitorData) {
    return await prisma.visitor.upsert({
      where: { sessionId: visitorData.sessionId },
      update: {
        ipAddress: visitorData.ipAddress,
        country: visitorData.country,
        city: visitorData.city,
      },
      create: visitorData,
    });
  }

  /**
   * Busca um visitante pelo sessionId
   */
  async findVisitorBySessionId(sessionId: string) {
    return await prisma.visitor.findUnique({
      where: { sessionId },
    });
  }

  /**
   * Registra uma visualização de página
   */
  async createPageView(pageViewData: PageViewData) {
    return await prisma.pageView.create({
      data: pageViewData,
    });
  }

  /**
   * Busca analytics diárias com filtros
   */
  async getDailyAnalytics(ownerId: string, filters: AnalyticsFilters) {
    const whereClause = {
      ownerId,
      date: {
        gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        lte: new Date(),
      },
    };

    if (filters.startDate && filters.endDate) {
      whereClause.date = {
        gte: filters.startDate,
        lte: filters.endDate,
      };
    }

    return await prisma.analyticsDaily.findMany({
      where: whereClause,
      orderBy: { date: "asc" },
    });
  }

  /**
   * Cria ou atualiza analytics diárias
   */
  async upsertDailyAnalytics(date: Date, data: Partial<DailyAnalytics>, ownerId: string) {
    const dateOnly = new Date(date.toDateString());

    return await prisma.analyticsDaily.upsert({
      where: { date: dateOnly },
      update: {
        ...data,
        updatedAt: new Date(),
      },
      create: {
        date: dateOnly,
        ownerId,
        ...data,
      },
    });
  }

  /**
   * Busca visitantes únicos em um período
   */
  async getUniqueVisitors(ownerId: string, startDate: Date, endDate: Date) {
    return await prisma.visitor.count({
      where: {
        ownerId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });
  }

  async getTodayVisitors(ownerId: string) {
    return await prisma.visitor.count({
      where: {
        ownerId,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          lte: new Date(),
        },
      },
    });
  }

  async getYesterdayVisitors(ownerId: string) {
    return await prisma.visitor.count({
      where: {
        ownerId,
        createdAt: {
          gte: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          lte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    });
  }

  /**
   * Busca total de page views em um período
   */
  async getTotalPageViews(ownerId: string, startDate: Date, endDate: Date) {
    return await prisma.pageView.count({
      where: {
        ownerId,
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
    });
  }

  /**
   * Busca breakdown por dispositivo
   */
  async getDeviceBreakdown(ownerId: string, startDate: Date, endDate: Date) {
    const result = await prisma.visitor.groupBy({
      by: ["device"],
      where: {
        ownerId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      _count: {
        device: true,
      },
    });

    return result.reduce((acc: Record<string, number>, item: { device: string; _count: { device: number } }) => {
      acc[item.device] = item._count.device;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Busca páginas mais visitadas
   */
  async getTopPages(ownerId: string, startDate: Date, endDate: Date, limit = 10) {
    const result = await prisma.pageView.groupBy({
      by: ["page"],
      where: {
        ownerId,
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      _count: {
        page: true,
      },
      orderBy: {
        _count: {
          page: "desc",
        },
      },
      take: limit,
    });

    return result.map((item: { page: string; _count: { page: number } }) => ({
      page: item.page,
      views: item._count.page,
    }));
  }

  /**
   * Busca países com mais visitantes
   */
  async getTopCountries(ownerId: string, startDate: Date, endDate: Date, limit = 10) {
    const result = await prisma.visitor.groupBy({
      by: ["country"],
      where: {
        ownerId,
        country: { not: null },
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      _count: {
        country: true,
      },
      orderBy: {
        _count: {
          country: "desc",
        },
      },
      take: limit,
    });

    return result.map((item: { country: string | null; _count: { country: number } }) => ({
      country: item.country ?? "Unknown",
      visitors: item._count.country,
    }));
  }

  /**
   * Busca browsers mais utilizados
   */
  async getTopBrowsers(ownerId: string, startDate: Date, endDate: Date, limit = 10) {
    const result = await prisma.visitor.groupBy({
      by: ["browser"],
      where: {
        ownerId,
        browser: { not: null },
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      _count: {
        browser: true,
      },
      orderBy: {
        _count: {
          browser: "desc",
        },
      },
      take: limit,
    });

    return result.map((item: { browser: string | null; _count: { browser: number } }) => ({
      browser: item.browser || "Unknown",
      visitors: item._count.browser,
    }));
  }

  /**
   * Calcula taxa de rejeição (bounce rate)
   */
  async getBounceRate(ownerId: string, startDate: Date, endDate: Date): Promise<number> {
    const totalVisitors = await this.getUniqueVisitors(ownerId, startDate, endDate);

    if (totalVisitors === 0) return 0;

    const singlePageVisitors = await prisma.visitor.count({
      where: {
        ownerId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        pageViews: {
          none: {},
        },
      },
    });

    return (singlePageVisitors / totalVisitors) * 100;
  }

  /**
   * Calcula tempo médio no site
   */
  async getAverageTimeSpent(ownerId: string, startDate: Date, endDate: Date): Promise<number> {
    const result = await prisma.pageView.aggregate({
      where: {
        ownerId,
        timeSpent: { not: null },
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      _avg: {
        timeSpent: true,
      },
    });

    return result._avg.timeSpent || 0;
  }

  /**
   * Busca analytics em tempo real (últimos 30 minutos)
   */
  async getRealTimeAnalytics(ownerId: string): Promise<RealTimeAnalytics> {
    const thirtyMinutesAgo = new Date(Date.now() - 60 * 60 * 1000);

    const activeVisitors = await prisma.visitor.count({
      where: {
        ownerId,
        createdAt: {
          gte: thirtyMinutesAgo,
        },
      },
    });

    // Páginas mais ativas
    const topActivePages = await prisma.pageView.groupBy({
      by: ["page"],
      where: {
        ownerId,
        timestamp: {
          gte: thirtyMinutesAgo,
        },
      },
      _count: {
        page: true,
      },
      orderBy: {
        _count: {
          page: "desc",
        },
      },
      take: 5,
    });

    // Visitantes recentes
    const recentVisitors = await prisma.visitor.findMany({
      where: {
        ownerId,
        createdAt: {
          gte: thirtyMinutesAgo,
        },
      },
      select: {
        country: true,
        device: true,
        landingPage: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
    });

    return {
      activeVisitors,
      topActivePages: topActivePages.map((item: { page: string; _count: { page: number } }) => ({
        page: item.page,
        activeUsers: item._count.page,
      })),
      recentVisitors: recentVisitors.map(
        (visitor: { country: string | null; device: string; landingPage: string; createdAt: Date }) => ({
          country: visitor.country || "Unknown",
          device: visitor.device,
          page: visitor.landingPage,
          timestamp: visitor.createdAt,
        })
      ),
    };
  }

  /**
   * Busca dados para atualização de analytics diárias
   */
  async getDailyStatsForDate(ownerId: string, date: Date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const [
      uniqueVisitors,
      totalPageViews,
      deviceBreakdown,
      topPages,
      topCountries,
      topBrowsers,
      bounceRate,
      avgTimeSpent,
    ] = await Promise.all([
      this.getUniqueVisitors(ownerId, startOfDay, endOfDay),
      this.getTotalPageViews(ownerId, startOfDay, endOfDay),
      this.getDeviceBreakdown(ownerId, startOfDay, endOfDay),
      this.getTopPages(ownerId, startOfDay, endOfDay, 5),
      this.getTopCountries(ownerId, startOfDay, endOfDay, 5),
      this.getTopBrowsers(ownerId, startOfDay, endOfDay, 5),
      this.getBounceRate(ownerId, startOfDay, endOfDay),
      this.getAverageTimeSpent(ownerId, startOfDay, endOfDay),
    ]);

    return {
      totalVisitors: uniqueVisitors,
      uniqueVisitors,
      pageViews: totalPageViews,
      desktop: deviceBreakdown.desktop || 0,
      mobile: deviceBreakdown.mobile || 0,
      tablet: deviceBreakdown.tablet || 0,
      topPages,
      topCountries,
      topBrowsers,
      bounceRate,
      avgTimeSpent,
    };
  }
}
