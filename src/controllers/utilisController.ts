import { Router, Request, Response } from "express";
import errorFilter from "../utils/isCustomError";
import { TranslationService } from "../services/geminiService";
import { UtilisService } from "../services/utilisService";

/**
 * @swagger
 * tags:
 *   name: Utilis
 *   description: Rotas uteis para o sistema
 */
export class UtilisController {
  public routerPublic: Router;
  public utilisService = new UtilisService();
  public translationService = new TranslationService();
  constructor() {
    this.routerPublic = Router();
    this.routesPublic();
  }
  private routesPublic() {
    this.routerPublic.get("/navbar", this.getNavbarItens.bind(this));
    this.routerPublic.get("/services", this.getServicesItens.bind(this));
    this.routerPublic.get("/languages", this.getlanguageOptions.bind(this));
  }

  public async getNavbarItens(req: Request, res: Response) {
    const { language } = req.query as { language?: string };
    try {
      const navbar = this.utilisService.getNavbarItems();
      if (language && language != "pt") {
        try {
          const translated = await this.translationService.translateObject(navbar, language, "pt");
          res.status(200).json(translated);
        } catch (e) {
          errorFilter(e, res);
        }
      } else {
        res.status(200).json(navbar);
      }
    } catch (error) {
      errorFilter(error, res);
    }
  }
  public async getServicesItens(req: Request, res: Response) {
    const { language } = req.query as { language?: string };
    try {
      const services = this.utilisService.getServicesItems();
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
  public async getlanguageOptions(req: Request, res: Response) {
    try {
      const languages = await this.utilisService.getLeguageApiReferenceUrl();
      res.status(200).json(languages);
    } catch (error) {
      errorFilter(error, res);
    }
  }
}
