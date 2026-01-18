import { type Request, type Response, Router } from "express";
import AuthPolice from "../middleware/authPolice";
import { BadgeService } from "../services/badgeService";
import { TranslationService } from "../services/geminiService";
import type { BadgeAddRequest, BadgeUpdate } from "../types/badges";
import errorFilter from "../utils/isCustomError";

/**
 * @swagger
 * tags:
 *   name: Badges
 *   description: Operações de CRUD para badges do Owner
 */
export class BadgeController {
  routerPrivate: Router;
  routerPublic: Router;
  private badgeService = new BadgeService();
  private translationService = new TranslationService();

  constructor() {
    this.routerPrivate = Router();
    this.routerPublic = Router();
    this.routesPublic();
    this.routesPrivate();
  }

  private routesPublic() {
    this.routerPublic.get("/owner/:ownerId", this.getAllBadges.bind(this));
    this.routerPublic.get("/:id", this.getBadgeById.bind(this));
  }

  private routesPrivate() {
    this.routerPrivate.use(AuthPolice);
    this.routerPrivate.post("/create", this.create.bind(this));
    this.routerPrivate.put("/:id/update", this.update.bind(this));
    this.routerPrivate.delete("/:id/delete", this.delete.bind(this));
  }

  async getAllBadges(req: Request, res: Response) {
    const { language } = req.query as { language?: string };

    try {
      const badges = await this.badgeService.findAllBadges(req.params.ownerId || "");

      if (language && language !== "pt") {
        try {
          const translated = await this.translationService.translateObject(
            badges,
            language,
            "pt",
            "Traduza os dados dos badges",
          );
          res.status(200).json(translated);
        } catch (e) {
          errorFilter(e, res);
        }
      } else {
        res.status(200).json(badges);
      }
    } catch (error) {
      errorFilter(error, res);
    }
  }

  async getBadgeById(req: Request, res: Response) {
    const { language } = req.query as { language?: string };

    try {
      const badge = await this.badgeService.findById(req.params.id || "");

      if (language && language !== "pt") {
        try {
          const translated = await this.translationService.translateObject(
            badge,
            language,
            "pt",
            "Traduza os dados do badge",
          );
          res.status(200).json(translated);
        } catch (e) {
          errorFilter(e, res);
        }
      } else {
        res.status(200).json(badge);
      }
    } catch (error) {
      errorFilter(error, res);
    }
  }

  async create(req: Request, res: Response) {
    try {
      const badge: BadgeAddRequest = req.body;
      badge.ownerId = req.userId;
      badge.issueDate = new Date(badge.issueDate);

      const badgeCreated = await this.badgeService.addBadge(badge);
      res.status(201).json({
        message: "Badge adicionado com sucesso",
        badge: badgeCreated,
      });
    } catch (error) {
      errorFilter(error, res);
    }
  }

  async update(req: Request, res: Response) {
    try {
      const badge: BadgeUpdate = req.body;
      const badgeUpdated = await this.badgeService.updateBadge(badge, req.params.id || "");

      res.status(200).json({
        message: "Badge atualizado com sucesso",
        badge: badgeUpdated,
      });
    } catch (error) {
      errorFilter(error, res);
    }
  }

  async delete(req: Request, res: Response) {
    try {
      await this.badgeService.deleteBadge(req.params.id || "");
      res.status(200).json({ message: "Badge deletado com sucesso" });
    } catch (error) {
      errorFilter(error, res);
    }
  }
}
