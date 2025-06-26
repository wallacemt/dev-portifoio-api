import { Express } from "express";
import { AuthController } from "./controllers/authController";
import { OwnerController } from "./controllers/ownerController";
import { ProjectController } from "./controllers/projectController";
import { SkillController } from "./controllers/skillController";
export const routes = (app: Express) => {
  const projectController = new ProjectController();
  const skillController = new SkillController();
  app.use("/auth", new AuthController().router);
  app.use("/owner", new OwnerController().router);
  app.use("/projects/private", projectController.routerPrivate);
  app.use("/projects", projectController.routerPublic);
  app.use("/skills/private", skillController.routerPrivate);
  app.use("/skills", skillController.routerPublic);
};
