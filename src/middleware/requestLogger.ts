//biome-ignore-all lint: using for devlopment env
import { performance } from "node:perf_hooks";
import type { NextFunction, Request, Response } from "express";
import { env } from "../env";

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = performance.now();

  if (req.originalUrl.startsWith("/docs")) return next();

  if (env.NODE_ENV === "development") {
    console.log("========== [Nova Requisição] ==========");
    console.log("🔹 Método:", req.method);
    console.log("🔹 URL:", req.originalUrl);
    req.body && console.log("🔹 Corpo:", JSON.stringify(req.body, null, 2));

    const originalSend = res.send;
    res.send = function (body) {
      const end = performance.now();
      const duration = Math.round(end - start);

      console.log("========== [Resposta Enviada] ==========");
      console.log("✅ Status:", res.statusCode);
      console.log("🔹 Corpo:", JSON.stringify(body, null, 2));
      console.log("⏳ Tempo de execução:", `${duration} ms`);

      return originalSend.call(this, body);
    };
  } else {
    console.log("🔹 Método:", req.method);
    console.log("🔹 URL:", req.originalUrl);
  }

  next();
};
