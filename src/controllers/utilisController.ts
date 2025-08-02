import { Router, Request, Response } from "express";
import errorFilter from "../utils/isCustomError";
import { TranslationService } from "../services/geminiService";
import { UtilisService } from "../services/utilisService";
import { QuotaManager } from "../utils/quotaManager";

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
    this.routerPublic.get("/languages", this.getlanguageOptions.bind(this));
    this.routerPublic.get("/quota-status", this.getQuotaStatus.bind(this));
    this.routerPublic.post("/clear-cache", this.clearCache.bind(this));
    this.routerPublic.post("/test-translation", this.testTranslation.bind(this));
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

  public async getlanguageOptions(req: Request, res: Response) {
    try {
      const languages = await this.utilisService.getLeguageApiReferenceUrl();
      res.status(200).json(languages);
    } catch (error) {
      errorFilter(error, res);
    }
  }

 
   
  public async getQuotaStatus(req: Request, res: Response): Promise<void> {
    try {
      const quotaStatus = QuotaManager.getQuotaStatus();
      const cacheStats = TranslationService.getCacheStats();

      res.status(200).json({
        success: true,
        data: {
          quota: quotaStatus,
          cache: cacheStats,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      errorFilter(error, res);
    }
  }

 
  public async clearCache(req: Request, res: Response): Promise<void> {
    try {
      QuotaManager.clearMetrics();

      res.status(200).json({
        success: true,
        message: "Cache e métricas de quota limpos com sucesso",
      });
    } catch (error) {
      errorFilter(error, res);
    }
  }

  
  public async testTranslation(req: Request, res: Response): Promise<void> {
    try {
      const { text, targetLanguage = "en", sourceLanguage = "pt" } = req.body;

      if (!text) {
        res.status(400).json({
          success: false,
          message: "Texto é obrigatório",
        });
        return;
      }

      const testObject = { message: text };

      const result = await this.translationService.translateObject(testObject, targetLanguage, sourceLanguage);

      const quotaStatus = QuotaManager.getQuotaStatus();

      res.status(200).json({
        success: true,
        data: {
          original: testObject,
          translated: result,
          quotaStatus,
        },
      });
    } catch (error) {
      errorFilter(error, res);
    }
  }
}
