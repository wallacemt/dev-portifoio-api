import { Express } from "express";
import { AuthController } from "./controllers/authController";
import { OwnerController } from "./controllers/ownerController";
import { ProjectController } from "./controllers/projectController";
export const routes = (app: Express) => {
  const projectController = new ProjectController();

  app.use("/auth", new AuthController().router);
  app.use("/owner", new OwnerController().router);
  app.use("/projects/private", projectController.routerPrivate);
  app.use("/projects", projectController.routerPublic);
};
