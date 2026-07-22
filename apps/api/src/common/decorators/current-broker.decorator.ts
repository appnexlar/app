import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface AuthenticatedBroker {
  brokerId: string;
}

/**
 * Injeta o broker autenticado (extraído do JWT pelo guard global).
 * Uso: método(@CurrentBroker() broker: AuthenticatedBroker)
 * ou:  método(@CurrentBroker("brokerId") brokerId: string)
 */
export const CurrentBroker = createParamDecorator(
  (data: keyof AuthenticatedBroker | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ broker?: AuthenticatedBroker }>();
    const broker = request.broker;
    return data && broker ? broker[data] : broker;
  },
);
