import { Module } from "@nestjs/common";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";
import { LeadPreferencesService } from "./lead-preferences.service";
import { LeadRefPipe } from "../common/pipes/short-code.pipe";

@Module({
  controllers: [LeadsController],
  providers: [LeadsService, LeadPreferencesService, LeadRefPipe],
  // A vitrine pública cria lead pelo mesmo caminho do cadastro rápido, com o
  // mesmo dedupe por WhatsApp. Exportar evita uma segunda regra paralela.
  exports: [LeadsService],
})
export class LeadsModule {}
