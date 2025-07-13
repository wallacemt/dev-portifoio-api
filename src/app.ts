import cors from "cors";
import dotenv from "dotenv";
import { requestLogger } from "./middleware/requestLogger";
import { AuthController } from "./controllers/authController";
import { OwnerController } from "./controllers/ownerController";
import { ProjectController } from "./controllers/projectController";
import { SkillController } from "./controllers/skillController";
import { FormationController } from "./controllers/formationController";
import express, { Application, Express } from "express";
import { swaggerSpec } from "./docs/swaggerConfiguration";
import swaggerUi from "swagger-ui-express";
import { UtilisController } from "./controllers/utilisController";
import { StatusController } from "./controllers/statusController";

dotenv.config();
class App {
  public app: Application;
  constructor() {
    this.app = express();
    this.config();
    this.routes();
    this.listen(process.env.PORT || 3000);
  }
  routes() {
    const projectController = new ProjectController();
    const skillController = new SkillController();
    const formationController = new FormationController();
    const ownerController = new OwnerController();
    const utilisController = new UtilisController();
    this.app.get("/", (_req, res) => res.redirect("/docs"));
    this.app.use("/status", new StatusController().router);
    this.app.use("/auth", new AuthController().router);
    this.app.use("/owner", ownerController.routerPublic);
    this.app.use("/owner/private", ownerController.routerPrivate);
    this.app.use("/projects/private", projectController.routerPrivate);
    this.app.use("/projects", projectController.routerPublic);
    this.app.use("/skills/private", skillController.routerPrivate);
    this.app.use("/skills", skillController.routerPublic);
    this.app.use("/formations/private", formationController.routerPrivate);
    this.app.use("/formations", formationController.routerPublic);
    this.app.use("/utilis", utilisController.routerPublic);
    this.app.use(
      "/docs",
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
    this.app.use(cors({ origin: process.env.FRONTEND_URL }));
    if (process.env.NODE_ENV !== "production") this.app.use(requestLogger);
    this.app.use(express.json());
  }
  listen(port: number | string) {
    this.app.listen(port, () => console.log(`Servidor rodando na porta ${port}`));
  }
}

export default new App().app;
