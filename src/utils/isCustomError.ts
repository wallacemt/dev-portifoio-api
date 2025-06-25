import { Exception } from "./exception";

export default function isCustomException(error: unknown): error is Exception {
  return error instanceof Exception;
}
