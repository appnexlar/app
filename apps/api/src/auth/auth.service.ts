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
  GooglePendingSignup,
  LoginDto,
  RegisterDto,
  RegisterWithGoogleDto,
  ResendVerificationDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from "@nexlar/shared";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { RefreshTokenError, TokenService } from "./token.service";
import type { GoogleIdentity } from "./google-oauth.service";
import { LoginAttemptService } from "./login-attempt.service";
import { CODIGO_CONTA_SUSPENSA } from "../common/guards/jwt-auth.guard";

/**
 * Resultado interno da autenticação. Diferente do AuthResponse público, ele
 * carrega o refresh token, porque o controller precisa dele para gravar o
 * cookie. Ele para ali e nunca chega ao corpo da resposta.
 */
export interface SessionResult {
  broker: BrokerProfile;
  tokens: { accessToken: string; refreshToken: string; expiresIn: number };
}

/**
 * Desfecho da volta do Google. "sessao" é quem já tem conta; "cadastro" é
 * quem ainda não tem e precisa aceitar os Termos e completar o perfil.
 */
export type GoogleSignInResult =
  | { tipo: "sessao"; sessao: SessionResult }
  | { tipo: "cadastro"; convite: string };

/** Convite vencido, usado duas vezes ou adulterado: tudo responde igual. */
export const CONVITE_GOOGLE_EXPIRADO =
  "Seu cadastro pelo Google expirou. Comece de novo para continuar.";

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
  async register(dto: RegisterDto): Promise<SessionResult> {
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

  // --- Entrar com o Google --------------------------------------------------

  /**
   * O que fazer com quem acabou de voltar do Google. Três caminhos:
   *
   *  - já tem conta vinculada: entra;
   *  - tem conta de senha com o mesmo e-mail: vincula e entra (só porque o
   *    Google afirmou que o e-mail é verificado; quem garante isso é o
   *    GoogleOAuthService, e sem essa garantia o vínculo seria um sequestro de
   *    conta com passo único);
   *  - não tem conta: nada é criado ainda. Volta um convite assinado, porque
   *    faltam o aceite dos Termos e o perfil, e conta sem aceite é problema de
   *    LGPD, não detalhe de formulário.
   */
  async googleSignIn(identity: GoogleIdentity): Promise<GoogleSignInResult> {
    const porGoogleId = await this.prisma.broker.findUnique({
      where: { googleId: identity.googleId },
    });
    if (porGoogleId) {
      assertNaoSuspensa(porGoogleId);
      return { tipo: "sessao", sessao: await this.buildSession(porGoogleId) };
    }

    const porEmail = await this.prisma.broker.findUnique({ where: { email: identity.email } });
    if (porEmail) {
      assertNaoSuspensa(porEmail);
      const vinculado = await this.prisma.broker.update({
        where: { id: porEmail.id },
        data: {
          googleId: identity.googleId,
          // Entrar pelo Google prova o mesmo que clicar no nosso link de
          // confirmação: que a pessoa controla a caixa de e-mail.
          emailVerifiedAt: porEmail.emailVerifiedAt ?? new Date(),
        },
      });
      // Vincular um jeito novo de entrar é evento de segurança, e fica gravado.
      await this.prisma.auditLog.create({
        data: {
          brokerId: vinculado.id,
          action: "auth.google.vinculado",
          entityType: "broker",
          entityId: vinculado.id,
          metadata: { tinhaSenha: porEmail.passwordHash !== null },
        },
      });
      return { tipo: "sessao", sessao: await this.buildSession(vinculado) };
    }

    return { tipo: "cadastro", convite: await this.criarConviteGoogle(identity) };
  }

  /** Convite de cadastro: JWT curto, assinado, com um propósito só. */
  private criarConviteGoogle(identity: GoogleIdentity): Promise<string> {
    return this.tokens.signGoogleSignup(identity);
  }

  /** Nome e e-mail do convite em aberto, para a tela de cadastro mostrar. */
  async googlePendingSignup(convite: string | null): Promise<GooglePendingSignup> {
    const identity = await this.tokens.verifyGoogleSignup(convite);
    if (!identity) throw new UnauthorizedException(CONVITE_GOOGLE_EXPIRADO);
    return { fullName: identity.fullName, email: identity.email };
  }

  /**
   * Cria a conta a partir do convite. Sem senha: quem guarda a credencial é o
   * Google. Nome e e-mail saem do convite assinado, nunca do corpo enviado.
   */
  async registerWithGoogle(
    convite: string | null,
    dto: RegisterWithGoogleDto,
  ): Promise<SessionResult> {
    const identity = await this.tokens.verifyGoogleSignup(convite);
    if (!identity) throw new UnauthorizedException(CONVITE_GOOGLE_EXPIRADO);

    // Entre o convite e o envio do formulário alguém pode ter criado a conta
    // por outro caminho. Nesse caso não se cria nada: vincula e entra.
    const existente = await this.prisma.broker.findFirst({
      where: { OR: [{ googleId: identity.googleId }, { email: identity.email }] },
    });
    if (existente) {
      assertNaoSuspensa(existente);
      const atualizado = await this.prisma.broker.update({
        where: { id: existente.id },
        data: {
          googleId: identity.googleId,
          emailVerifiedAt: existente.emailVerifiedAt ?? new Date(),
        },
      });
      return this.buildSession(atualizado);
    }

    const broker = await this.prisma.broker.create({
      data: {
        fullName: identity.fullName,
        email: identity.email,
        googleId: identity.googleId,
        passwordHash: null,
        phone: dto.phone ? dto.phone : null,
        agencyName: dto.agencyName ? dto.agencyName : null,
        // O Google já confirmou o endereço, então a conta nasce pronta e o
        // corretor não passa pelo gate de confirmação por e-mail.
        emailVerifiedAt: new Date(),
        termsAcceptedAt: new Date(),
        termsVersion: TERMS_VERSION,
        marketingOptIn: dto.marketingOptIn ?? false,
      },
    });

    await this.email.sendWelcome({ to: broker.email, fullName: broker.fullName });

    return this.buildSession(broker);
  }

  /** Autentica o corretor por e-mail e senha. */
  async login(dto: LoginDto): Promise<SessionResult> {
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

    // Conta criada pelo Google não tem hash para comparar. Responde igual a
    // senha errada, e não "esta conta é do Google": contar isso transformaria
    // a tela num jeito de descobrir por onde cada pessoa entra. A tela oferece
    // o Google logo acima, e quem quiser senha usa o "esqueci minha senha".
    // O hash descartável entra no lugar do nulo para o tempo de resposta ficar
    // igual: sem isso, uma resposta rápida denunciaria "esta conta é do Google".
    const ok = await argon2
      .verify(broker.passwordHash ?? DUMMY_HASH, dto.password)
      .catch(() => false);
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
  async refresh(refreshToken: string | null): Promise<SessionResult> {
    // Sem cookie não há sessão. É o caso normal de quem nunca entrou, e não
    // um erro: o app usa esta resposta para saber que deve mostrar o login.
    if (!refreshToken) throw new UnauthorizedException(SESSAO_ENCERRADA);

    let rotated: Awaited<ReturnType<TokenService["rotateRefreshToken"]>>;
    try {
      rotated = await this.tokens.rotateRefreshToken(refreshToken);
    } catch (erro) {
      // Corrida entre abas: a outra aba já renovou e este cookie ficou para
      // trás. Não é sessão perdida, então o cliente pode tentar de novo, já
      // com o cookie atualizado. Os demais casos são sessão encerrada mesmo.
      if (erro instanceof RefreshTokenError && erro.motivo === "corrida") {
        throw new ConflictException(RENOVACAO_EM_CURSO);
      }
      throw new UnauthorizedException(SESSAO_ENCERRADA);
    }

    const broker = await this.prisma.broker.findUnique({ where: { id: rotated.brokerId } });
    if (!broker) throw new UnauthorizedException(SESSAO_ENCERRADA);

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
  async logout(refreshToken: string | null): Promise<void> {
    if (!refreshToken) return;
    await this.tokens.revokeRefreshToken(refreshToken);
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

  private async buildSession(broker: Broker): Promise<SessionResult> {
    const tokens = await this.tokens.issueSession(broker.id);
    return { broker: toProfile(broker), tokens };
  }
}

/** Hash descartável para equalizar o tempo de resposta no login inválido. */
const DUMMY_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHR2YWx1ZQ$3S2p1G0m2Yl0vJ0mQ2s4Xh1n8Z0aQ2s4Xh1n8Z0aQ2s";

/** Resposta única para qualquer motivo de sessão inválida: cookie ausente,
 * vencido, desconhecido ou reusado. O cliente não precisa saber qual foi, e
 * detalhar ajudaria quem está sondando. */
export const SESSAO_ENCERRADA = "Sessão expirada. Entre novamente.";

/** Duas abas renovando ao mesmo tempo. Não é sessão perdida: dá para repetir. */
export const RENOVACAO_EM_CURSO = "Renovação em andamento. Tente novamente.";

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
    creciUf: broker.creciUf,
    creciStatus: broker.creciStatus,
    creciRejectionReason: broker.creciRejectionReason,
    agencyName: broker.agencyName,
    avatarUrl: broker.avatarUrl,
    emailVerified: broker.emailVerifiedAt !== null,
    createdAt: broker.createdAt.toISOString(),
    updatedAt: broker.updatedAt.toISOString(),
  };
}
