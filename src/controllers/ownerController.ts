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
    this.routerPublic.post("/:ownerId/verify-secret-word", this.postverifySecretWord.bind(this));
  }
  private routesPrivate() {
    this.routerPrivate.use(AuthPolice);
    this.routerPrivate.put("/update", this.update.bind(this));
    this.routerPrivate.post("/set-secret-word", this.postSecretWord.bind(this));
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

  public async postSecretWord(req: Request, res: Response) {
    try {
      const { secretWord } = req.body;
      await this.ownerService.setSecretWord(req.userId, secretWord);
      res.status(200).json({ message: "Palavra secreta cadastrada com sucesso" });
    } catch (error) {
      errorFilter(error, res);
    }
  }

  public async postverifySecretWord(req: Request, res: Response) {
    try {
      const { secretWord } = req.body;
      const result = await this.ownerService.verifySecretWord(req.params.ownerId, secretWord);
      res
        .status(result.status)
        .json({ message: "Palavra secreta verificada com sucesso", status: result.status, isValid: result.isValid });
    } catch (error) {
      errorFilter(error, res);
    }
  }
}
