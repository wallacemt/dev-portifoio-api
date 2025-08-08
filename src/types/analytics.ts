export interface VisitorData {
  sessionId: string;
  ipAddress: string;
  userAgent: string;
  country?: string;
  city?: string;
  device: "desktop" | "mobile" | "tablet";
  browser?: string;
  os?: string;
  referrer?: string;
  landingPage: string;
  ownerId: string;
}

export interface PageViewData {
  visitorId: string;
  page: string;
  timeSpent?: number;
  ownerId: string;
}

export interface TrackVisitorRequest {
  sessionId: string;
  userAgent: string;
  country?: string;
  city?: string;
  device: "desktop" | "mobile" | "tablet";
  browser?: string;
  os?: string;
  referrer?: string;
  landingPage: string;
}

export interface TrackPageViewRequest {
  sessionId: string;
  page: string;
  timeSpent?: number;
}

export interface DailyAnalytics {
  date: string;
  totalVisitors: number;
  uniqueVisitors: number;
  pageViews: number;
  desktop: number;
  mobile: number;
  tablet: number;
  topPages: Array<{ page: string; views: number }>;
  topCountries: Array<{ country: string; visitors: number }>;
  topBrowsers: Array<{ browser: string; visitors: number }>;
  bounceRate: number;
  avgTimeSpent: number;
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
  activeVisitors: number;
  topActivePages: Array<{ page: string; activeUsers: number }>;
  recentVisitors: Array<{
    country: string;
    device: string;
    page: string;
    timestamp: Date;
  }>;
}
