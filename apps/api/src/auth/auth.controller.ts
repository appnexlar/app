import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  loginSchema,
  refreshSchema,
  registerSchema,
  type AuthResponse,
  type LoginDto,
  type RefreshDto,
  type RegisterDto,
} from "@nexlar/shared";
import { Public } from "../common/decorators/public.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthService } from "./auth.service";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Cria a conta do corretor e devolve a sessão" })
  register(
    @Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto,
  ): Promise<AuthResponse> {
    return this.auth.register(dto);
  }

  @Public()
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
}
