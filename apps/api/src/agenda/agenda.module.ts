import { Module } from "@nestjs/common";
import { AgendaController } from "./agenda.controller";
import { AgendaService } from "./agenda.service";
import { VisitAvailabilityService } from "./visit-availability.service";

@Module({
  controllers: [AgendaController],
  providers: [AgendaService, VisitAvailabilityService],
  // A seleção personalizada calcula os slots com a mesma configuração.
  exports: [VisitAvailabilityService],
})
export class AgendaModule {}
