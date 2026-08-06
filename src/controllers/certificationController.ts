import { type Request, type Response, Router } from "express";
import AuthPolice from "../middleware/authPolice";
import { CertificationService } from "../services/certificationService";
import type { CertificationAddRequest, CertificationUpdate } from "../types/badges";
import errorFilter from "../utils/isCustomError";

/**
 * @swagger
 * tags:
 *   name: Certifications
 *   description: Operações de CRUD para certificações do Owner
 */
export class CertificationController {
  routerPrivate: Router;
  routerPublic: Router;
  private certificationService = new CertificationService();

  constructor() {
    this.routerPrivate = Router();
    this.routerPublic = Router();
    this.routesPublic();
    this.routesPrivate();
  }

  private routesPublic() {
    this.routerPublic.get("/owner/:ownerId", this.getAllCertifications.bind(this));
    this.routerPublic.get("/:id", this.getCertificationById.bind(this));
  }

  private routesPrivate() {
    this.routerPrivate.use(AuthPolice);
    this.routerPrivate.post("/create", this.create.bind(this));
    this.routerPrivate.put("/:id/update", this.update.bind(this));
    this.routerPrivate.delete("/:id/delete", this.delete.bind(this));
  }

  async getAllCertifications(req: Request, res: Response) {
    const { language } = req.query as { language?: string };

    try {
      // Translated content, when it exists, is already merged in by
      // CertificationService.findAllCertifications (applyTranslations) —
      // this route never calls the LLM (ADR-05, AC-15).
      const result = await this.certificationService.findAllCertifications(req.params.ownerId || "", language);
      res.status(200).json(result);
    } catch (error) {
      errorFilter(error, res);
    }
  }

  async getCertificationById(req: Request, res: Response) {
    const { language } = req.query as { language?: string };

    try {
      const certification = await this.certificationService.findById(req.params.id || "", language);
      res.status(200).json(certification);
    } catch (error) {
      errorFilter(error, res);
    }
  }

  async create(req: Request, res: Response) {
    try {
      const certification: CertificationAddRequest = req.body;
      certification.ownerId = req.userId;
      certification.issueDate = new Date(certification.issueDate);

      if (certification.expirationDate) {
        certification.expirationDate = new Date(certification.expirationDate);
      }

      const certificationCreated = await this.certificationService.addCertification(certification);
      res.status(201).json({
        message: "Certificação adicionada com sucesso",
        certification: certificationCreated,
      });
    } catch (error) {
      errorFilter(error, res);
    }
  }

  async update(req: Request, res: Response) {
    try {
      const certification: CertificationUpdate = req.body;
      const certificationUpdated = await this.certificationService.updateCertification(
        certification,
        req.params.id || "",
      );

      res.status(200).json({
        message: "Certificação atualizada com sucesso",
        certification: certificationUpdated,
      });
    } catch (error) {
      errorFilter(error, res);
    }
  }

  async delete(req: Request, res: Response) {
    try {
      await this.certificationService.deleteCertification(req.params.id || "");
      res.status(200).json({ message: "Certificação deletada com sucesso" });
    } catch (error) {
      errorFilter(error, res);
    }
  }
}
