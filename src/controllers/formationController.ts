import { type Request, type Response, Router } from "express";
import AuthPolice from "../middleware/authPolice";
import { FormationService } from "../services/formationService";
import type { FormationAddRequest, FormationUpdate } from "../types/formation";
import errorFilter from "../utils/isCustomError";

/**
 * @swagger
 * tags:
 *   name: Formations
 *   description: Operações de CRUD para formação do Owner
 */
export class FormationController {
  routerPrivate: Router;
  routerPublic: Router;
  private formationService = new FormationService();
  constructor() {
    this.routerPrivate = Router();
    this.routerPublic = Router();
    this.routesPublic();
    this.routesPrivate();
  }
  private routesPublic() {
    this.routerPublic.get("/owner/:ownerId", this.getAllFormation.bind(this));
    this.routerPublic.get("/types", this.getAllTypes.bind(this));
  }
  private routesPrivate() {
    this.routerPrivate.use(AuthPolice);
    this.routerPrivate.post("/create", this.create.bind(this));
    this.routerPrivate.put("/:id/update", this.update.bind(this));
    this.routerPrivate.delete("/:id/delete", this.delete.bind(this));
    this.routerPrivate.post("/:id/conclude", this.conclude.bind(this));
  }

  async getAllTypes(_req: Request, res: Response) {
    try {
      const result = await this.formationService.getAllTypes();
      res.status(200).json(result);
    } catch (error) {
      errorFilter(error, res);
    }
  }

  async getAllFormation(req: Request, res: Response) {
    const { language } = req.query as { language?: string };

    try {
      // Translated content, when it exists, is already merged in by
      // FormationService.findAllFormations (applyTranslations) — this route
      // never calls the LLM (ADR-05, AC-15).
      const result = await this.formationService.findAllFormations(req.params.ownerId || "", language);
      res.status(200).json(result);
    } catch (error) {
      errorFilter(error, res);
    }
  }

  async create(req: Request, res: Response) {
    try {
      const formation: FormationAddRequest = req.body;
      formation.ownerId = req.userId;
      formation.initialDate = new Date(formation.initialDate);
      formation.endDate = new Date(formation.endDate);
      const FormationCreated = await this.formationService.addFormation(formation);
      res.status(201).json({ message: "Formação adicionada com sucesso", FormationCreated });
    } catch (error) {
      errorFilter(error, res);
    }
  }
  async update(req: Request, res: Response) {
    try {
      const formation: FormationUpdate = req.body;
      const formationUpdated = await this.formationService.updateFormation(formation, req.params.id || "");
      res.status(200).json({
        message: "Formation atualizada com sucesso",
        formationUpdated,
      });
    } catch (error) {
      errorFilter(error, res);
    }
  }
  async delete(req: Request, res: Response) {
    try {
      await this.formationService.deleteFormation(req.params.id || "");
      res.status(200).json({ message: "Formation deletada com sucesso" });
    } catch (error) {
      errorFilter(error, res);
    }
  }

  async conclude(req: Request, res: Response) {
    try {
      const formationId = req.params.id || "";
      await this.formationService.concludeFormation(formationId);
      res.status(200).json({ message: "Formação concluída com sucesso" });
    } catch (error) {
      errorFilter(error, res);
    }
  }
}
