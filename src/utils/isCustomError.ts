import type { Response } from 'express';
import { devDebugger } from './devDebugger';
import { Exception } from './exception';

function isCustomException(error: unknown): error is Exception {
  return error instanceof Exception;
}

export default function errorFilter(error: unknown, res: Response) {
  if (isCustomException(error)) {
    res.status(error.status).json({ error: error.message });
  } else {
    devDebugger(
      `Unhandled error: ${error instanceof Error ? error.stack : String(error)}`,
      undefined,
      'error'
    );
    res.status(500).json({ error: 'Error interno do servidor' });
  }
}
