import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { validateEnv } from "./config/env";
import { PrismaModule } from "./prisma/prisma.module";
import { EmailModule } from "./email/email.module";
import { AuthModule } from "./auth/auth.module";
import { LeadsModule } from "./leads/leads.module";
import { ClientsModule } from "./clients/clients.module";
import { AgendaModule } from "./agenda/agenda.module";
import { PropertiesModule } from "./properties/properties.module";
import { SharingModule } from "./sharing/sharing.module";
import { HealthController } from "./health/health.controller";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    JwtModule.register({ global: true }),
    PrismaModule,
    EmailModule,
    AuthModule,
    LeadsModule,
    ClientsModule,
    AgendaModule,
    PropertiesModule,
    SharingModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
