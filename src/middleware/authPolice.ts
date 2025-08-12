import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../env";

const jwtSecret = env.JWT_SECRET;

declare module "express-serve-static-core" {
  //biome-ignore lint: method for add userId in Request
  interface Request {
    userId: string;
  }
}

export function authPolice(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token de autenticação não encontrado" });
  }

  const token = authHeader.slice(7);

  try {
    const { id } = jwt.verify(token, jwtSecret) as { id: string };
    req.userId = id;
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido ou expirado!" });
  }
}
