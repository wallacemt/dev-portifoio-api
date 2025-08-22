import { type Request, type Response, Router } from "express";
import { TranslationService } from "../services/geminiService";
import { UtilisService } from "../services/utilisService";
import errorFilter from "../utils/isCustomError";
import { QuotaManager } from "../utils/quotaManager";

/**
 * @swagger
 * tags:
 *   name: Utilis
 *   description: Rotas uteis para o sistema
 */
export class UtilisController {
  routerPublic: Router;
  utilisService = new UtilisService();
  translationService = new TranslationService();
  constructor() {
    this.routerPublic = Router();
    this.routesPublic();
  }
  private routesPublic() {
    this.routerPublic.get("/navbar", this.getNavbarItens.bind(this));
    this.routerPublic.get("/languages", this.getlanguageOptions.bind(this));
    this.routerPublic.get("/quota-status", this.getQuotaStatus.bind(this));
    this.routerPublic.get("/translation-stats", this.getTranslationStats.bind(this));
    this.routerPublic.post("/clear-cache", this.clearCache.bind(this));
    this.routerPublic.post("/force-clean-cache", this.forceCleanCache.bind(this));
    this.routerPublic.post("/test-translation", this.testTranslation.bind(this));
  }

  async getNavbarItens(req: Request, res: Response) {
    const { language } = req.query as { language?: string };
    try {
      const navbar = this.utilisService.getNavbarItems();
      if (language && language !== "pt") {
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

  getlanguageOptions(_req: Request, res: Response) {
    try {
      const languages = this.utilisService.getLeguageApiReferenceUrl();
      res.status(200).json(languages);
    } catch (error) {
      errorFilter(error, res);
    }
  }

  getQuotaStatus(_req: Request, res: Response) {
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

  clearCache(_req: Request, res: Response) {
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

  getTranslationStats(_req: Request, res: Response) {
    try {
      const stats = TranslationService.getTranslationStats();
      const quotaStatus = QuotaManager.getQuotaStatus();

      res.status(200).json({
        success: true,
        data: {
          translation: stats,
          quota: quotaStatus,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      errorFilter(error, res);
    }
  }

  forceCleanCache(req: Request, res: Response) {
    try {
      const { maxAge } = req.body;
      const ageInMs = maxAge ? Number(maxAge) * 60 * 60 * 1000 : 12 * 60 * 60 * 1000; 

      const statsBefore = TranslationService.getTranslationStats();
      TranslationService.forceCleanCache(ageInMs);
      const statsAfter = TranslationService.getTranslationStats();

      res.status(200).json({
        success: true,
        message: "Cache limpo com sucesso",
        data: {
          before: statsBefore,
          after: statsAfter,
          removed: statsBefore.cacheSize - statsAfter.cacheSize,
          maxAgeHours: ageInMs / (60 * 60 * 1000),
        },
      });
    } catch (error) {
      errorFilter(error, res);
    }
  }

  async testTranslation(req: Request, res: Response): Promise<void> {
    try {
      const { text, targetLanguage = "en", sourceLanguage = "pt", testChunking = false } = req.body;

      if (!text) {
        res.status(400).json({
          success: false,
          message: "Texto é obrigatório",
        });
        return;
      }

      // Se testChunking for true, cria um objeto grande para testar o sistema de chunks
      let testObject: object;
      if (testChunking) {
        testObject = {
          title: text,
          descriptions: Array.from({ length: 10 }, (_, i) => `${text} - Descrição ${i + 1}`),
          content: {
            main: text,
            secondary: Array.from({ length: 5 }, (_, i) => ({
              title: `Seção ${i + 1}`,
              content: `${text} - Conteúdo da seção ${i + 1}`,
            })),
          },
        };
      } else {
        testObject = { message: text };
      }

      const startTime = Date.now();
      const result = await this.translationService.translateObject(testObject, targetLanguage, sourceLanguage);
      const endTime = Date.now();

      const quotaStatus = QuotaManager.getQuotaStatus();
      const translationStats = TranslationService.getTranslationStats();

      res.status(200).json({
        success: true,
        data: {
          original: testObject,
          translated: result,
          performance: {
            duration: `${endTime - startTime}ms`,
            chunked: testChunking,
            estimatedTokens: TranslationService.estimateTokens(JSON.stringify(testObject)),
          },
          quotaStatus,
          translationStats,
        },
      });
    } catch (error) {
      errorFilter(error, res);
    }
  }
}
