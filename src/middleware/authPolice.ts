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
function verifyToken(token: string): string {
  const { id } = jwt.verify(token, jwtSecret) as { id: string };
  return id;
}

export default function authPolice(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token de autenticação não encontrado" });
    return;
  }

  const token = authHeader?.slice(7);

  try {
    req.userId = verifyToken(token || "");
    next();
  } catch {
    res.status(401).json({ error: "Token inválido ou expirado!" });
    return;
  }
}

