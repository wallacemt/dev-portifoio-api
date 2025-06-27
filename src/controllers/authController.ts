import { Request, Response, Router } from "express";
import { AuthService } from "../services/authService";

import { OwnerDataRequest, OwnerDataResponse } from "../types/owner";
import errorFilter from "../utils/isCustomError";
export class AuthController {
  public router: Router;
  private authService: AuthService = new AuthService();
  constructor() {
    this.router = Router();
    this.routes();
  }

  /**
   * Defines the routes of the auth controller.
   * @method routes
   * @private
   */
  private routes() {
    this.router.post("/register", this.registerOwner.bind(this));
    this.router.post("/login", this.login.bind(this));
    this.router.get("/", (_req, res) => {
      res.json({ message: "Bem vindo(a)!" });
    });
  }

  /**
   * Handles the registration of a new owner.
   *
   * This function receives a request with owner data, processes the registration
   * through the authentication service, and returns a response indicating the success
   * of the operation or an error message if something goes wrong.
   *
   * @param req - The request object containing the owner data in the body.
   * @param res - The response object used to send back the HTTP response.
   */

  private async registerOwner(req: Request, res: Response) {
    try {
      const owner: OwnerDataRequest = req.body;
      owner.birthDate = new Date(owner.birthDate);
      const data: OwnerDataResponse = await this.authService.registerOwner(owner);
      res.status(201).json({ message: "Owner cadastrado com sucesso!", data });
    } catch (error: unknown) {
      errorFilter(error, res);
    }
  }

  /**
   * Handles the login of an existing owner.
   *
   * This function receives a request with the owner's email and password, processes
   * the authentication through the authentication service, and returns a response
   * indicating the success of the operation or an error message if something goes
   * wrong.
   *
   * @param req - The request object containing the owner's email and password in the body.
   * @param res - The response object used to send back the HTTP response.
   */
  private async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      const owner = await this.authService.login(email, password);
      res.status(200).json({ message: `Bem vindo(a) ${owner.name.split(" ")[0]}!`, token: owner.token });
    } catch (error: unknown) {
      errorFilter(error, res);
    }
  }
}
