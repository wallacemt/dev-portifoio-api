import { type Request, type Response, Router } from 'express';
import { TranslationService } from '../services/geminiService';
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
      const services =
        await this.servicesOwnerService.getServicesItems(ownerId);
      if (language && language !== 'pt') {
        try {
          const translated = await this.translationService.translateObject(
            services,
            language,
            'pt'
          );
          res.status(200).json(translated);
        } catch (e) {
          errorFilter(e, res);
        }
      } else {
        res.status(200).json(services);
      }
    } catch (error) {
      errorFilter(error, res);
    }
  }
}
