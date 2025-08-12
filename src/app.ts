import cors from 'cors';
import dotenv from 'dotenv';
import express, { type Application } from 'express';
import swaggerUi from 'swagger-ui-express';
import { AnalyticsController } from './controllers/analyticsController';
import { AuthController } from './controllers/authController';
import { FormationController } from './controllers/formationController';
import { OwnerController } from './controllers/ownerController';
import { ProjectController } from './controllers/projectController';
import { ServicesOwnerController } from './controllers/servicesController';
import { SkillController } from './controllers/skillController';
import { StatusController } from './controllers/statusController';
import { UtilisController } from './controllers/utilisController';
import { swaggerSpec } from './docs/swaggerConfiguration';
import { env } from './env';
import { requestLogger } from './middleware/requestLogger';
import { devDebugger } from './utils/devDebugger';

dotenv.config();
class App {
   app: Application;
  constructor() {
    this.app = express();
    this.config();
    this.routes();
    this.listen(env.PORT || 3000);
  }
  routes() {
    this.app.get('/', (_req, res) => res.redirect('/docs'));
    this.app.use('/status', new StatusController().router);
    this.app.use('/auth', new AuthController().router);
    this.app.use('/owner', new OwnerController().routerPublic);
    this.app.use('/owner/private', new OwnerController().routerPrivate);
    this.app.use('/projects/private', new ProjectController().routerPrivate);
    this.app.use('/projects', new ProjectController().routerPublic);
    this.app.use('/skills/private', new SkillController().routerPrivate);
    this.app.use('/skills', new SkillController().routerPublic);
    this.app.use(
      '/formations/private',
      new FormationController().routerPrivate
    );
    this.app.use('/formations', new FormationController().routerPublic);
    this.app.use('/services', new ServicesOwnerController().routerPublic);
    this.app.use('/analytics', new AnalyticsController().routerPublic);
    this.app.use('/analytics/private', new AnalyticsController().routerPrivate);
    this.app.use('/utilis', new UtilisController().routerPublic);
    this.app.use(
      '/docs',
      swaggerUi.serve,
      swaggerUi.setup(swaggerSpec, {
        swaggerOptions: {
          validatorUrl: null,
          tryItOutEnabled: true,
          displayRequestDuration: true,
        },
      })
    );
  }
  config() {
    this.app.use(
      cors({
        origin: env.FRONTEND_URL,
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
      })
    );
    this.app.use(requestLogger);
    this.app.use(express.json());
  }
  listen(port: number | string) {
    this.app.listen(port, () =>
      devDebugger(`Servidor rodando na porta ${port}`)
    );
  }
}

export default new App().app;
