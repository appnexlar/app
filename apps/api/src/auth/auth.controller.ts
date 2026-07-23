import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  type AuthResponse,
  type ForgotPasswordDto,
  type LoginDto,
  type RefreshDto,
  type RegisterDto,
  type ResendVerificationDto,
  type ResetPasswordDto,
  type VerifyEmailDto,
} from "@nexlar/shared";
import { Public } from "../common/decorators/public.decorator";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthService } from "./auth.service";

const MINUTO = 60_000;

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @RateLimit({ name: "register", limit: 10, windowMs: 60 * MINUTO })
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Cria a conta do corretor e devolve a sessão" })
  register(
    @Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto,
  ): Promise<AuthResponse> {
    return this.auth.register(dto);
  }

  // Teto largo por IP: a trava de verdade do login é por conta, no
  // LoginAttemptService. Aqui só se corta o volume de automação, sem prender
  // um escritório inteiro que sai pelo mesmo IP.
  @Public()
  @RateLimit({ name: "login", limit: 30, windowMs: 15 * MINUTO })
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Autentica o corretor por e-mail e senha" })
  login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
  ): Promise<AuthResponse> {
    return this.auth.login(dto);
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Renova a sessão com o refresh token (rotação)" })
  refresh(
    @Body(new ZodValidationPipe(refreshSchema)) dto: RefreshDto,
  ): Promise<AuthResponse> {
    return this.auth.refresh(dto);
  }

  // Pública porque o access token pode já ter vencido quando a pessoa sai.
  // Quem manda o refresh token já o tem em mãos: revogá-lo não expõe nada.
  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Encerra a sessão revogando o refresh token" })
  logout(
    @Body(new ZodValidationPipe(refreshSchema)) dto: RefreshDto,
  ): Promise<void> {
    return this.auth.logout(dto);
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

  @Public()
  @RateLimit({ name: "reset-password", limit: 10, windowMs: 15 * MINUTO })
  @Post("reset-password")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Redefine a senha com o token recebido por e-mail" })
  resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) dto: ResetPasswordDto,
  ): Promise<void> {
    return this.auth.resetPassword(dto);
  }
}
