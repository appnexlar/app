import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { FastifyReply } from "fastify";

interface ErrorBody {
  statusCode: number;
  message: string;
  errors?: { field: string; message: string }[];
  details?: Record<string, unknown>;
}

/** Padroniza todas as respostas de erro: { statusCode, message, errors? }. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("HttpException");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorBody = { statusCode: status, message: "Erro interno do servidor" };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === "string") {
        body = { statusCode: status, message: response };
      } else {
        const r = response as {
          message?: string | string[];
          errors?: ErrorBody["errors"];
          details?: ErrorBody["details"];
        };
        const message = Array.isArray(r.message) ? r.message.join("; ") : r.message ?? exception.message;
        body = { statusCode: status, message, errors: r.errors, details: r.details };
      }
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    reply.status(status).send(body);
  }
}
