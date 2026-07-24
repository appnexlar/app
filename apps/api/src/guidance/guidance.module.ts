import { Global, Module } from "@nestjs/common";
import { ProductEventService } from "./product-event.service";
import { GuidanceEngine } from "./guidance-engine";
import { GuidanceContextBuilder } from "./guidance-context.builder";
import { GuidanceService } from "./guidance.service";
import { GuidanceController } from "./guidance.controller";
import { HelpContentService } from "./help-content";

/**
 * Jornada 2 — camada transversal de experiência guiada.
 *
 * É @Global porque a emissão de eventos (ProductEventService) precisa estar ao
 * alcance de qualquer módulo (leads, properties, sharing...) sem import
 * explícito. O motor, o contexto e o serviço vivem aqui e servem o controller
 * /guidance. O engine é puro e o contexto é a única peça que fala com o banco
 * de leitura, mantendo a regra testável isoladamente.
 */
@Global()
@Module({
  controllers: [GuidanceController],
  providers: [
    ProductEventService,
    GuidanceEngine,
    GuidanceContextBuilder,
    GuidanceService,
    HelpContentService,
  ],
  exports: [ProductEventService, GuidanceService],
})
export class GuidanceModule {}
