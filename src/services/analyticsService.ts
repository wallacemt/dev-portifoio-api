import { ZodError } from "zod";
import { AnalyticsRepository } from "../repository/analyticsRepository";
import {
  TrackVisitorRequest,
  TrackPageViewRequest,
  AnalyticsResponse,
  AnalyticsFilters,
  RealTimeAnalytics,
  Stat,
} from "../types/analytics";
import { Exception } from "../utils/exception";
import { trackVisitorSchema, trackPageViewSchema, analyticsFiltersSchema } from "../validations/analyticsValidation";

export class AnalyticsService {
  private analyticsRepository = new AnalyticsRepository();

  /**
   * Registra um novo visitante
   */
  public async trackVisitor(visitorData: TrackVisitorRequest, ownerId: string, ipAddress: string) {
    try {
      trackVisitorSchema.parse(visitorData);

      const visitor = await this.analyticsRepository.upsertVisitor({
        ...visitorData,
        ownerId,
        ipAddress,
      });

      // Agenda atualização das métricas diárias
      this.updateDailyAnalytics(ownerId, new Date()).catch(console.error);

      return visitor;
    } catch (e) {
      if (e instanceof ZodError) {
        throw new Exception(e.issues[0].message, 400);
      }
      throw new Exception("Dados do visitante inválidos", 400);
    }
  }

  /**
   * Registra uma visualização de página
   */
  public async trackPageView(pageViewData: TrackPageViewRequest, ownerId: string) {
    try {
      trackPageViewSchema.parse(pageViewData);
      const visitor = await this.analyticsRepository.findVisitorBySessionId(pageViewData.sessionId);
      if (!visitor) {
        throw new Exception("Visitante não encontrado. Registre o visitante primeiro.", 404);
      }
      const pageView = await this.analyticsRepository.createPageView({
        visitorId: visitor.id,
        page: pageViewData.page,
        timeSpent: pageViewData.timeSpent,
        ownerId,
      });
      this.updateDailyAnalytics(ownerId, new Date()).catch(console.error);
      return pageView;
    } catch (e) {
      if (e instanceof ZodError) {
        throw new Exception(e.issues[0].message, 400);
      }
      if (e instanceof Exception) {
        throw e;
      }
      throw new Exception("Dados da visualização inválidos", 400);
    }
  }

  /**
   * Busca analytics completas com filtros
   */
  public async getAnalytics(ownerId: string, filters: AnalyticsFilters = {}): Promise<AnalyticsResponse> {
    try {
      if (Object.keys(filters).length > 0) {
        analyticsFiltersSchema.parse(filters);
      }

      // Define período padrão (últimos 30 dias)
      const endDate = filters.endDate || new Date();
      const startDate = filters.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Busca dados agregados
      const [
        uniqueVisitors,
        totalPageViews,
        deviceBreakdown,
        topPages,
        topCountries,
        topBrowsers,
        bounceRate,
        avgTimeSpent,
        dailyStats,
      ] = await Promise.all([
        this.analyticsRepository.getUniqueVisitors(ownerId, startDate, endDate),
        this.analyticsRepository.getTotalPageViews(ownerId, startDate, endDate),
        this.analyticsRepository.getDeviceBreakdown(ownerId, startDate, endDate),
        this.analyticsRepository.getTopPages(ownerId, startDate, endDate),
        this.analyticsRepository.getTopCountries(ownerId, startDate, endDate),
        this.analyticsRepository.getTopBrowsers(ownerId, startDate, endDate),
        this.analyticsRepository.getBounceRate(ownerId, startDate, endDate),
        this.analyticsRepository.getAverageTimeSpent(ownerId, startDate, endDate),
        this.analyticsRepository.getDailyAnalytics(ownerId, { startDate, endDate }),
      ]);

      return {
        overview: {
          totalVisitors: uniqueVisitors,
          uniqueVisitors,
          pageViews: totalPageViews,
          bounceRate,
          avgTimeSpent,
        },
        deviceBreakdown: {
          desktop: deviceBreakdown.desktop || 0,
          mobile: deviceBreakdown.mobile || 0,
          tablet: deviceBreakdown.tablet || 0,
        },
        dailyStats: dailyStats.map((stat: Stat) => ({
          date: stat.date.toISOString().split("T")[0],
          totalVisitors: stat.totalVisitors,
          uniqueVisitors: stat.uniqueVisitors,
          pageViews: stat.pageViews,
          desktop: stat.desktop,
          mobile: stat.mobile,
          tablet: stat.tablet,
          topPages: Array.isArray(stat.topPages) ? (stat.topPages as Array<{ page: string; views: number }>) : [],
          topCountries: Array.isArray(stat.topCountries)
            ? (stat.topCountries as Array<{ country: string; visitors: number }>)
            : [],
          topBrowsers: Array.isArray(stat.topBrowsers)
            ? (stat.topBrowsers as Array<{ browser: string; visitors: number }>)
            : [],
          bounceRate: stat.bounceRate,
          avgTimeSpent: stat.avgTimeSpent,
        })),
        topPages,
        topCountries,
        topBrowsers,
      };
    } catch (e) {
      if (e instanceof ZodError) {
        throw new Exception(e.issues[0].message, 400);
      }
      if (e instanceof Exception) {
        throw e;
      }
      throw new Exception("Erro ao buscar analytics", 500);
    }
  }

  /**
   * Busca analytics em tempo real
   */
  public async getRealTimeAnalytics(ownerId: string): Promise<RealTimeAnalytics> {
    try {
      return await this.analyticsRepository.getRealTimeAnalytics(ownerId);
    } catch (e) {
      throw new Exception("Erro ao buscar analytics em tempo real", 500);
    }
  }

  /**
   * Atualiza as métricas diárias (função privada para otimização)
   */
  private async updateDailyAnalytics(ownerId: string, date: Date) {
    try {
      const stats = await this.analyticsRepository.getDailyStatsForDate(ownerId, date);
      await this.analyticsRepository.upsertDailyAnalytics(date, stats, ownerId);
    } catch (error) {
      console.error("Erro ao atualizar analytics diárias:", error);
    }
  }

  /**
   * Força atualização das métricas diárias (endpoint administrativo)
   */
  public async forceUpdateDailyAnalytics(ownerId: string, date?: Date) {
    try {
      const targetDate = date || new Date();
      await this.updateDailyAnalytics(ownerId, targetDate);
      return { message: "Métricas diárias atualizadas com sucesso" };
    } catch (e) {
      throw e;
    }
  }

  /**
   * Busca resumo de analytics para dashboard
   */
  public async getAnalyticsSummary(ownerId: string) {
    try {
      const today = new Date();
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [todayVisitors, yesterdayVisitors, weekVisitors, monthVisitors, realTime] = await Promise.all([
        this.analyticsRepository.getUniqueVisitors(ownerId, today, today),
        this.analyticsRepository.getUniqueVisitors(ownerId, yesterday, yesterday),
        this.analyticsRepository.getUniqueVisitors(ownerId, lastWeek, today),
        this.analyticsRepository.getUniqueVisitors(ownerId, lastMonth, today),
        this.analyticsRepository.getRealTimeAnalytics(ownerId),
      ]);

      return {
        today: {
          visitors: todayVisitors,
          change: yesterdayVisitors > 0 ? ((todayVisitors - yesterdayVisitors) / yesterdayVisitors) * 100 : 0,
        },
        week: {
          visitors: weekVisitors,
        },
        month: {
          visitors: monthVisitors,
        },
        realTime,
      };
    } catch (e) {
      throw new Exception("Erro ao buscar resumo de analytics", 500);
    }
  }
}
