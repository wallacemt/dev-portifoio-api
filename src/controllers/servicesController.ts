import { ServicesOwnerService } from "../services/servicesOwnerService";
import { Router, Request, Response } from "express";
import errorFilter from "../utils/isCustomError";
import { TranslationService } from "../services/geminiService";

export class ServicesOwnerController {
  private servicesOwnerService = new ServicesOwnerService();
  public routerPublic: Router;
  public translationService = new TranslationService();
  constructor() {
    this.routerPublic = Router();
    this.routesPublic();
  }
  private routesPublic() {
    this.routerPublic.get("/owner/:ownerId", this.getServicesItens.bind(this));
  }
  public async getServicesItens(req: Request, res: Response) {
    const { language } = req.query as { language?: string };
    const { ownerId } = req.params as { ownerId: string };
    try {
      const services = await this.servicesOwnerService.getServicesItems(ownerId);
      if (language && language != "pt") {
        try {
          const translated = await this.translationService.translateObject(services, language, "pt");
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
