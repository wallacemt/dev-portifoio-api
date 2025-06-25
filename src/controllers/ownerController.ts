import { Request, Response, Router } from "express";
import { OwnerService } from "../services/ownerService";
import { OwnerDataResponse } from "../types/owner";
import AuthPolice from "../middleware/authPolice";

export class OwnerController {
  public router: Router;
  private ownerService: OwnerService = new OwnerService();
  constructor() {
    this.router = Router();
    this.routes();
  }

  private routes() {
    this.router.use(AuthPolice);
    this.router.get("/me", this.getOwner.bind(this));
  }
  public async getOwner(req: Request, res: Response) {
    try {
      const owner = await this.ownerService.getOwner(req.userId);
      res.status(200).json(owner);
    } catch (e) {
      res.status(500).json({ error: e });
    }
  }
}
