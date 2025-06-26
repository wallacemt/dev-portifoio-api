import { Request, Response, Router } from "express";
import { OwnerService } from "../services/ownerService";
import { OwnerDataResponse } from "../types/owner";
import AuthPolice from "../middleware/authPolice";
import isCustomException from "../utils/isCustomError";
import errorFilter from "../utils/isCustomError";

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
  /**
   * Returns the owner data of the logged in user.
   * @param req - The request object containing the user id.
   * @param res - The response object used to send back the HTTP response.
   * @throws Exception if the owner is not found.
   */
  public async getOwner(req: Request, res: Response) {
    try {
      const owner = await this.ownerService.getOwner(req.userId);
      res.status(200).json(owner);
    } catch (error) {
      errorFilter(error, res);
    }
  }
}
