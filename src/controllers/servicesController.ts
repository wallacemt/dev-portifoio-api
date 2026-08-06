import { type Request, type Response, Router } from 'express';
import { TranslationService } from '../services/aiService';
import { ServicesOwnerService } from '../services/servicesOwnerService';
import errorFilter from '../utils/isCustomError';

export class ServicesOwnerController {
  private servicesOwnerService = new ServicesOwnerService();
   routerPublic: Router;
   translationService = new TranslationService();
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
      const result =
        await this.servicesOwnerService.getServicesItems(ownerId, language);
      if (language && language !== 'pt') {
        try {
          const translatedServices = await this.translationService.translateObject(
            result.services,
            language,
            'pt'
          );
          res.status(200).json({ ...result, services: translatedServices });
        } catch (e) {
          errorFilter(e, res);
        }
      } else {
        res.status(200).json(result);
      }
    } catch (error) {
      errorFilter(error, res);
    }
  }
}
