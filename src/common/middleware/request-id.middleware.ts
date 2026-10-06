import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

export type RequestWithId = Request & { requestId?: string };

export class RequestIdMiddleware {
  use = (request: RequestWithId, response: Response, next: NextFunction) => {
    const supplied = request.header('x-request-id');
    request.requestId = supplied?.slice(0, 128) || randomUUID();
    response.setHeader('x-request-id', request.requestId);
    next();
  };
}
