//@biome-ignore

import { ZodError } from "zod";
import { AnalyticsRepository } from "../repository/analyticsRepository";
import type {
  AnalyticsFilters,
  AnalyticsResponse,
  RealTimeAnalytics,
  Stat,
  TrackPageViewRequest,
  TrackVisitorRequest,
  TrackVisitorResponse,
} from "../types/analytics";
import { isBotUserAgent } from "../utils/botDetector";
import { devDebugger } from "../utils/devDebugger";
import { Exception } from "../utils/exception";
import { normalizeReferrer } from "../utils/normalizeReferrer";
import { getRedisClient } from "../utils/redisClient";
import { analyticsFiltersSchema, trackPageViewSchema, trackVisitorSchema } from "../validations/analyticsValidation";

const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const PAGEVIEW_DEDUPE_WINDOW_MS = 30 * 1000;
const ANALYTICS_CACHE_TTL_SECONDS = 60;

function analyticsChannel(ownerId: string): string {
  return `analytics:${ownerId}`;
}

function onlineSetKey(ownerId: string): string {
  return `analytics:online:${ownerId}`;
}

function analyticsCacheKey(ownerId: string, startDate: Date, endDate: Date, filters: AnalyticsFilters): string {
  const { page = "", device = "", country = "" } = filters;
  return `analytics:cache:${ownerId}:${startDate.toISOString()}:${endDate.toISOString()}:${page}:${device}:${country}`;
}

export class AnalyticsService {
  private analyticsRepository = new AnalyticsRepository();

  /**
   * Marca a sessão como "online" (ZSET com janela de 5min) e publica o
   * evento no canal Redis do dono, pro handler SSE (`GET /analytics/stream`)
   * repassar em tempo real. Sem Redis disponível, é um no-op — o endpoint
   * de streaming cai pra polling nesse caso.
   */
  private async publishRealtimeEvent(
    ownerId: string,
    event: { type: "visitor" | "pageview"; sessionId: string; page?: string }
  ): Promise<void> {
    const redis = getRedisClient();
    if (!redis) return;

    try {
      const now = Date.now();
      await redis.zadd(onlineSetKey(ownerId), now, event.sessionId);
      await redis.publish(analyticsChannel(ownerId), JSON.stringify({ ...event, timestamp: now }));
    } catch (error) {
      devDebugger("Erro ao publicar evento de analytics em tempo real", error, "warn");
    }
  }

  /**
   * Conta visitantes "online agora": sessões com atividade nos últimos 5min,
   * via ZSET (sem tabela nova no Prisma). Retorna 0 quando Redis não está
   * disponível — o dashboard cai pro fallback via getRealTimeAnalytics.
   */
  async getOnlineVisitorsCount(ownerId: string): Promise<number> {
    const redis = getRedisClient();
    if (!redis) return 0;

    try {
      const key = onlineSetKey(ownerId);
      const cutoff = Date.now() - ONLINE_WINDOW_MS;
      await redis.zremrangebyscore(key, 0, cutoff);
      return await redis.zcard(key);
    } catch (error) {
      devDebugger("Erro ao contar visitantes online", error, "warn");
      return 0;
    }
  }

