import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export default function serviceAuthPolice(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const secret = process.env.BRIEFING_SERVICE_TOKEN;
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  const received = Buffer.from(token);
  const expected = Buffer.from(secret ?? '');
  if (
    !(secret && token) ||
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    res.status(401).json({ error: 'Token de serviço inválido ou ausente' });
    return;
  }
  next();
}
