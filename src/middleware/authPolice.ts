import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken"
import { env } from "../env";
const jwtSecret = env.JWT_SECRET;

declare global {
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}


export default async function AuthPolice(request: Request, response: Response, next: NextFunction) {
    const authHeader = request.headers.authorization;
    if(!authHeader) {
        response.status(401).json({ error: "Token de autenticação não encontrado" });
        return;
    }else {
        const token = authHeader.replace("Bearer ", "");
        try {
            const auth = jwt.verify(token, jwtSecret!) as {id:string};
            request.userId =auth.id
            next();
        }catch(e:unknown){
            response.status(401).json({error: "Token inválido ou expirado!"});            
            return;
        }
    }
}