  /**
   * Registra um novo visitante
   */
  async trackVisitor(
    visitorData: TrackVisitorRequest,
    ownerId: string,
    ipAddress: string
  ): Promise<TrackVisitorResponse> {
    // Crawlers (Googlebot, curl, headless browsers, etc) não são visitas
    // reais — ignora sem persistir nada e sem contar como erro de validação.
    if (isBotUserAgent(visitorData.userAgent)) {
      return { id: "bot", sessionId: visitorData.sessionId, isExisting: true };
    }

    try {
      const visitorDataT: TrackVisitorRequest = {
        ...visitorData,
        referrer: visitorData.referrer?.length ? visitorData.referrer : undefined,
        browser: visitorData.browser?.length ? visitorData.browser : undefined,
        os: visitorData.os?.length ? visitorData.os : undefined,
        city: visitorData.city?.length ? visitorData.city : undefined,
        country: visitorData.country?.length ? visitorData.country : undefined,
      };
      trackVisitorSchema.parse(visitorDataT);
      const existingVisitor = await this.analyticsRepository.findVisitorBySessionId(visitorData.sessionId);

      if (existingVisitor) {
        this.publishRealtimeEvent(ownerId, { type: "visitor", sessionId: existingVisitor.sessionId });
        return {
          id: existingVisitor.id,
          sessionId: existingVisitor.sessionId,
          isExisting: true,
        };
      }

      const visitor = await this.analyticsRepository.upsertVisitor({
        ...visitorData,
        referrer: normalizeReferrer(visitorDataT.referrer),
        ownerId,
        ipAddress,
      });

      setImmediate(() => {
        this.updateDailyAnalytics(ownerId, new Date()).catch((error) => {
          //biome-ignore lint: using in development
          if (process.env.NODE_ENV === "development") console.warn("Erro ao atualizar métricas diárias:", error);
        });
      });
      this.publishRealtimeEvent(ownerId, { type: "visitor", sessionId: visitor.sessionId });

      return {
        id: visitor.id,
        sessionId: visitor.sessionId,
        isExisting: false,
      };
    } catch (e) {
      if (e instanceof ZodError) {
        throw new Exception(e.issues?.[0]?.message || "Erro de validação para dados do visitante", 400);
      }
      throw new Exception("Dados do visitante inválidos", 400);
    }
  }

  /**
   * Registra uma visualização de página
   */
  async trackPageView(
    pageViewData: TrackPageViewRequest,
    ownerId: string,
    visitorData: TrackVisitorRequest,
    ipAddress: string
  ) {
    try {
      trackPageViewSchema.parse(pageViewData);
      let visitor = await this.analyticsRepository.findVisitorBySessionId(pageViewData.sessionId);
      if (!visitor) {
        visitor = await this.analyticsRepository.upsertVisitor({
          ...visitorData,
          referrer: normalizeReferrer(visitorData.referrer),
          ownerId,
          ipAddress,
        });
      }

      // Double-fire do script de tracking (re-render, navegação rápida etc)
      // não deve contar como duas visualizações da mesma página.
      const recentDuplicate = await this.analyticsRepository.findRecentPageView(
        visitor.id,
        pageViewData.page,
        new Date(Date.now() - PAGEVIEW_DEDUPE_WINDOW_MS)
      );
      if (recentDuplicate) {
        this.publishRealtimeEvent(ownerId, {
          type: "pageview",
          sessionId: visitor.sessionId,
          page: pageViewData.page,
        });
        return recentDuplicate;
      }

      const pageView = await this.analyticsRepository.createPageView({
        visitorId: visitor.id,
        page: pageViewData.page,
        timeSpent: pageViewData.timeSpent,
        ownerId,
      });

      setImmediate(() => {
        this.updateDailyAnalytics(ownerId, new Date()).catch((error) => {
          //biome-ignore lint: using in development
          if (process.env.NODE_ENV === "development") console.warn("Erro ao atualizar métricas diárias:", error);
        });
      });
      this.publishRealtimeEvent(ownerId, {
        type: "pageview",
        sessionId: visitor.sessionId,
        page: pageViewData.page,
      });

      return pageView;
    } catch (e) {
      if (e instanceof ZodError) {
        throw new Exception(e.issues?.[0]?.message || "Erro de validação para dados de visualização", 400);
      }
      if (e instanceof Exception) {
        throw e;
      }
      throw new Exception(`Dados da visualização inválidos ${e}`, 400);
    }
  }

  /**
   * Cache de curta duração (TTL de 1min) pras agregações pesadas do
   * getAnalytics — dashboard não precisa recalcular tudo do zero a cada
   * request. Sem Redis disponível, os dois métodos são no-op.
   */
  private async getCachedAnalytics(cacheKey: string): Promise<AnalyticsResponse | null> {
    const redis = getRedisClient();
    if (!redis) return null;

    const cached = await redis.get(cacheKey).catch(() => null);
    return cached ? (JSON.parse(cached) as AnalyticsResponse) : null;
  }

