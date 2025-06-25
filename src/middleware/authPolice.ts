import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken"
import { Exception } from "../utils/exception";
const jwtSecret = process.env.JWT_SECRET;

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
        response.status(401).json({ message: "Nao autorizado!" });
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