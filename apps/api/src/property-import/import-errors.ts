import { BadRequestException } from "@nestjs/common";

/** Códigos internos gravados em property_import.error quando a importação falha. */
export const IMPORT_ERROR_CODES = [
  "url_invalida",
  "url_bloqueada",
  "inacessivel",
  "nao_html",
  "muito_grande",
  "sem_dados",
  "limite",
] as const;
export type ImportErrorCode = (typeof IMPORT_ERROR_CODES)[number];

/**
 * Falha esperada da importação: vira 400 com a mensagem que o corretor lê,
 * e o `code` vai para a trilha de auditoria. Nunca carrega detalhe técnico
 * na mensagem (o detalhe fica no log do servidor).
 */
export class ImportFailedError extends BadRequestException {
  constructor(
    readonly code: ImportErrorCode,
    message: string,
  ) {
    super(message);
  }
}
