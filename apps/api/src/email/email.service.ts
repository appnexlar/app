import { Injectable, Logger } from "@nestjs/common";

export interface PasswordResetEmail {
  to: string;
  fullName: string;
  resetUrl: string;
}

export interface WelcomeEmail {
  to: string;
  fullName: string;
}

/**
 * Contrato de envio de e-mail. No MVP só dois e-mails transacionais
 * (boas-vindas e recuperação de senha). Trocável por Resend/SES depois.
 */
export abstract class EmailService {
  abstract sendPasswordReset(email: PasswordResetEmail): Promise<void>;
  abstract sendWelcome(email: WelcomeEmail): Promise<void>;
}

/** Implementação de desenvolvimento: registra no log em vez de enviar. */
@Injectable()
export class ConsoleEmailService extends EmailService {
  private readonly logger = new Logger("EmailService");

  async sendPasswordReset({ to, fullName, resetUrl }: PasswordResetEmail): Promise<void> {
    this.logger.log(
      `[recuperação de senha] Para: ${to} (${fullName})\n  Link de redefinição: ${resetUrl}`,
    );
  }

  async sendWelcome({ to, fullName }: WelcomeEmail): Promise<void> {
    this.logger.log(`[boas-vindas] Para: ${to} (${fullName})`);
  }
}
