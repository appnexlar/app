import { SetMetadata } from "@nestjs/common";

export const RATE_LIMIT_KEY = "rateLimit";

export interface RateLimitRule {
  /** Nome do balde. Regras diferentes não se misturam. */
  name: string;
  /** Quantas requisições cabem na janela. */
  limit: number;
  /** Tamanho da janela em milissegundos. */
  windowMs: number;
}

/**
 * Limita quantas vezes o mesmo IP pode chamar a rota dentro da janela.
 *
 * É a trava grossa, contra automação. A trava fina do login (falhas por conta)
 * mora no LoginAttemptService, porque só ela sabe se a tentativa deu errado.
 */
export const RateLimit = (rule: RateLimitRule) => SetMetadata(RATE_LIMIT_KEY, rule);
