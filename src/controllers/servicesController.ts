import { type Request, type Response, Router } from 'express';
import { ServicesOwnerService } from '../services/servicesOwnerService';
import errorFilter from '../utils/isCustomError';

export class ServicesOwnerController {
  private servicesOwnerService = new ServicesOwnerService();
   routerPublic: Router;
  constructor() {
    this.routerPublic = Router();
    this.routesPublic();
  }
  private routesPublic() {
    this.routerPublic.get('/owner/:ownerId', this.getServicesItens.bind(this));
  }
   async getServicesItens(req: Request, res: Response) {
    const { language } = req.query as { language?: string };
    const { ownerId } = req.params as { ownerId: string };
    try {
      // Translated content, when it exists, is already merged in by
      // ServicesOwnerService.getServicesItems (applyTranslations) — this
      // route never calls the LLM (ADR-05, AC-15).
      const result =
        await this.servicesOwnerService.getServicesItems(ownerId, language);
      res.status(200).json(result);
    } catch (error) {
      errorFilter(error, res);
    }
  }
}
