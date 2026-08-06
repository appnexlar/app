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

export interface EmailVerificationEmail {
  to: string;
  fullName: string;
  verifyUrl: string;
}

export interface FinancingAccessCodeEmail {
  to: string;
  firstName: string;
  brokerName: string;
  /** Código de 6 dígitos, em claro só aqui e no e-mail. */
  code: string;
}

/**
 * Contrato de envio de e-mail. Três transacionais: confirmação de cadastro,
 * boas-vindas (depois de confirmado) e recuperação de senha.
 */
export abstract class EmailService {
  abstract sendEmailVerification(email: EmailVerificationEmail): Promise<void>;
  abstract sendPasswordReset(email: PasswordResetEmail): Promise<void>;
  abstract sendWelcome(email: WelcomeEmail): Promise<void>;
  abstract sendFinancingAccessCode(email: FinancingAccessCodeEmail): Promise<void>;
}

/** Implementação de desenvolvimento: registra no log em vez de enviar. */
@Injectable()
export class ConsoleEmailService extends EmailService {
  private readonly logger = new Logger("EmailService");

  async sendEmailVerification({ to, fullName, verifyUrl }: EmailVerificationEmail): Promise<void> {
    this.logger.log(
      `[confirmação de e-mail] Para: ${to} (${fullName})\n  Link de confirmação: ${verifyUrl}`,
    );
  }

  async sendPasswordReset({ to, fullName, resetUrl }: PasswordResetEmail): Promise<void> {
    this.logger.log(
      `[recuperação de senha] Para: ${to} (${fullName})\n  Link de redefinição: ${resetUrl}`,
    );
  }

  async sendWelcome({ to, fullName }: WelcomeEmail): Promise<void> {
    this.logger.log(`[boas-vindas] Para: ${to} (${fullName})`);
  }

  async sendFinancingAccessCode({ to, firstName, code }: FinancingAccessCodeEmail): Promise<void> {
    this.logger.log(`[código de acesso do financiamento] Para: ${to} (${firstName})\n  Código: ${code}`);
  }
}
