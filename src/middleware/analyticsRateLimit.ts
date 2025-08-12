import type { NextFunction, Request, Response } from "express";

const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 60_000);

export const trackingRateLimit = (req: Request, res: Response, next: NextFunction): void => {
  if (process.env.NODE_ENV === "development") {
    next();
  }
  const key = `${req.ip}:${req.body?.sessionId || "unknown"}`;
  const now = Date.now();
  const windowMs = 1 * 60 * 1000;
  const maxRequests = 10;

  const record = rateLimitStore.get(key);

  if (!record || now > record.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    next();
    throw new Error("Muitas solicitações de tracking. Tente novamente em alguns segundos.");
  }

  if (record.count >= maxRequests) {
    res.status(429).json({
      error: "Muitas solicitações de tracking. Tente novamente em alguns segundos.",
    });
    return;
  }

  record.count++;
  next();
};

export const adminAnalyticsRateLimit = (req: Request, res: Response, next: NextFunction): void => {
  if (process.env.NODE_ENV === "development") {
     next();
  }

  const key = req .userId || req.ip || "unknown";
  const now = Date.now();
  const windowMs = 1 * 60 * 1000;
  const maxRequests = 30;

  const record = rateLimitStore.get(key);

  if (!record || now > record.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
     next();
     throw new Error("Muitas solicitações administrativas. Tente novamente em alguns segundos.");
  }

  if (record.count >= maxRequests) {
    res.status(429).json({
      error: "Muitas solicitações administrativas. Tente novamente em alguns segundos.",
    });
    return;
  }
  record.count++;
  next();
};
