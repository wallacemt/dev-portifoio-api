import { Request, Response, Router } from "express";
import { OwnerService } from "../services/ownerService";
import { OwnerDataOptionalRequest, OwnerDataResponse } from "../types/owner";
import AuthPolice from "../middleware/authPolice";
import isCustomException from "../utils/isCustomError";
import errorFilter from "../utils/isCustomError";
import { TranslationService } from "../services/geminiService";

/**
 * @swagger
 * tags:
 *   name: Owner
 *   description: Operações de atualização de informação do Owner
 */
export class OwnerController {
  public routerPrivate: Router;
  public routerPublic: Router;
  private ownerService: OwnerService = new OwnerService();
  private translationService = new TranslationService();
  constructor() {
    this.routerPrivate = Router();
    this.routerPublic = Router();
    this.routesPublic();
    this.routesPrivate();
  }

  private routesPublic() {
    this.routerPublic.get("/:ownerId", this.getOwner.bind(this));
  }
  private routesPrivate() {
    this.routerPrivate.use(AuthPolice);
    this.routerPrivate.put("/update", this.update.bind(this));
  }

  
  public async getOwner(req: Request, res: Response) {
    const { language } = req.query as { language?: string };
    try {
      const owner = await this.ownerService.getOwner(req.params.ownerId);
      if (language && language != "pt") {
        try {
          const translated = await this.translationService.translateObject(owner, language, "pt");
          res.status(200).json(translated);
        } catch (e) {
          errorFilter(e, res);
        }
      } else {
        res.status(200).json(owner);
      }
    } catch (error) {
      errorFilter(error, res);
    }
  }

  public async update(req: Request, res: Response) {
    try {
      const ownerData: OwnerDataOptionalRequest = req.body;
      if (ownerData.birthDate) {
        ownerData.birthDate = new Date(ownerData.birthDate);
      }
      const ownerUpdated = await this.ownerService.updateOwner(ownerData, req.userId);
      res.status(200).json({ message: "Owner atualizado com sucesso", ownerUpdated });
    } catch (error) {
      errorFilter(error, res);
    }
  }
}
