import type { Response } from 'express';
import { Exception } from './exception';

function isCustomException(error: unknown): error is Exception {
  return error instanceof Exception;
}

export default function errorFilter(error: unknown, res: Response) {
  if (isCustomException(error)) {
    res.status(error.status).json({ error: error.message });
  } else {
    res
      .status(500)
      .json({ error: { message: 'Error interno so servidor', detail: error } });
  }
}
