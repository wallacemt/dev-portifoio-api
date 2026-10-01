import { type Request, type Response, Router } from 'express';
import authPolice from '../middleware/authPolice';
import serviceAuthPolice from '../middleware/serviceAuthPolice';
import { BriefingService } from '../services/briefingService';
import { Exception } from '../utils/exception';
import errorFilter from '../utils/isCustomError';
import { briefingHistorySchema } from '../validations/briefingValidations';

export class BriefingController {
  routerPrivate = Router();
  routerPublic = Router();
  routerIntegration = Router();
  private briefingService = new BriefingService();

  constructor() {
    this.routerPublic.get('/current', this.getCurrent.bind(this));
    this.routerPrivate.use(authPolice);
    this.routerPrivate.get('/', this.getHistory.bind(this));
    this.routerPrivate.get('/:date', this.getByDate.bind(this));
    this.routerIntegration.use(serviceAuthPolice);
    this.routerIntegration.put('/:date', this.upsert.bind(this));
  }

  async getCurrent(_req: Request, res: Response) {
    try {
      const briefing = await this.briefingService.getCurrent();
      if (!briefing) throw new Exception('Briefing não encontrado', 404);
      res.status(200).json(briefing);
    } catch (error) {
      errorFilter(error, res);
    }
  }

  async getByDate(req: Request, res: Response) {
    try {
      const briefing = await this.briefingService.getByDate(
        String(req.params.date ?? '')
      );
      if (!briefing) throw new Exception('Briefing não encontrado', 404);
      res.status(200).json(briefing);
    } catch (error) {
      errorFilter(error, res);
    }
  }

  async getHistory(req: Request, res: Response) {
    try {
      const parsed = briefingHistorySchema.safeParse(req.query);
      if (!parsed.success)
        throw new Exception(
          'Paginação inválida: page >= 1 e limit entre 1 e 50',
          400
        );
      const { page, limit } = parsed.data;
      const briefings = await this.briefingService.getHistory(page, limit);
      res.status(200).json({ briefings, page, limit });
    } catch (error) {
      errorFilter(error, res);
    }
  }

  async upsert(req: Request, res: Response) {
    try {
      const briefing = await this.briefingService.upsert(
        String(req.params.date ?? ''),
        req.body
      );
      res.status(200).json({ message: 'Briefing salvo com sucesso', briefing });
    } catch (error) {
      errorFilter(error, res);
    }
  }
}
