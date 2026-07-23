import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { RateLimitStore, formatWait } from "../common/rate-limit/rate-limit.store";

/** Falhas seguidas antes de a conta ficar em espera. */
const MAX_FALHAS = 5;
/** Janela de contagem e de espera. */
const JANELA_MS = 15 * 60 * 1000;

/**
 * Trava fina do login: conta as tentativas que deram errado por conta, não as
 * requisições. Quem acerta a senha na quinta vez não é punido, e quem tenta
 * adivinhar para na quinta errada.
 *
 * A contagem é por e-mail, e não por IP, porque o atacante troca de IP e a
 * conta alvo continua a mesma. Ela roda também para e-mail que não existe,
 * senão o bloqueio viraria um jeito de descobrir quais contas existem.
 */
@Injectable()
export class LoginAttemptService {
  constructor(private readonly store: RateLimitStore) {}

  private key(email: string): string {
    return `login-falhas:${email}`;
  }

  /** Barra a tentativa antes de tocar no banco, se a conta já estourou. */
  assertNotBlocked(email: string): void {
    const bucket = this.store.peek(this.key(email));
    if (!bucket || bucket.count < MAX_FALHAS) return;

    const seconds = Math.max(1, Math.ceil((bucket.resetAt - Date.now()) / 1000));
    throw new HttpException(
      `Muitas tentativas de entrada. Tente novamente em ${formatWait(seconds)} ou redefina sua senha.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  registerFailure(email: string): void {
    this.store.hit(this.key(email), JANELA_MS);
  }

  /** Login certo ou senha redefinida: a conta volta ao normal. */
  clear(email: string): void {
    this.store.reset(this.key(email));
  }
}
