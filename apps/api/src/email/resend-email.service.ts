import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
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

/** Qual e-mail seria enviado. Vai gravado na falha, para a equipe saber o que parou. */
type EmailKind = "confirmacao" | "recuperacao_senha" | "boas_vindas" | "codigo_financiamento";

/**
 * Envio pelo Resend, via HTTP puro: a API é um POST com JSON, então o SDK
 * seria uma dependência a mais para não ganhar nada.
 *
 * Falha de envio nunca derruba a operação que pediu o e-mail. Recuperação de
 * senha responde 204 exista ou não a conta, e não pode passar a responder 500
 * quando o provedor cai, senão a resposta deixa de ser neutra e vira um jeito
 * de descobrir quem tem cadastro.
 *
 * Como quem pediu o e-mail nunca fica sabendo que ele não saiu, a falha é
 * gravada em email_delivery_failure e vira alerta no painel administrativo.
 * Log e endereço mascarado continuam valendo: nem o log nem o registro
 * guardam o e-mail inteiro de ninguém.
 */
@Injectable()
export class ResendEmailService extends EmailService {
  private readonly logger = new Logger("EmailService");
  private readonly apiKey: string;
  private readonly from: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super();
    this.apiKey = this.config.getOrThrow<string>("RESEND_API_KEY");
    this.from = this.config.get<string>("EMAIL_FROM", "Nextlar <onboarding@resend.dev>");
  }

  async sendEmailVerification({ to, fullName, verifyUrl }: EmailVerificationEmail): Promise<void> {
    await this.send(to, emailVerificationTemplate(fullName, verifyUrl), "confirmacao");
  }

  async sendPasswordReset({ to, fullName, resetUrl }: PasswordResetEmail): Promise<void> {
    await this.send(to, passwordResetTemplate(fullName, resetUrl), "recuperacao_senha");
  }

  async sendWelcome({ to, fullName }: WelcomeEmail): Promise<void> {
    const appUrl = this.config.get<string>("WEB_APP_URL", "http://localhost:5173");
    await this.send(to, welcomeTemplate(fullName, appUrl), "boas_vindas");
  }

  async sendFinancingAccessCode({ to, firstName, brokerName, code }: FinancingAccessCodeEmail): Promise<void> {
    await this.send(to, financingAccessCodeTemplate(firstName, brokerName, code), "codigo_financiamento");
  }

  private async send(to: string, mensagem: Mensagem, kind: EmailKind): Promise<void> {
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
        const motivo = `${response.status} ${detalhe.slice(0, 200)}`;
        this.logger.error(`Resend recusou o envio para ${mascarar(to)}: ${motivo}`);
        await this.registrarFalha(kind, to, motivo);
        return;
      }

      this.logger.log(`E-mail "${mensagem.subject}" enviado para ${mascarar(to)}`);
    } catch (error) {
      const motivo = error instanceof Error ? error.message : String(error);
      this.logger.error(`Falha ao falar com o Resend para ${mascarar(to)}: ${motivo}`);
      await this.registrarFalha(kind, to, motivo);
    }
  }

  /**
   * Deixa a falha visível para a equipe. Antes disto ela só existia no log, e
   * o log ninguém lê: quem pediu recuperação de senha ficava esperando um link
   * que nunca ia chegar, e o painel administrativo não tinha como saber.
   *
   * Gravar não pode derrubar nada: se o banco também estiver fora, o envio já
   * falhou e insistir no registro só trocaria um problema por outro pior.
   */
  private async registrarFalha(kind: EmailKind, to: string, motivo: string): Promise<void> {
    try {
      await this.prisma.emailDeliveryFailure.create({
        data: { kind, recipient: mascarar(to), reason: motivo.slice(0, 300) },
      });
    } catch (error) {
      this.logger.error(
        `Não foi possível registrar a falha de envio: ${
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
