import type { NextFunction, Request, Response } from "express";

const rateLimitStore = new Map<string, { count: number; resetTime: number; firstRequest: number }>();

setInterval(() => {
  const now = Date.now();
  const keysToDelete: string[] = [];

  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.resetTime) {
      keysToDelete.push(key);
    }
  }
  for (const key of keysToDelete) {
    rateLimitStore.delete(key);
  }
}, 120_000);


export const trackingRateLimit = (req: Request, res: Response, next: NextFunction): void => {
 
  if (process.env.NODE_ENV === "development") {
    next();
    return;
  }

  const key = `${req.ip}:${req.body?.sessionId || "unknown"}`;
  const now = Date.now();
  const windowMs = 5 * 60 * 1000; 
  const maxRequests = 50; 

  const record = rateLimitStore.get(key);

  if (!record || now > record.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs, firstRequest: now });
    next();
    return;
  }

  if (record.count >= maxRequests) {
    res.status(429).json({
      error: "Muitas solicitações de tracking. Tente novamente em alguns segundos.",
      retryAfter: Math.ceil((record.resetTime - now) / 1000),
    });
    return;
  }

  record.count++;
  next();
};

export const adminAnalyticsRateLimit = (req: Request, res: Response, next: NextFunction): void => {

  if (process.env.NODE_ENV === "development") {
    next();
    return;
  }

  const key = req.userId || req.ip || "unknown";
  const now = Date.now();
  const windowMs = 1 * 60 * 1000; // 1 minuto
  const maxRequests = 60; // Mais tolerante para admin

  const record = rateLimitStore.get(key);

  if (!record || now > record.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs, firstRequest: now });
    next();
    return;
  }

  if (record.count >= maxRequests) {
    res.status(429).json({
      error: "Muitas solicitações administrativas. Tente novamente em alguns segundos.",
      retryAfter: Math.ceil((record.resetTime - now) / 1000),
    });
    return;
  }

  record.count++;
  next();
};
