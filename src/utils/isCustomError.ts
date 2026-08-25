import type { Response } from 'express';
import { Exception } from './exception';

function isCustomException(error: unknown): error is Exception {
  return error instanceof Exception;
}

export default function errorFilter(error: unknown, res: Response) {
  if (isCustomException(error)) {
    res.status(error.status).json({ error: error.message });
  } else {
    // Always logged, prod included: devDebugger is a no-op in production,
    // and an unhandled 500 with no trace anywhere is undebuggable.
    console.error(
      `Unhandled error: ${error instanceof Error ? error.stack : String(error)}`
    );
    res.status(500).json({ error: 'Error interno do servidor' });
  }
}
