import { Request, Response, Router } from "express";
import { OwnerService } from "../services/ownerService";
import { OwnerDataOptionalRequest, OwnerDataResponse } from "../types/owner";
import AuthPolice from "../middleware/authPolice";
import isCustomException from "../utils/isCustomError";
import errorFilter from "../utils/isCustomError";

export class OwnerController {
  public routerPrivate: Router;
  public routerPublic: Router;
  private ownerService: OwnerService = new OwnerService();
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

  /**
   * Returns the owner data of the logged in user.
   * @param req - The request object containing the user id.
   * @param res - The response object used to send back the HTTP response.
   * @throws Exception if the owner is not found.
   */
  public async getOwner(req: Request, res: Response) {
    try {
      const owner = await this.ownerService.getOwner(req.params.ownerId);
      res.status(200).json(owner);
    } catch (error) {
      errorFilter(error, res);
    }
  }

  public async update(req: Request, res: Response) {
    try {
      const ownerData: OwnerDataOptionalRequest = req.body;
      if (ownerData.birthDate) {
        ownerData.birthDate = new Date(ownerData.birthDate);
        console.log(ownerData.birthDate);
      }
      const ownerUpdated = await this.ownerService.updateOwner(ownerData, req.userId);
      res.status(200).json({ message: "Owner atualizado com sucesso", ownerUpdated });
    } catch (error) {
      errorFilter(error, res);
    }
  }
}
