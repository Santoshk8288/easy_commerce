import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { DomainError } from '../errors/domain.error';
import { RequestWithId } from '../middleware/request-id.middleware';

interface ValidationMessage {
  property?: string;
  constraints?: Record<string, string>;
  children?: ValidationMessage[];
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<RequestWithId>();
    const requestId = request.requestId ?? 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let details: unknown;

    if (exception instanceof DomainError) {
      status = exception.httpStatus;
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
      } else {
        const body = payload as Record<string, unknown>;
        message =
          typeof body.message === 'string' ? body.message : exception.message;
        code = Number(status) === 400 ? 'VALIDATION_ERROR' : `HTTP_${status}`;
        if (Array.isArray(body.message)) {
          message = 'Request validation failed';
          details = {
            fields: this.flattenValidation(body.message),
          };
        }
      }
    }

    const error =
      exception instanceof Error ? exception : new Error(String(exception));
    const logContext = {
      requestId,
      method: request.method,
      path: request.url,
      orderId: request.params?.orderId ?? request.body?.orderId,
      courierPartner: request.body?.courierPartner,
      errorType: code,
      stack: error.stack,
    };
    if (Number(status) >= 500) this.logger.error(logContext);
    else this.logger.warn(logContext);

    response.status(status).json({
      error: { code, message, ...(details === undefined ? {} : { details }) },
      requestId,
      timestamp: new Date().toISOString(),
    });
  }

  private flattenValidation(messages: unknown[], prefix = '') {
    const fields: Array<{ field: string; messages: string[] }> = [];
    for (const item of messages) {
      if (typeof item === 'string') {
        fields.push({ field: item.split(' ')[0] ?? '', messages: [item] });
        continue;
      }
      if (!item || typeof item !== 'object') continue;
      const validation = item as ValidationMessage;
      const field = prefix
        ? `${prefix}.${validation.property ?? ''}`
        : (validation.property ?? '');
      if (validation.constraints)
        fields.push({ field, messages: Object.values(validation.constraints) });
      if (validation.children?.length)
        fields.push(...this.flattenValidation(validation.children, field));
    }
    return fields;
  }
}
