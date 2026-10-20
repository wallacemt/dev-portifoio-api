import type {
  AnalyticsFilters,
  AnalyticsResponse,
  AnalyticsSummaryResponse,
  RealTimeAnalytics,
} from '../types/analytics';
import { env } from '../env';
import { Exception } from '../utils/exception';
import { devDebugger } from '../utils/devDebugger';
import { getRedisClient } from '../utils/redisClient';
import { umamiGet } from './umamiClient';

const TTL = 60;
type Metric = { x: string; y: number };
type Stats = {
  pageviews: number;
  visitors: number;
  visits: number;
  bounces: number;
  totaltime: number;
  comparison: Pick<Stats, 'visitors'>;
};
const configured = () =>
  Boolean(env.UMAMI_API_URL && env.UMAMI_API_KEY && env.UMAMI_WEBSITE_ID);
const requireConfig = () => {
  if (!configured()) throw new Exception('Analytics não configurado', 503);
};
const getCachedAnalytics = async <T>(key: string): Promise<T | null> => {
  const redis = getRedisClient();
  if (!redis) return null;
  const value = await redis.get(key).catch(() => null);
  return value ? (JSON.parse(value) as T) : null;
};
const cacheAnalytics = (key: string, value: unknown) => {
  getRedisClient()
    ?.set(key, JSON.stringify(value), 'EX', TTL)
    .catch((error) =>
      devDebugger('Erro ao gravar cache de analytics', error, 'warn')
    );
};
const statsPath = (start: Date, end: Date) => ({
  startAt: String(start.getTime()),
  endAt: String(end.getTime()),
});
const countryName = new Intl.DisplayNames(['pt-BR'], { type: 'region' });

export class AnalyticsService {
  async getAnalytics(
    _ownerId: string,
    filters: AnalyticsFilters = {}
  ): Promise<AnalyticsResponse> {
    requireConfig();
    const end =
      filters.endDate ?? new Date(Math.floor(Date.now() / 60_000) * 60_000);
    const start =
      filters.startDate ?? new Date(end.getTime() - 30 * 86_400_000);
    if (start > end || end.getTime() - start.getTime() > 366 * 86_400_000) {
      throw new Exception("Intervalo de datas inválido (máximo de 366 dias)", 400);
    }
    const key = `analytics:umami:${env.UMAMI_WEBSITE_ID}:${start.toISOString()}:${end.toISOString()}`;
    const cached = await getCachedAnalytics<AnalyticsResponse>(key);
    if (cached) return cached;
    const q = statsPath(start, end);
    const [stats, devices, pages, countries, browsers, daily] =
      await Promise.all([
        umamiGet<Stats>(`/websites/${env.UMAMI_WEBSITE_ID}/stats`, q),
        umamiGet<Metric[]>(`/websites/${env.UMAMI_WEBSITE_ID}/metrics`, {
          ...q,
          type: 'device',
          limit: '10',
        }),
        umamiGet<Metric[]>(`/websites/${env.UMAMI_WEBSITE_ID}/metrics`, {
          ...q,
          type: 'path',
          limit: '10',
        }),
        umamiGet<Metric[]>(`/websites/${env.UMAMI_WEBSITE_ID}/metrics`, {
          ...q,
          type: 'country',
          limit: '10',
        }),
        umamiGet<Metric[]>(`/websites/${env.UMAMI_WEBSITE_ID}/metrics`, {
          ...q,
          type: 'browser',
          limit: '10',
        }),
        umamiGet<{ pageviews: Metric[]; sessions: Metric[] }>(
          `/websites/${env.UMAMI_WEBSITE_ID}/pageviews`,
          { ...q, unit: 'day', timezone: 'America/Sao_Paulo' }
        ),
      ]);
    const sessions = new Map(
      daily.sessions.map(({ x, y }) => [x, Number(y) || 0])
    );
    const views = new Map(
      daily.pageviews.map(({ x, y }) => [x, Number(y) || 0])
    );
    const dates = [...new Set([...sessions.keys(), ...views.keys()])].sort();
    const metric = (items: Metric[], x: string) =>
      items
        .filter((item) => item.x === x)
        .reduce((sum, item) => sum + (Number(item.y) || 0), 0);
    const desktop = devices
      .filter(({ x }) => !['mobile', 'tablet'].includes(x))
      .reduce((sum, { y }) => sum + (Number(y) || 0), 0);
    const response: AnalyticsResponse = {
      overview: {
        totalVisitors: Number(stats.visitors) || 0,
        uniqueVisitors: Number(stats.visitors) || 0,
        pageViews: Number(stats.pageviews) || 0,
        bounceRate: stats.visits
          ? Math.round((stats.bounces / stats.visits) * 1000) / 10
          : 0,
        avgTimeSpent: stats.visits ? stats.totaltime / stats.visits : 0,
      },
      deviceBreakdown: {
        desktop,
        mobile: metric(devices, 'mobile'),
        tablet: metric(devices, 'tablet'),
      },
      dailyStats: dates.map((date) => ({
        date: date.slice(0, 10),
        totalVisitors: sessions.get(date) ?? 0,
        uniqueVisitors: sessions.get(date) ?? 0,
        pageViews: views.get(date) ?? 0,
      })),
      topPages: pages.map(({ x, y }) => ({ page: x, views: Number(y) || 0 })),
      topCountries: countries.map(({ x, y }) => ({
        country: countryName.of(x) ?? x,
        visitors: Number(y) || 0,
      })),
      topBrowsers: browsers.map(({ x, y }) => ({
        browser: x,
        visitors: Number(y) || 0,
      })),
    };
    cacheAnalytics(key, response);
    return response;
  }

