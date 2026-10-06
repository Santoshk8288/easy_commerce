export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number,
    public readonly details?: unknown,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class CourierError extends DomainError {
  constructor(
    code: string,
    message: string,
    httpStatus = 502,
    retryable = false,
    public readonly rawPayload?: unknown,
    public readonly requestPayload?: unknown,
  ) {
    super(code, message, httpStatus, undefined, retryable);
    this.name = 'CourierError';
  }
}
