import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  EmailService,
  type EmailVerificationEmail,
  type PasswordResetEmail,
  type WelcomeEmail,
  type FinancingAccessCodeEmail,
} from "./email.service";
import {
  emailVerificationTemplate,
  passwordResetTemplate,
  welcomeTemplate,
  financingAccessCodeTemplate,
  type Mensagem,
} from "./templates";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Envio pelo Resend, via HTTP puro: a API é um POST com JSON, então o SDK
 * seria uma dependência a mais para não ganhar nada.
 *
 * Falha de envio nunca derruba a operação que pediu o e-mail. Recuperação de
 * senha responde 204 exista ou não a conta, e não pode passar a responder 500
 * quando o provedor cai, senão a resposta deixa de ser neutra e vira um jeito
 * de descobrir quem tem cadastro. O erro vai para o log, sem o endereço
 * completo de quem receberia.
 */
@Injectable()
export class ResendEmailService extends EmailService {
  private readonly logger = new Logger("EmailService");
  private readonly apiKey: string;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    super();
    this.apiKey = this.config.getOrThrow<string>("RESEND_API_KEY");
    this.from = this.config.get<string>("EMAIL_FROM", "Nexlar <onboarding@resend.dev>");
  }

  async sendEmailVerification({ to, fullName, verifyUrl }: EmailVerificationEmail): Promise<void> {
    await this.send(to, emailVerificationTemplate(fullName, verifyUrl));
  }

  async sendPasswordReset({ to, fullName, resetUrl }: PasswordResetEmail): Promise<void> {
    await this.send(to, passwordResetTemplate(fullName, resetUrl));
  }

  async sendWelcome({ to, fullName }: WelcomeEmail): Promise<void> {
    const appUrl = this.config.get<string>("WEB_APP_URL", "http://localhost:5173");
    await this.send(to, welcomeTemplate(fullName, appUrl));
  }

  async sendFinancingAccessCode({ to, firstName, brokerName, code }: FinancingAccessCodeEmail): Promise<void> {
    await this.send(to, financingAccessCodeTemplate(firstName, brokerName, code));
  }

  private async send(to: string, mensagem: Mensagem): Promise<void> {
    try {
      const response = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.from,
          to: [to],
          subject: mensagem.subject,
          html: mensagem.html,
          text: mensagem.text,
        }),
      });

      if (!response.ok) {
        const detalhe = await response.text().catch(() => "");
        this.logger.error(
          `Resend recusou o envio para ${mascarar(to)}: ${response.status} ${detalhe.slice(0, 200)}`,
        );
        return;
      }

      this.logger.log(`E-mail "${mensagem.subject}" enviado para ${mascarar(to)}`);
    } catch (error) {
      this.logger.error(
        `Falha ao falar com o Resend para ${mascarar(to)}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

/** Log guarda só o suficiente para investigar, não o endereço inteiro. */
function mascarar(email: string): string {
  const [usuario, dominio] = email.split("@");
  if (!dominio) return "***";
  const visivel = usuario.slice(0, 2);
  return `${visivel}${"*".repeat(Math.max(1, usuario.length - 2))}@${dominio}`;
}
