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
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  adminLoginSchema,
  type AdminAuthResponse,
  type AdminLoginDto,
} from "@nexlar/shared";
import { Public } from "../../common/decorators/public.decorator";
import { RateLimit } from "../../common/rate-limit/rate-limit.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { RefreshTokenError } from "../../auth/token.service";
import { GoogleOAuthService } from "../../auth/google-oauth.service";
import { AdminOAuthCookies } from "./admin-oauth-cookies";
import { AdminAuthGuard } from "../rbac/admin-auth.guard";
import { AdminPermissionGuard } from "../rbac/admin-permission.guard";
import { CurrentAdmin, type AuthenticatedAdmin } from "../rbac/current-admin.decorator";
import { AdminAuthService } from "./admin-auth.service";
import { AdminSessionCookie } from "./admin-session-cookie";
import { AdminTokenService } from "./admin-token.service";

const MINUTO = 60 * 1000;

/**
 * Callback do fluxo Google do Admin. O Google exige que autorização e troca
 * de código usem o MESMO redirect_uri, e este caminho precisa estar
 * cadastrado no Google Cloud junto com o do corretor.
 */
const CAMINHO_CALLBACK_ADMIN = "/api/admin/auth/google/callback";

/**
 * Porta de entrada do Nexlar Admin.
 *
 * O @Public() aqui fala com o guard GLOBAL do corretor: estas rotas não são
 * de corretor, então ele não deve tocá-las. Quem manda nelas é o
 * AdminAuthGuard, aplicado rota a rota (login e refresh são as únicas sem
 * ele, porque autenticam por senha e por cookie, respectivamente).
 */
@ApiTags("admin")
@Controller("admin/auth")
@Public()
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly tokens: AdminTokenService,
    private readonly cookie: AdminSessionCookie,
    private readonly config: ConfigService,
    private readonly google: GoogleOAuthService,
    private readonly oauth: AdminOAuthCookies,
  ) {}

  /** Sem JWT_ADMIN_SECRET o Admin não existe: 404, igual ao Google sem chave. */
  private assertEnabled(): void {
    if (!this.config.get<string>("JWT_ADMIN_SECRET", "")) {
      throw new NotFoundException();
    }
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: "admin-login", limit: 10, windowMs: 15 * MINUTO })
  @ApiOperation({ summary: "Autentica um administrador da plataforma" })
  async login(
    @Body(new ZodValidationPipe(adminLoginSchema)) dto: AdminLoginDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AdminAuthResponse> {
    this.assertEnabled();
    const { profile, tokens } = await this.auth.login(dto);
    this.cookie.set(reply, tokens.refreshToken);
    return { admin: profile, accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: "admin-refresh", limit: 60, windowMs: 15 * MINUTO })
  @ApiOperation({ summary: "Renova a sessão administrativa pelo cookie" })
  async refresh(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AdminAuthResponse> {
    this.assertEnabled();
    const raw = this.cookie.read(request);
    if (!raw) throw new UnauthorizedException("Sessão expirada ou inválida");

    try {
      const rotated = await this.tokens.rotate(raw);
      this.cookie.set(reply, rotated.refreshToken);
      const profile = await this.auth.profileOf(rotated.adminId);
      return { admin: profile, accessToken: rotated.accessToken, expiresIn: rotated.expiresIn };
    } catch (erro) {
      // Corrida entre abas não apaga o cookie: a outra aba acabou de trocar
      // e o cliente tenta de novo com o valor novo. Qualquer outro motivo
      // encerra a sessão no navegador também.
      if (!(erro instanceof RefreshTokenError && erro.motivo === "corrida")) {
        this.cookie.clear(reply);
      }
      throw new UnauthorizedException("Sessão expirada ou inválida");
    }
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Encerra a sessão administrativa" })
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    this.assertEnabled();
    const raw = this.cookie.read(request);
    if (raw) await this.tokens.revoke(raw);
    this.cookie.clear(reply);
  }

  /** O front pergunta aqui se mostra o botão do Google. */
  @Get("providers")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Formas de entrada disponíveis no Admin" })
  providers(): { google: boolean } {
    this.assertEnabled();
    return { google: this.google.enabled };
  }

  @Get("google")
  @RateLimit({ name: "admin-google-start", limit: 20, windowMs: 15 * MINUTO })
  @ApiOperation({ summary: "Redireciona para o consentimento do Google" })
  iniciarGoogle(@Res() reply: FastifyReply): void {
    this.assertEnabled();
    if (!this.google.enabled) throw new NotFoundException();
    const pedido = this.oauth.abrirPedido(reply);
    reply.redirect(
      302,
      this.google.authorizationUrl({
        ...pedido,
        redirectUri: this.google.redirectUriPara(CAMINHO_CALLBACK_ADMIN),
      }),
    );
  }

  /**
   * Volta do Google. Sempre redireciona para uma tela do Admin, nunca
   * responde com corpo: o motivo detalhado da falha fica no servidor.
   * "sem_acesso" cobre e-mail desconhecido, conta suspensa e vínculo com
   * outra conta Google, de propósito: quem não entra não aprende o porquê.
   */
  @Get("google/callback")
  @RateLimit({ name: "admin-google-callback", limit: 20, windowMs: 15 * MINUTO })
  @ApiOperation({ summary: "Recebe o retorno do Google e abre a sessão" })
  async retornoGoogle(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    this.assertEnabled();
    if (!this.google.enabled) throw new NotFoundException();

    const query = request.query as Record<string, unknown>;
    const pedido = this.oauth.lerPedido(request);
    // Uso único, dê certo ou errado.
    this.oauth.fecharPedido(reply);

    if (typeof query.error === "string") {
      return this.voltarParaOAdmin(reply, "/admin/login?erro=cancelado");
    }

    const code = typeof query.code === "string" ? query.code : "";
    const state = typeof query.state === "string" ? query.state : "";
    if (!code || !pedido || state !== pedido.state) {
      return this.voltarParaOAdmin(reply, "/admin/login?erro=google");
    }

    try {
      const identidade = await this.google.identify(
        code,
        pedido.nonce,
        this.google.redirectUriPara(CAMINHO_CALLBACK_ADMIN),
      );
      const { adminId } = await this.auth.googleSignIn(identidade);
      const tokens = await this.tokens.issueSession(adminId);
      this.cookie.set(reply, tokens.refreshToken);
      return this.voltarParaOAdmin(reply, "/admin");
    } catch (erro) {
      const codigo = erro instanceof ForbiddenException ? "sem_acesso" : "google";
      return this.voltarParaOAdmin(reply, `/admin/login?erro=${codigo}`);
    }
  }

  /** Só caminhos internos: o destino nunca vem do que o cliente mandou. */
  private voltarParaOAdmin(reply: FastifyReply, caminho: string): void {
    const base = this.config.get<string>("WEB_APP_URL", "http://localhost:5173");
    reply.redirect(302, `${base.replace(/\/$/, "")}${caminho}`);
  }

  @Get("me")
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @ApiOperation({ summary: "Identidade e permissões da sessão atual" })
  async me(@CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.auth.profileOf(admin.adminId);
  }
}
