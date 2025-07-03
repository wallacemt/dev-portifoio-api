import { Router, Request, Response } from "express";
import AuthPolice from "../middleware/authPolice";
import errorFilter from "../utils/isCustomError";
import { SkillAddRequest, SkillUpdateRequest } from "../types/skills";
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
    this.routerPublic.get("/lenguages", this.getLenguageOptions.bind(this));
  }

  public async getNavbarItens(req: Request, res: Response) {
    const { lenguage } = req.query as { lenguage?: string };
    try {
      const navbar = this.utilisService.getNavbarItems();
      if (lenguage && lenguage != "pt") {
        try {
          const translated = await this.translationService.translateObject(navbar, lenguage, "pt");
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
    const { lenguage } = req.query as { lenguage?: string };
    try {
      const services = this.utilisService.getServicesItems();
      if (lenguage && lenguage != "pt") {
        try {
          const translated = await this.translationService.translateObject(services, lenguage, "pt");
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
  public async getLenguageOptions(req: Request, res: Response) {
    try {
      const lenguages = await this.utilisService.getLeguageApiReferenceUrl();
      res.status(200).json(lenguages);
    } catch (error) {
      errorFilter(error, res);
    }
  }
}
