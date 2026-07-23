import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { TokenService } from "./token.service";
import { LoginAttemptService } from "./login-attempt.service";

@Module({
  controllers: [AuthController],
  providers: [AuthService, TokenService, LoginAttemptService],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
