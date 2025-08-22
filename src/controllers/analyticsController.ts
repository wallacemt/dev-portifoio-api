import type { Request, Response } from "express";
import { Router } from "express";
import { trackingRateLimit } from "../middleware/analyticsRateLimit";
import AuthPolice from "../middleware/authPolice";
import { AnalyticsService } from "../services/analyticsService";
import type { AnalyticsFilters, TrackPageViewRequest, TrackVisitorRequest } from "../types/analytics";
import errorFilter from "../utils/isCustomError";

/**
 * @swagger
 * tags:
 *   name: Analytics
 *   description: Operações de métricas e analytics do portfólio
 */
export class AnalyticsController {
  routerPrivate: Router;
  routerPublic: Router;
  private analyticsService: AnalyticsService = new AnalyticsService();

  constructor() {
    this.routerPrivate = Router();
    this.routerPublic = Router();
    this.routesPublic();
    this.routesPrivate();
  }

  private routesPublic() {
    this.routerPublic.post("/:ownerId/track-visitor", trackingRateLimit, this.trackVisitor.bind(this));
    this.routerPublic.post("/:ownerId/track-pageview", trackingRateLimit, this.trackPageView.bind(this));
  }

  private routesPrivate() {
    this.routerPrivate.use(AuthPolice);

    this.routerPrivate.get("/dashboard", this.getAnalytics.bind(this));
    this.routerPrivate.get("/summary", this.getAnalyticsSummary.bind(this));
    this.routerPrivate.get("/realtime", this.getRealTimeAnalytics.bind(this));
    this.routerPrivate.post("/update-daily", this.forceUpdateDailyAnalytics.bind(this));
  }

  async trackVisitor(req: Request, res: Response): Promise<void> {
    try {
      const { ownerId } = req.params;
      const visitorData: TrackVisitorRequest = req.body;
      const ipAddress = req.ip || req.socket.remoteAddress || "unknown";

      if (!ownerId) {
        res.status(400).json({
          error: "ID do proprietário é obrigatório",
        });
        return;
      }

      const visitor = await this.analyticsService.trackVisitor(visitorData, ownerId, ipAddress);

      if (visitor.isExisting) {
        res.status(200).json({
          message: "Visitante já registrado",
          visitor: { id: visitor.id, sessionId: visitor.sessionId },
          cached: true,
        });
        return;
      }

      res.status(201).json({
        message: "Visitante registrado com sucesso",
        visitor: { id: visitor.id, sessionId: visitor.sessionId },
        cached: false,
      });
    } catch (error) {
      errorFilter(error, res);
    }
  }

  async trackPageView(req: Request, res: Response): Promise<void> {
    try {
      const { ownerId } = req.params;
      const pageViewData: TrackPageViewRequest = req.body;

      const pageView = await this.analyticsService.trackPageView(pageViewData, ownerId || "");
      res.status(201).json({
        message: "Visualização registrada com sucesso",
        pageView: { id: pageView.id, page: pageView.page },
      });
    } catch (error) {
      errorFilter(error, res);
    }
  }

  async getAnalytics(req: Request, res: Response) {
    try {
      const filters: AnalyticsFilters = {};

      if (req.query.startDate) {
        filters.startDate = new Date(req.query.startDate as string);
      }
      if (req.query.endDate) {
        filters.endDate = new Date(req.query.endDate as string);
      }
      if (req.query.page) {
        filters.page = req.query.page as string;
      }
      if (req.query.device) {
        filters.device = req.query.device as "desktop" | "mobile" | "tablet";
      }
      if (req.query.country) {
        filters.country = req.query.country as string;
      }

      const analytics = await this.analyticsService.getAnalytics(req.userId, filters);
      res.status(200).json(analytics);
    } catch (error) {
      errorFilter(error, res);
    }
  }

  async getAnalyticsSummary(req: Request, res: Response) {
    try {
      const summary = await this.analyticsService.getAnalyticsSummary(req.userId);
      res.status(200).json(summary);
    } catch (error) {
      errorFilter(error, res);
    }
  }

  async getRealTimeAnalytics(req: Request, res: Response) {
    try {
      const realTimeData = await this.analyticsService.getRealTimeAnalytics(req.userId);
      res.status(200).json(realTimeData);
    } catch (error) {
      errorFilter(error, res);
    }
  }

  async forceUpdateDailyAnalytics(req: Request, res: Response) {
    try {
      const { date } = req.body;
      const targetDate = date ? new Date(date) : new Date();

      const result = await this.analyticsService.forceUpdateDailyAnalytics(req.userId, targetDate);
      res.status(200).json(result);
    } catch (error) {
      errorFilter(error, res);
    }
  }
}
