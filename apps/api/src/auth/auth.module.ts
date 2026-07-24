import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { TokenService } from "./token.service";
import { LoginAttemptService } from "./login-attempt.service";
import { SessionCookie } from "./session-cookie";

@Module({
  controllers: [AuthController],
  providers: [AuthService, TokenService, LoginAttemptService, SessionCookie],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
