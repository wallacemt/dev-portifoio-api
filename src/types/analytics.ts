export interface DailyAnalytics {
  date: string;
  totalVisitors: number;
  uniqueVisitors: number;
  pageViews: number;
}

export interface AnalyticsResponse {
  overview: {
    totalVisitors: number;
    uniqueVisitors: number;
    pageViews: number;
    bounceRate: number;
    avgTimeSpent: number;
  };
  deviceBreakdown: {
    desktop: number;
    mobile: number;
    tablet: number;
  };
  dailyStats: DailyAnalytics[];
  topPages: Array<{ page: string; views: number }>;
  topCountries: Array<{ country: string; visitors: number }>;
  topBrowsers: Array<{ browser: string; visitors: number }>;
}

export interface AnalyticsFilters {
  startDate?: Date;
  endDate?: Date;
  page?: string;
  device?: "desktop" | "mobile" | "tablet";
  country?: string;
}

export interface RealTimeAnalytics {
  online: number;
  activeVisitors: number;
  topActivePages: Array<{ page: string; activeUsers: number }>;
  recentVisitors: Array<{
    country: string;
    device: string;
    page: string;
    timestamp: Date;
  }>;
  totals?: unknown;
  countries?: unknown;
  referrers?: unknown;
}

export interface AnalyticsSummaryResponse {
  today: { visitors: number; change: number };
  week: { visitors: number };
  month: { visitors: number };
  realTime: RealTimeAnalytics;
}
