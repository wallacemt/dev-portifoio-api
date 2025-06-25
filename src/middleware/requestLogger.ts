import { Request, Response, NextFunction } from "express";
import { performance } from "perf_hooks";

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = performance.now();

  if (req.originalUrl.startsWith("/docs")) return next();

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

  next();
};
