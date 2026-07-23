import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import type { Broker } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { TERMS_VERSION } from "@nexlar/shared";
import type {
  AuthResponse,
  BrokerProfile,
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResendVerificationDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from "@nexlar/shared";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { TokenService } from "./token.service";
import { LoginAttemptService } from "./login-attempt.service";
import { CODIGO_CONTA_SUSPENSA } from "../common/guards/jwt-auth.guard";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly email: EmailService,
    private readonly attempts: LoginAttemptService,
    private readonly config: ConfigService,
  ) {}

  /** Cria a conta do corretor e já devolve a sessão. */
  async register(dto: RegisterDto): Promise<AuthResponse> {
    const passwordHash = await this.hash(dto.password);

    let broker: Broker;
    try {
      broker = await this.prisma.broker.create({
        data: {
          fullName: dto.fullName,
          email: dto.email,
          passwordHash,
          phone: dto.phone ? dto.phone : null,
          agencyName: dto.agencyName ? dto.agencyName : null,
          // Prova do aceite: o schema já garante que dto.acceptTerms é true.
          termsAcceptedAt: new Date(),
          termsVersion: TERMS_VERSION,
          marketingOptIn: dto.marketingOptIn ?? false,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Já existe uma conta com esse e-mail.");
      }
      throw error;
    }

    await this.enviarConfirmacao(broker);

    return this.buildSession(broker);
  }

  /** Autentica o corretor por e-mail e senha. */
  async login(dto: LoginDto): Promise<AuthResponse> {
    // Conta em espera nem chega no banco.
    this.attempts.assertNotBlocked(dto.email);

    const broker = await this.prisma.broker.findUnique({
      where: { email: dto.email },
    });

    // Mesma resposta para e-mail inexistente e senha errada (não revela qual).
    const invalid = new UnauthorizedException("E-mail ou senha incorretos.");
    if (!broker) {
      // Verifica um hash fixo mesmo assim, para não vazar tempo de resposta.
      await argon2.verify(DUMMY_HASH, dto.password).catch(() => false);
      this.attempts.registerFailure(dto.email);
      throw invalid;
    }

    const ok = await argon2.verify(broker.passwordHash, dto.password).catch(() => false);
    if (!ok) {
      this.attempts.registerFailure(dto.email);
      throw invalid;
    }

    this.attempts.clear(dto.email);

    // A senha estava certa: o contador zera antes de qualquer outra recusa,
    // senão uma conta suspensa acumularia "falhas" que não são de senha.
    assertNaoSuspensa(broker);

    return this.buildSession(broker);
  }

  /**
   * Renova a sessão sem pedir a senha de novo: valida o refresh token,
   * rotaciona (o antigo é revogado) e devolve um novo par de tokens.
   */
  async refresh(dto: RefreshDto): Promise<AuthResponse> {
    let rotated: Awaited<ReturnType<TokenService["rotateRefreshToken"]>>;
    try {
      rotated = await this.tokens.rotateRefreshToken(dto.refreshToken);
    } catch {
      throw new UnauthorizedException("Sessão expirada. Entre novamente.");
    }

    const broker = await this.prisma.broker.findUnique({ where: { id: rotated.brokerId } });
    if (!broker) throw new UnauthorizedException("Sessão expirada. Entre novamente.");

    // Suspender uma conta tem que valer também para quem já estava dentro:
    // a renovação é o ponto por onde toda sessão passa.
    assertNaoSuspensa(broker);

    const { brokerId: _brokerId, ...tokens } = rotated;
    return { broker: toProfile(broker), tokens };
  }

  /**
   * Encerra a sessão de verdade: revoga o refresh token no servidor, para que
   * sair do app num aparelho emprestado realmente tire o acesso. Sem isso o
   * token continuaria válido até vencer. Silencioso de propósito: token já
   * revogado, vencido ou inventado responde igual, sem confirmar nada.
   */
  async logout(dto: RefreshDto): Promise<void> {
    await this.tokens.revokeRefreshToken(dto.refreshToken);
  }

  /**
   * Envia o link de redefinição. Responde sempre igual, exista ou não a conta,
   * para a tela não virar um jeito de descobrir quem tem cadastro.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const broker = await this.prisma.broker.findUnique({ where: { email: dto.email } });
    if (!broker) return;

    const token = await this.tokens.createPasswordResetToken(broker.id);
    const baseUrl = this.config.get<string>("WEB_APP_URL", "http://localhost:5173");
    const resetUrl = `${baseUrl.replace(/\/$/, "")}/redefinir-senha?token=${encodeURIComponent(token)}`;

    await this.email.sendPasswordReset({
      to: broker.email,
      fullName: broker.fullName,
      resetUrl,
    });
  }

  /**
   * Troca a senha pelo link recebido por e-mail. O token é de uso único e, ao
   * ser consumido, todas as sessões abertas caem: se alguém tinha entrado na
   * conta, redefinir a senha é o que expulsa essa pessoa.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const brokerId = await this.tokens.consumePasswordResetToken(dto.token);
    if (!brokerId) {
      throw new BadRequestException(
        "Este link de redefinição expirou ou já foi usado. Peça um novo para continuar.",
      );
    }

    const passwordHash = await this.hash(dto.password);
    const broker = await this.prisma.broker.update({
      where: { id: brokerId },
      data: { passwordHash },
    });

    await this.tokens.revokeAllSessions(brokerId);
    this.attempts.clear(broker.email);
  }

  /**
   * Confirma o e-mail pelo link recebido. Público e sem sessão: a pessoa pode
   * abrir o link no celular, num navegador onde nunca entrou.
   */
  async verifyEmail(dto: VerifyEmailDto): Promise<void> {
    const brokerId = await this.tokens.consumeEmailVerificationToken(dto.token);
    if (!brokerId) {
      throw new BadRequestException(
        "Este link de confirmação expirou ou já foi usado. Peça um novo na tela de confirmação.",
      );
    }

    const broker = await this.prisma.broker.update({
      where: { id: brokerId },
      data: { emailVerifiedAt: new Date() },
    });

    // Boas-vindas só agora, quando a conta está de fato pronta para usar.
    await this.email.sendWelcome({ to: broker.email, fullName: broker.fullName });
  }

  /**
   * Reenvia o link de confirmação. Resposta sempre igual: conta inexistente e
   * conta já confirmada respondem o mesmo que uma conta pendente, senão a tela
   * viraria um jeito de descobrir quem tem cadastro e em que estado.
   */
  async resendVerification(dto: ResendVerificationDto): Promise<void> {
    const broker = await this.prisma.broker.findUnique({ where: { email: dto.email } });
    if (!broker || broker.emailVerifiedAt || broker.status === "suspenso") return;

    await this.enviarConfirmacao(broker);
  }

  /** Invalida links antigos e manda um novo. */
  private async enviarConfirmacao(broker: Broker): Promise<void> {
    await this.tokens.revokeEmailVerificationTokens(broker.id);
    const token = await this.tokens.createEmailVerificationToken(broker.id);
    const verifyUrl = `${this.appUrl()}/confirmar-email?token=${encodeURIComponent(token)}`;

    await this.email.sendEmailVerification({
      to: broker.email,
      fullName: broker.fullName,
      verifyUrl,
    });
  }

  private appUrl(): string {
    return this.config
      .get<string>("WEB_APP_URL", "http://localhost:5173")
      .replace(/\/$/, "");
  }

  private hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  private async buildSession(broker: Broker): Promise<AuthResponse> {
    const tokens = await this.tokens.issueSession(broker.id);
    return { broker: toProfile(broker), tokens };
  }
}

/** Hash descartável para equalizar o tempo de resposta no login inválido. */
const DUMMY_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHR2YWx1ZQ$3S2p1G0m2Yl0vJ0mQ2s4Xh1n8Z0aQ2s4Xh1n8Z0aQ2s";

/** Mensagem única de conta suspensa, usada no login e na renovação. */
export const CONTA_SUSPENSA =
  "Esta conta está suspensa. Fale com o suporte do Nexlar para reativar.";

/**
 * Barra a conta suspensa. Não conta o motivo guardado no banco: ele é registro
 * interno, e devolver isso ao cliente entregaria informação que não é dele.
 */
function assertNaoSuspensa(broker: Broker): void {
  if (broker.status !== "suspenso") return;
  throw new ForbiddenException({
    message: CONTA_SUSPENSA,
    details: { code: CODIGO_CONTA_SUSPENSA },
  });
}

/** Converte a entidade do banco no perfil público compartilhado com o front. */
function toProfile(broker: Broker): BrokerProfile {
  return {
    id: broker.id,
    fullName: broker.fullName,
    email: broker.email,
    phone: broker.phone,
    creci: broker.creci,
    agencyName: broker.agencyName,
    avatarUrl: broker.avatarUrl,
    emailVerified: broker.emailVerifiedAt !== null,
    createdAt: broker.createdAt.toISOString(),
    updatedAt: broker.updatedAt.toISOString(),
  };
}
