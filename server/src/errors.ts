export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues?: {
      code: string;
      entityId: string;
      message: string;
      severity: string;
    }[],
  ) {
    super(message);
  }
}
