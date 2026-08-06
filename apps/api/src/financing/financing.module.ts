import { Module } from "@nestjs/common";
import { GuidanceModule } from "../guidance/guidance.module";
import { EmailModule } from "../email/email.module";
import { NotificationModule } from "../notification/notification.module";
import { FinancingController } from "./financing.controller";
import { FinancingPublicController } from "./financing-public.controller";
import { FinancingPublicService } from "./financing-public.service";
import { FinancingRequestsService } from "./financing-requests.service";

/**
 * Coleta de dados para simulação de financiamento (docs/09).
 * Lado do corretor: solicitação e transições (Fatia A/B).
 * Lado do cliente: link público, código por e-mail, sessão e autosave (Fatia C).
 */
@Module({
  imports: [GuidanceModule, EmailModule, NotificationModule],
  controllers: [FinancingController, FinancingPublicController],
  providers: [FinancingRequestsService, FinancingPublicService],
  exports: [FinancingRequestsService],
})
export class FinancingModule {}
