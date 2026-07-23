import { Injectable } from "@nestjs/common";

interface Bucket {
  count: number;
  /** Instante em que o balde zera (epoch ms). */
  resetAt: number;
}

/**
 * Contador de janela fixa em memória, usado pelo limite de tentativas.
 *
 * Fica na memória do processo de propósito: a API roda numa instância só e
 * assim não depende de Redis. Duas consequências assumidas, e aceitáveis para
 * o que ele protege:
 *  - reiniciar a API zera os contadores;
 *  - com mais de uma instância no ar, cada uma conta o seu.
 * Quando a API escalar, este arquivo é o único ponto a trocar por um store
 * compartilhado.
 */
@Injectable()
export class RateLimitStore {
  private readonly buckets = new Map<string, Bucket>();
  private lastSweep = 0;

  /** Registra uma ocorrência e devolve o estado do balde depois dela. */
  hit(key: string, windowMs: number): Bucket {
    const now = Date.now();
    this.sweep(now);

    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      const fresh: Bucket = { count: 1, resetAt: now + windowMs };
      this.buckets.set(key, fresh);
      return fresh;
    }

    current.count += 1;
    return current;
  }

  /** Lê o balde sem contar uma nova ocorrência. */
  peek(key: string): Bucket | null {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= Date.now()) return null;
    return bucket;
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  /** Zera todos os baldes. Usado entre casos de teste. */
  clearAll(): void {
    this.buckets.clear();
  }

  /** Descarta baldes vencidos, no máximo uma vez por minuto. */
  private sweep(now: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

/** Espera restante em português, para a mensagem que o corretor lê. */
export function formatWait(seconds: number): string {
  if (seconds <= 60) return "alguns segundos";
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "1 minuto" : `${minutes} minutos`;
}
