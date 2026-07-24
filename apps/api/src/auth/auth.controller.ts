import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  type AuthResponse,
  type ForgotPasswordDto,
  type LoginDto,
  type RegisterDto,
  type ResendVerificationDto,
  type ResetPasswordDto,
  type VerifyEmailDto,
} from "@nexlar/shared";
import { Public } from "../common/decorators/public.decorator";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthService, type SessionResult } from "./auth.service";
import { SessionCookie } from "./session-cookie";

const MINUTO = 60_000;

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookie: SessionCookie,
  ) {}

  /**
   * Grava o refresh token no cookie e devolve ao cliente só o que ele pode ver.
   * O refresh token nunca aparece no corpo da resposta: se aparecesse, o
   * JavaScript voltaria a ter acesso a ele e o cookie httpOnly perderia a graça.
   */
  private responder(reply: FastifyReply, resultado: SessionResult): AuthResponse {
    this.cookie.set(reply, resultado.tokens.refreshToken);
    return {
      broker: resultado.broker,
      tokens: {
        accessToken: resultado.tokens.accessToken,
        expiresIn: resultado.tokens.expiresIn,
      },
    };
  }

  @Public()
  @RateLimit({ name: "register", limit: 10, windowMs: 60 * MINUTO })
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Cria a conta do corretor e devolve a sessão" })
  async register(
    @Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResponse> {
    return this.responder(reply, await this.auth.register(dto));
  }

  // Teto largo por IP: a trava de verdade do login é por conta, no
  // LoginAttemptService. Aqui só se corta o volume de automação, sem prender
  // um escritório inteiro que sai pelo mesmo IP.
  @Public()
  @RateLimit({ name: "login", limit: 30, windowMs: 15 * MINUTO })
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Autentica o corretor por e-mail e senha" })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResponse> {
    return this.responder(reply, await this.auth.login(dto));
  }

  /**
   * Renova a sessão a partir do cookie. É também o que restaura a sessão quando
   * o app abre: o access token vive só em memória e morre a cada recarga, então
   * é esta rota que diz se ainda existe alguém logado.
   */
  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Renova a sessão a partir do cookie (com rotação)" })
  async refresh(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResponse> {
    const atual = this.cookie.read(request);
    const resultado = await this.auth.refresh(atual);
    return this.responder(reply, resultado);
  }

  /**
   * Encerra a sessão: revoga o token no servidor e apaga o cookie. Sem corpo,
   * porque o cliente não conhece o valor do token.
   */
  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Encerra a sessão e limpa o cookie" })
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.auth.logout(this.cookie.read(request));
    // Limpa o cookie mesmo quando não havia sessão: sair é sempre idempotente.
    this.cookie.clear(reply);
  }

  @Public()
  @RateLimit({ name: "verify-email", limit: 10, windowMs: 15 * MINUTO })
  @Post("verify-email")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Confirma o e-mail com o token recebido" })
  verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailSchema)) dto: VerifyEmailDto,
  ): Promise<void> {
    return this.auth.verifyEmail(dto);
  }

  // Mais apertado que os outros: é o único que dispara e-mail para um endereço
  // escolhido por quem chama, então serviria de máquina de incomodar alguém.
  @Public()
  @RateLimit({ name: "resend-verification", limit: 3, windowMs: 60 * MINUTO })
  @Post("resend-verification")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Reenvia o link de confirmação de e-mail" })
  resendVerification(
    @Body(new ZodValidationPipe(resendVerificationSchema)) dto: ResendVerificationDto,
  ): Promise<void> {
    return this.auth.resendVerification(dto);
  }

  @Public()
  @RateLimit({ name: "forgot-password", limit: 5, windowMs: 60 * MINUTO })
  @Post("forgot-password")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Envia o link de redefinição de senha" })
  forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) dto: ForgotPasswordDto,
  ): Promise<void> {
    return this.auth.forgotPassword(dto);
  }

  /**
   * Redefinir a senha derruba todas as sessões, inclusive a deste navegador,
   * então o cookie sai junto: seria confuso continuar "logado" com uma sessão
   * que o servidor acabou de invalidar.
   */
  @Public()
  @RateLimit({ name: "reset-password", limit: 10, windowMs: 15 * MINUTO })
  @Post("reset-password")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Redefine a senha com o token recebido por e-mail" })
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) dto: ResetPasswordDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.auth.resetPassword(dto);
    this.cookie.clear(reply);
  }
}
