import { type Request, type Response, Router } from "express";
import AuthPolice from "../middleware/authPolice";
import { UploadService } from "../services/uploadService";
import errorFilter from "../utils/isCustomError";

/**
 * @swagger
 * tags:
 *   name: Upload
 *   description: Operações de upload de arquivos
 */
export class UploadController {
  router: Router;
  private uploadService = new UploadService();

  constructor() {
    this.router = Router();
    this.routes();
  }

  private routes() {
    this.router.use(AuthPolice);
    this.router.post("/single", this.uploadSingle.bind(this));
    this.router.post("/multiple", this.uploadMultiple.bind(this));
    this.router.delete("/delete", this.deleteFile.bind(this));
  }

  async uploadSingle(req: Request, res: Response) {
    try {
      const { file, folder, filename, resourceType, allowedFormats } = req.body;

      if (!file) {
        res.status(400).json({ message: "Arquivo é obrigatório" });
      }

      const result = await this.uploadService.uploadFile(file, {
        folder,
        filename,
        resourceType,
        allowedFormats,
      });

      res.status(200).json({
        message: "Upload realizado com sucesso",
        result,
      });
    } catch (error) {
      errorFilter(error, res);
    }
  }

  async uploadMultiple(req: Request, res: Response) {
    try {
      const { files, folder, resourceType, allowedFormats } = req.body;

      if (!(files && Array.isArray(files)) || files.length === 0) {
        res.status(400).json({ message: "Arquivos são obrigatórios" });
      }

      const results = await this.uploadService.uploadMultipleFiles(files, {
        folder,
        resourceType,
        allowedFormats,
      });

      res.status(200).json({
        message: "Uploads realizados com sucesso",
        results,
      });
    } catch (error) {
      errorFilter(error, res);
    }
  }

  async deleteFile(req: Request, res: Response) {
    try {
      const { publicId, resourceType } = req.body;

      if (!publicId) {
        res.status(400).json({ message: "Public ID é obrigatório" });
      }

      await this.uploadService.deleteFile(publicId, resourceType || "image");

      res.status(200).json({
        message: "Arquivo deletado com sucesso",
      });
    } catch (error) {
      errorFilter(error, res);
    }
  }
}
