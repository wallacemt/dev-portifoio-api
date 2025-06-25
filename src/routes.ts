import { Express } from "express";
import { AuthController } from "./controllers/authController";
import { OwnerController } from "./controllers/ownerController";
export const routes = (app: Express) => {
  app.use("/auth", new AuthController().router);
  app.use("/owner", new OwnerController().router);
};
