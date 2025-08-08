export interface OwnerDataRequest {
  name: string;
  email: string;
  password: string;
  avatar?: string;
  about: string;
  occupation: string;
  birthDate: Date;
  cvLinkPT?: string;
  cvLinkEN?: string;
}

export type OwnerDataOptionalRequest = Partial<OwnerDataRequest>;

export interface OwnerDataResponse {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  about: string;
  occupation: string;
  birthDate: Date;
  cvLinkPT: string | null;
  cvLinkEN: string | null;
  token?: string;
}

export interface OwnerAnalysisResponse {
  projectsCount: number;
  skillsCount: number;
  formationsCount: number;
  servicesCount: number;
  analytics?: {
    totalVisitors: number;
    uniqueVisitors: number;
    pageViews: number;
    bounceRate: number;
    avgTimeSpent: number;
    topPages: Array<{ page: string; views: number }>;
    deviceBreakdown: {
      desktop: number;
      mobile: number;
      tablet: number;
    };
    recentActivity: {
      activeVisitors: number;
      todayVisitors: number;
      weeklyGrowth: number;
    };
  };
}
