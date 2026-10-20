import type { Request, Response } from 'express';
import { Router } from 'express';
import AuthPolice from '../middleware/authPolice';
import { AnalyticsService } from '../services/analyticsService';
import errorFilter from '../utils/isCustomError';
import { analyticsRangeSchema } from '../validations/analyticsValidation';

export class AnalyticsController {
  routerPrivate = Router();
  private analyticsService = new AnalyticsService();

  constructor() {
    this.routerPrivate.use(AuthPolice);
    this.routerPrivate.get('/dashboard', this.getAnalytics.bind(this));
    this.routerPrivate.get('/summary', this.getAnalyticsSummary.bind(this));
    this.routerPrivate.get('/realtime', this.getRealTimeAnalytics.bind(this));
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
