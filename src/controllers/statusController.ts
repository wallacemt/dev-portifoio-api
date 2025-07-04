import { Request, Response, Router } from "express";
import { StatusService } from "../services/statusService";

export class StatusController {
  public router: Router;
  private statusService: StatusService;

  constructor() {
    this.router = Router();
    this.statusService = new StatusService();
    this.routes();
  }

  private routes() {
    this.router.get("/", this.getStatus.bind(this));
  }

  private async getStatus(req: Request, res: Response) {
    try {
      const status = await this.statusService.getStatus();
      res.status(200).json(status);
    } catch (err) {
      res.status(500).json({ error: "Erro ao obter status", details: err });
    }
  }
}
