import type { Request, Response } from 'express';
import { Router } from 'express';
import { trackingRateLimit } from '../middleware/analyticsRateLimit';
import AuthPolice from '../middleware/authPolice';
import { AnalyticsService } from '../services/analyticsService';
import { LegacyAnalyticsTrackingService } from '../services/legacyAnalyticsTrackingService';
import type {
  TrackPageViewRequest,
  TrackVisitorRequest,
} from '../types/analytics';
import errorFilter from '../utils/isCustomError';
import { analyticsRangeSchema } from '../validations/analyticsValidation';

export class AnalyticsController {
  routerPrivate = Router();
  routerPublic = Router();
  private analyticsService = new AnalyticsService();
  private trackingService = new LegacyAnalyticsTrackingService();

  constructor() {
    this.routerPublic.post(
      '/:ownerId/track-visitor',
      trackingRateLimit,
      this.trackVisitor.bind(this)
    );
    this.routerPublic.post(
      '/:ownerId/track-pageview',
      trackingRateLimit,
      this.trackPageView.bind(this)
    );
    this.routerPrivate.use(AuthPolice);
    this.routerPrivate.get('/dashboard', this.getAnalytics.bind(this));
    this.routerPrivate.get('/summary', this.getAnalyticsSummary.bind(this));
    this.routerPrivate.get('/realtime', this.getRealTimeAnalytics.bind(this));
  }

  async trackVisitor(req: Request, res: Response): Promise<void> {
    try {
      const { ownerId } = req.params;
      const visitorData: TrackVisitorRequest = req.body;
      if (!ownerId) {
        res.status(400).json({ error: "ID do proprietário é obrigatório" });
        return;
      }
      const visitor = await this.trackingService.trackVisitor(
        visitorData,
        ownerId ?? '',
        req.ip || req.socket.remoteAddress || 'unknown'
      );
      res.status(visitor.isExisting ? 200 : 201).json({
        message: visitor.isExisting
          ? 'Visitante já registrado'
          : 'Visitante registrado com sucesso',
        visitor: { id: visitor.id, sessionId: visitor.sessionId },
        cached: Boolean(visitor.isExisting),
      });
    } catch (error) {
      errorFilter(error, res);
    }
  }

  async trackPageView(req: Request, res: Response): Promise<void> {
    try {
      const body: {
        pageView: TrackPageViewRequest;
        visitor: TrackVisitorRequest;
      } = req.body;
      const pageView = await this.trackingService.trackPageView(
        body.pageView,
        req.params.ownerId || '',
        body.visitor,
        req.ip || req.socket.remoteAddress || 'unknown'
      );
      res
        .status(201)
        .json({
          message: 'Visualização registrada com sucesso',
          pageView: { id: pageView.id, page: pageView.page },
        });
    } catch (error) {
      errorFilter(error, res);
    }
  }

  async getAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const parsed = analyticsRangeSchema.safeParse(req.query);
      if (!parsed.success) {
        res
          .status(400)
          .json({
            error:
              parsed.error.issues[0]?.message ?? 'Intervalo de datas inválido',
          });
        return;
      }
      const filters = parsed.data;
      res
        .status(200)
        .json(await this.analyticsService.getAnalytics(req.userId, filters));
    } catch (error) {
      errorFilter(error, res);
    }
  }

  async getAnalyticsSummary(req: Request, res: Response): Promise<void> {
    try {
      res
        .status(200)
        .json(await this.analyticsService.getAnalyticsSummary(req.userId));
    } catch (error) {
      errorFilter(error, res);
    }
  }

  async getRealTimeAnalytics(req: Request, res: Response): Promise<void> {
    try {
      res
        .status(200)
        .json(await this.analyticsService.getRealTimeAnalytics(req.userId));
    } catch (error) {
      errorFilter(error, res);
    }
  }
}
