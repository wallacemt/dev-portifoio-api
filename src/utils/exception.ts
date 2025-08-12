export class Exception extends Error {
  public status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;

    Error.captureStackTrace(this, this.constructor);
  }
}