  async getAnalyticsSummary(
    _ownerId?: string
  ): Promise<AnalyticsSummaryResponse> {
    requireConfig();
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const part = (type: string) =>
      Number(parts.find((item) => item.type === type)?.value);
    const start = new Date(
      Date.UTC(part('year'), part('month') - 1, part('day')) + 3 * 3_600_000
    );
    const qToday = statsPath(start, now);
    const qWeek = statsPath(new Date(now.getTime() - 7 * 86_400_000), now);
    const qMonth = statsPath(new Date(now.getTime() - 30 * 86_400_000), now);
    const key = `analytics:umami:${env.UMAMI_WEBSITE_ID}:summary:${start.toISOString().slice(0, 10)}`;
    const cached = await getCachedAnalytics<AnalyticsSummaryResponse>(key);
    if (cached) return cached;
    const [todayStats, week, month, realtime] = await Promise.all([
      umamiGet<Stats>(`/websites/${env.UMAMI_WEBSITE_ID}/stats`, qToday),
      umamiGet<Stats>(`/websites/${env.UMAMI_WEBSITE_ID}/stats`, qWeek),
      umamiGet<Stats>(`/websites/${env.UMAMI_WEBSITE_ID}/stats`, qMonth),
      this.getRealTimeAnalytics(),
    ]);
    // Umami's comparison is the previous period, including for the partial current day.
    const comparisonVisitors = Number(todayStats.comparison?.visitors) || 0;
    const todayVisitors = Number(todayStats.visitors) || 0;
    const result = {
      today: {
        visitors: todayVisitors,
        change: comparisonVisitors
          ? ((todayVisitors - comparisonVisitors) / comparisonVisitors) * 100
          : 0,
      },
      week: { visitors: Number(week.visitors) || 0 },
      month: { visitors: Number(month.visitors) || 0 },
      realTime: realtime,
    };
    cacheAnalytics(key, result);
    return result;
  }

  async getRealTimeAnalytics(_ownerId?: string): Promise<RealTimeAnalytics> {
    requireConfig();
    const [active, realtime] = await Promise.all([
      umamiGet<{ visitors: number | string }>(
        `/websites/${env.UMAMI_WEBSITE_ID}/active`
      ),
      umamiGet<{
        urls?: Record<string, number>;
        events?: Record<string, unknown>[];
        totals?: unknown;
        countries?: unknown;
        referrers?: unknown;
      }>(`/realtime/${env.UMAMI_WEBSITE_ID}`),
    ]);
    const count = Number(active.visitors) || 0;
    return {
      online: count,
      activeVisitors: count,
      topActivePages: Object.entries(realtime.urls ?? {})
        .map(([page, activeUsers]) => ({
          page,
          activeUsers: Number(activeUsers) || 0,
        }))
        .sort((a, b) => b.activeUsers - a.activeUsers)
        .slice(0, 5),
      recentVisitors: (Array.isArray(realtime.events) ? realtime.events : [])
        .filter((event) => event?.__type === 'session')
        .slice(0, 10)
        .map((event) => {
          const timestamp = new Date(
            typeof event.createdAt === 'string' ||
              typeof event.createdAt === 'number'
              ? event.createdAt
              : Date.now()
          );
          return {
            country: String(event.country ?? ''),
            device: String(event.device ?? ''),
            page: String(event.urlPath ?? ''),
            timestamp: Number.isNaN(timestamp.getTime())
              ? new Date()
              : timestamp,
          };
        }),
      ...(realtime.totals ? { totals: realtime.totals } : {}),
      ...(realtime.countries ? { countries: realtime.countries } : {}),
      ...(realtime.referrers ? { referrers: realtime.referrers } : {}),
    };
  }
}