  private cacheAnalytics(cacheKey: string, response: AnalyticsResponse): void {
    const redis = getRedisClient();
    if (!redis) return;

    redis
      .set(cacheKey, JSON.stringify(response), "EX", ANALYTICS_CACHE_TTL_SECONDS)
      .catch((error) => devDebugger("Erro ao gravar cache de analytics", error, "warn"));
  }

  /**
   * Busca analytics completas com filtros
   */
  async getAnalytics(ownerId: string, filters: AnalyticsFilters = {}): Promise<AnalyticsResponse> {
    try {
      if (Object.keys(filters).length > 0) {
        analyticsFiltersSchema.parse(filters);
      }
      // Define período padrão (últimos 30 dias)
      const endDate = filters.endDate || new Date();
      const startDate = filters.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const cacheKey = analyticsCacheKey(ownerId, startDate, endDate, filters);
      const cached = await this.getCachedAnalytics(cacheKey);
      if (cached) return cached;

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
        this.analyticsRepository.getDailyAnalytics(ownerId, {
          startDate,
          endDate,
        }),
      ]);

      const response: AnalyticsResponse = {
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
          date: stat.date.toISOString().split("T")[0] || new Date().toString(),
          totalVisitors: stat.totalVisitors,
          uniqueVisitors: stat.uniqueVisitors,
          pageViews: stat.pageViews,
          desktop: stat.desktop,
          mobile: stat.mobile,
          tablet: stat.tablet,
          topPages: Array.isArray(stat.topPages) ? (stat.topPages as Array<{ page: string; views: number }>) : [],
          topCountries: Array.isArray(stat.topCountries)
            ? (stat.topCountries as Array<{
                country: string;
                visitors: number;
              }>)
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

      this.cacheAnalytics(cacheKey, response);

      return response;
    } catch (e) {
      if (e instanceof ZodError) {
        throw new Exception(e.issues?.[0]?.message || "Erro ao validar dados", 400);
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
  async getRealTimeAnalytics(ownerId: string): Promise<RealTimeAnalytics> {
    try {
      return await this.analyticsRepository.getRealTimeAnalytics(ownerId);
    } catch (_e) {
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
    } catch (_e) {
      throw new Exception("Erro ao atualizar analytics diárias", 500);
    }
  }

  /**
   * Força atualização das métricas diárias (endpoint administrativo)
   */
  async forceUpdateDailyAnalytics(ownerId: string, date?: Date) {
    try {
      const targetDate = date || new Date();
      await this.updateDailyAnalytics(ownerId, targetDate);
      return { message: "Métricas diárias atualizadas com sucesso" };
    } catch (_e) {
      throw new Exception("Erro ao forçar atualização das métricas diárias", 500);
    }
  }

  /**
   * Busca resumo de analytics para dashboard
   */
  async getAnalyticsSummary(ownerId: string) {
    try {
      const today = new Date();
      const [todayVisitors, yesterdayVisitors, weekVisitors, monthVisitors, realTime] = await Promise.all([
        this.analyticsRepository.getTodayVisitors(ownerId),
        this.analyticsRepository.getYesterdayVisitors(ownerId),
        this.analyticsRepository.getUniqueVisitors(
          ownerId,
          new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7),
          today
        ),
        this.analyticsRepository.getUniqueVisitors(
          ownerId,
          new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30),
          today
        ),
        this.analyticsRepository.getRealTimeAnalytics(ownerId),
      ]);
      let changeData: number | string;
      if (yesterdayVisitors > todayVisitors) {
        changeData = Number(((yesterdayVisitors - todayVisitors) / yesterdayVisitors) * -100).toFixed(2);
      } else if (yesterdayVisitors === 0) {
        changeData = 0;
      } else {
        changeData = Number(((todayVisitors - yesterdayVisitors) / yesterdayVisitors) * 100).toFixed(2);
      }
      return {
        today: {
          visitors: todayVisitors,
          change: changeData,
        },
        week: {
          visitors: weekVisitors,
        },
        month: {
          visitors: monthVisitors,
        },
        realTime,
      };
    } catch (_e) {
      throw new Exception("Erro ao buscar resumo de analytics", 500);
    }
  }
}
