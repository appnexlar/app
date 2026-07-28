import { Module } from "@nestjs/common";
import { NotificationModule } from "../notification/notification.module";
import { AgendaModule } from "../agenda/agenda.module";
import { SharingController } from "./sharing.controller";
import { SharingService } from "./sharing.service";
import { SelectionsController } from "./selections.controller";
import { SelectionsService } from "./selections.service";
import { SelectionCandidatesService } from "./selection-candidates.service";
import { SelectionPublicController } from "./selection-public.controller";
import { SelectionPublicService } from "./selection-public.service";
import { LeadRefPipe, SelectionRefPipe } from "../common/pipes/short-code.pipe";

/**
 * Um módulo só para property_selection: o envio rápido de um imóvel
 * (SharingService), a seleção personalizada completa (SelectionsService,
 * candidatos) e a página pública da lead (SelectionPublicService) são o
 * mesmo modelo no banco, então vivem juntos aqui.
 */
@Module({
  imports: [NotificationModule, AgendaModule],
  controllers: [SharingController, SelectionsController, SelectionPublicController],
  providers: [
    SharingService,
    SelectionsService,
    SelectionCandidatesService,
    SelectionPublicService,
    LeadRefPipe,
    SelectionRefPipe,
  ],
})
export class SharingModule {}
