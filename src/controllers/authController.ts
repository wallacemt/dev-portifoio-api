import { type Request, type Response, Router } from 'express';
import { AuthService } from '../services/authService';

import type { OwnerDataRequest, OwnerDataResponse } from '../types/owner';
import errorFilter from '../utils/isCustomError';
/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Operações de Autenticação
 */

export class AuthController {
  router: Router;
  private authService: AuthService = new AuthService();
  constructor() {
    this.router = Router();
    this.routes();
  }

  private routes() {
    this.router.post('/register', this.registerOwner.bind(this));
    this.router.post('/login', this.login.bind(this));
    this.router.get('/', (_req, res) => {
      res.json({ message: 'Bem vindo(a)!' });
    });
  }

  private async registerOwner(req: Request, res: Response) {
    try {
      const owner: OwnerDataRequest = req.body;
      owner.birthDate = new Date(owner.birthDate);

      const data: OwnerDataResponse =
        await this.authService.registerOwner(owner);
      res.status(201).json({ message: 'Owner cadastrado com sucesso!', data });
    } catch (error: unknown) {
      errorFilter(error, res);
    }
  }

  private async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      const owner = await this.authService.login(email, password);
      res
        .status(200)
        .json({
          message: `Bem vindo(a) ${owner.name.split(' ')[0]}!`,
          token: owner.token,
        });
    } catch (error: unknown) {
      errorFilter(error, res);
    }
  }
}
