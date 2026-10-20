import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

const values = new Map<string, string>();
const redis = {
  get: (key: string) => Promise.resolve(values.get(key) ?? null),
  set: (key: string, value: string) => {
    values.set(key, value);
    return Promise.resolve('OK');
  },
};
mock.module('../utils/redisClient', () => ({ getRedisClient: () => redis }));
const { AnalyticsService } =
  require('./analyticsService') as typeof import('./analyticsService');
const { env } = require('../env') as typeof import('../env');

const envSnapshot = {
  url: env.UMAMI_API_URL,
  key: env.UMAMI_API_KEY,
  id: env.UMAMI_WEBSITE_ID,
};
const originalFetch = globalThis.fetch;
let requests: string[];

function stubFetch(responder: (url: URL) => unknown) {
  requests = [];
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = new URL(String(input));
    requests.push(url.pathname + url.search);
    return Promise.resolve(
      new Response(JSON.stringify(responder(url)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  }) as typeof fetch;
}

function payload(url: URL): unknown {
  if (url.pathname.endsWith('/stats'))
    return {
      pageviews: 11,
      visitors: 9,
      visits: 4,
      bounces: 1,
      totaltime: 200,
      comparison: { visitors: 8 },
    };
  if (url.pathname.endsWith('/pageviews'))
    return {
      pageviews: [
        { x: '2026-01-01', y: 3 },
        { x: '2026-01-03', y: 2 },
      ],
      sessions: [
        { x: '2026-01-01', y: 2 },
        { x: '2026-01-02', y: 4 },
      ],
    };
  if (url.pathname.endsWith('/metrics')) {
    if (url.searchParams.get('type') === 'device')
      return [
        { x: 'desktop', y: 2 },
        { x: 'laptop', y: 3 },
        { x: 'mobile', y: 4 },
        { x: 'tablet', y: 1 },
      ];
    if (url.searchParams.get('type') === 'country') return [{ x: 'BR', y: 7 }];
    if (url.searchParams.get('type') === 'path') return [{ x: '/', y: 5 }];
    return [{ x: 'Firefox', y: 4 }];
  }
  if (url.pathname.endsWith('/active')) return { visitors: '6' };
  return {
    urls: { '/': 2 },
    events: [
      {
        __type: 'session',
        country: 'BR',
        device: 'desktop',
        urlPath: '/',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
  };
}

describe('AnalyticsService Umami adapter', () => {
  beforeEach(() => {
    env.UMAMI_API_URL = 'https://umami.example';
    env.UMAMI_API_KEY = 'test-key';
    env.UMAMI_WEBSITE_ID = '550e8400-e29b-41d4-a716-446655440000';
    values.clear();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('maps stats defensively, devices, countries and joins daily series by date', async () => {
    stubFetch(payload);
    const result = await new AnalyticsService().getAnalytics('owner', {
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-01-31'),
    });
    expect(result.overview).toEqual({
      totalVisitors: 9,
      uniqueVisitors: 9,
      pageViews: 11,
      bounceRate: 25,
      avgTimeSpent: 50,
    });
    expect(result.deviceBreakdown).toEqual({
      desktop: 5,
      mobile: 4,
      tablet: 1,
    });
    expect(result.topCountries).toEqual([{ country: 'Brasil', visitors: 7 }]);
    expect(result.dailyStats).toEqual([
      { date: '2026-01-01', totalVisitors: 2, uniqueVisitors: 2, pageViews: 3 },
      { date: '2026-01-02', totalVisitors: 4, uniqueVisitors: 4, pageViews: 0 },
      { date: '2026-01-03', totalVisitors: 0, uniqueVisitors: 0, pageViews: 2 },
    ]);
  });

  it('avoids NaN for zero visits and computes zero comparison change', async () => {
    stubFetch((url) =>
      url.pathname.endsWith('/stats')
        ? {
            pageviews: 0,
            visitors: 0,
            visits: 0,
            bounces: 0,
            totaltime: 0,
            comparison: { visitors: 0 },
          }
        : payload(url)
    );
    const result = await new AnalyticsService().getAnalytics('owner', {
      startDate: new Date('2026-02-01'),
      endDate: new Date('2026-02-02'),
    });
    expect(result.overview.bounceRate).toBe(0);
    expect(result.overview.avgTimeSpent).toBe(0);
    expect(Number.isFinite(result.overview.avgTimeSpent)).toBe(true);
    expect(
      (await new AnalyticsService().getAnalyticsSummary()).today.change
    ).toBe(0);
  });

  it('uses Umami comparison for the summary percent', async () => {
    stubFetch((url) =>
      url.pathname.endsWith('/stats')
        ? {
            pageviews: 0,
            visitors: 12,
            visits: 0,
            bounces: 0,
            totaltime: 0,
            comparison: { visitors: 8 },
          }
        : payload(url)
    );
    expect(
      (await new AnalyticsService().getAnalyticsSummary()).today.change
    ).toBe(50);
  });

  it('caches repeated dashboard requests for 60 seconds', async () => {
    stubFetch(payload);
    const service = new AnalyticsService();
    const range = {
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-03-31'),
    };
    await service.getAnalytics('owner', range);
    const firstCallCount = requests.length;
    await service.getAnalytics('owner', range);
    expect(requests.length).toBe(firstCallCount);
  });

  it('returns safe real-time fallbacks and active counts', async () => {
    stubFetch((url) =>
      url.pathname.endsWith('/realtime/550e8400-e29b-41d4-a716-446655440000')
        ? {
            urls: { '/a': 2, '/b': 9 },
            events: [{ __type: 'session', createdAt: '2026-01-01' }],
          }
        : payload(url)
    );
    const result = await new AnalyticsService().getRealTimeAnalytics();
    expect(result.online).toBe(6);
    expect(result.activeVisitors).toBe(6);
    expect(result.topActivePages[0]).toEqual({ page: '/b', activeUsers: 9 });
    expect(result.recentVisitors).toHaveLength(1);
  });

  it('returns 503 without Umami configuration', async () => {
    env.UMAMI_API_URL = undefined;
    await expect(
      new AnalyticsService().getAnalytics('owner')
    ).rejects.toMatchObject({
      status: 503,
      message: 'Analytics não configurado',
    });
  });

  it('maps Umami transport failures to 502 without exposing credentials', async () => {
    globalThis.fetch = (() => Promise.reject(new Error('network failure'))) as unknown as typeof fetch;
    await expect(new AnalyticsService().getRealTimeAnalytics()).rejects.toMatchObject({
      status: 502,
      message: 'Analytics indisponível',
    });
  });
});

afterEach(() => {
  env.UMAMI_API_URL = envSnapshot.url;
  env.UMAMI_API_KEY = envSnapshot.key;
  env.UMAMI_WEBSITE_ID = envSnapshot.id;
});
