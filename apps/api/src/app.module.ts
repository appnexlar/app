import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { validateEnv } from "./config/env";
import { PrismaModule } from "./prisma/prisma.module";
import { StorageModule } from "./storage/storage.module";
import { EmailModule } from "./email/email.module";
import { AuthModule } from "./auth/auth.module";
import { BrokersModule } from "./brokers/brokers.module";
import { LeadsModule } from "./leads/leads.module";
import { ClientsModule } from "./clients/clients.module";
import { AgendaModule } from "./agenda/agenda.module";
import { PropertiesModule } from "./properties/properties.module";
import { SharingModule } from "./sharing/sharing.module";
import { FinancingModule } from "./financing/financing.module";
import { PublicPageModule } from "./public-page/public-page.module";
import { GuidanceModule } from "./guidance/guidance.module";
import { NotificationModule } from "./notification/notification.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { HealthController } from "./health/health.controller";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RateLimitGuard } from "./common/rate-limit/rate-limit.guard";
import { RateLimitModule } from "./common/rate-limit/rate-limit.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    JwtModule.register({ global: true }),
    PrismaModule,
    RateLimitModule,
    GuidanceModule,
    NotificationModule,
    StorageModule,
    EmailModule,
    AuthModule,
    BrokersModule,
    LeadsModule,
    ClientsModule,
    AgendaModule,
    PropertiesModule,
    SharingModule,
    FinancingModule,
    PublicPageModule,
    DashboardModule,
  ],
  controllers: [HealthController],
  providers: [
    // O limite de tentativas vem antes da autenticação: quem está de castigo
    // não deve nem chegar a ter a senha conferida.
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
