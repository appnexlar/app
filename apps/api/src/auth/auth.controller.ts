import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  registerWithGoogleSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  type AuthResponse,
  type ForgotPasswordDto,
  type GooglePendingSignup,
  type LoginDto,
  type RegisterDto,
  type RegisterWithGoogleDto,
  type ResendVerificationDto,
  type ResetPasswordDto,
  type VerifyEmailDto,
} from "@nexlar/shared";
import { Public } from "../common/decorators/public.decorator";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthService, type SessionResult } from "./auth.service";
import { SessionCookie } from "./session-cookie";
import { GoogleAuthError, GoogleOAuthService } from "./google-oauth.service";
import { OAuthCookies } from "./oauth-cookies";

const MINUTO = 60_000;

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookie: SessionCookie,
    private readonly google: GoogleOAuthService,
    private readonly oauth: OAuthCookies,
    private readonly config: ConfigService,
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

  // --- Entrar com o Google --------------------------------------------------

  /**
   * Começa o fluxo: abre um pedido (state e nonce no cookie) e manda o
   * navegador para o Google. É GET porque quem chama é uma navegação de topo,
   * não uma chamada de JavaScript.
   */
  @Public()
  @RateLimit({ name: "google-start", limit: 20, windowMs: 15 * MINUTO })
  @Get("google")
  @ApiOperation({ summary: "Redireciona para o consentimento do Google" })
  iniciarGoogle(@Res() reply: FastifyReply): void {
    if (!this.google.enabled) throw new NotFoundException();
    const pedido = this.oauth.abrirPedido(reply);
    reply.redirect(302, this.google.authorizationUrl(pedido));
  }

  /**
   * Volta do Google. Nunca responde com corpo: sempre redireciona para uma
   * tela do app, com ou sem sessão. Erro vira um código curto na URL, porque
   * detalhe de falha de autenticação é informação de quem ataca.
   */
  @Public()
  @RateLimit({ name: "google-callback", limit: 20, windowMs: 15 * MINUTO })
  @Get("google/callback")
  @ApiOperation({ summary: "Recebe o retorno do Google e abre a sessão" })
  async retornoGoogle(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    if (!this.google.enabled) throw new NotFoundException();

    const query = request.query as Record<string, unknown>;
    const pedido = this.oauth.lerPedido(request);
    // Uso único: o pedido morre aqui, dê certo ou errado. Sem isso um mesmo
    // state serviria para mais de um retorno.
    this.oauth.fecharPedido(reply);

    // Quem clicou em "cancelar" na tela do Google não é erro: volta em paz.
    if (typeof query.error === "string") {
      return this.voltarParaOApp(reply, "/login?erro=cancelado");
    }

    const code = typeof query.code === "string" ? query.code : "";
    const state = typeof query.state === "string" ? query.state : "";
    if (!code || !pedido || state !== pedido.state) {
      return this.voltarParaOApp(reply, "/login?erro=google");
    }

    try {
      const identidade = await this.google.identify(code, pedido.nonce);
      const resultado = await this.auth.googleSignIn(identidade);

      if (resultado.tipo === "sessao") {
        this.cookie.set(reply, resultado.sessao.tokens.refreshToken);
        this.oauth.limparCadastro(reply);
        return this.voltarParaOApp(reply, "/dashboard");
      }

      this.oauth.guardarCadastro(reply, resultado.convite);
      return this.voltarParaOApp(reply, "/criar-conta");
    } catch (erro) {
      return this.voltarParaOApp(reply, `/login?erro=${this.codigoDeErro(erro)}`);
    }
  }

  /** Identidade do cadastro em aberto, para a tela dizer quem está entrando. */
  @Public()
  @Get("google/pending")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Nome e e-mail do cadastro pelo Google em aberto" })
  googlePending(@Req() request: FastifyRequest): Promise<GooglePendingSignup> {
    return this.auth.googlePendingSignup(this.oauth.lerCadastro(request));
  }

  /**
   * Conclui o cadastro pelo Google. O corpo traz só o que o Google não sabe:
   * a identidade vem do convite assinado no cookie.
   */
  @Public()
  @RateLimit({ name: "register-google", limit: 10, windowMs: 60 * MINUTO })
  @Post("register/google")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Cria a conta a partir do cadastro pelo Google" })
  async registerWithGoogle(
    @Body(new ZodValidationPipe(registerWithGoogleSchema)) dto: RegisterWithGoogleDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResponse> {
    const sessao = await this.auth.registerWithGoogle(this.oauth.lerCadastro(request), dto);
    // O convite cumpriu o papel e não pode ser reaproveitado.
    this.oauth.limparCadastro(reply);
    return this.responder(reply, sessao);
  }

  /** Só caminhos internos: destino nunca vem do que o cliente mandou. */
  private voltarParaOApp(reply: FastifyReply, caminho: string): void {
    const base = this.config.get<string>("WEB_APP_URL", "http://localhost:5173");
    reply.redirect(302, `${base.replace(/\/$/, "")}${caminho}`);
  }

  /** Traduz a falha num código curto. O detalhe fica no servidor. */
  private codigoDeErro(erro: unknown): string {
    if (erro instanceof GoogleAuthError && erro.motivo === "email_nao_verificado") {
      return "google_email";
    }
    if (erro instanceof ForbiddenException) return "suspensa";
    return "google";
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
