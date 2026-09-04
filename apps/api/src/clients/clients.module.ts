import { Module } from "@nestjs/common";
import { LeadsModule } from "../leads/leads.module";
import { ClientsController } from "./clients.controller";
import { ClientsService } from "./clients.service";
import { LeadRefPipe } from "../common/pipes/short-code.pipe";

@Module({
  // O cadastro e a mudança de etapa são os mesmos da rota antiga de lead:
  // uma regra só, sem cópia paralela.
  imports: [LeadsModule],
  controllers: [ClientsController],
  providers: [ClientsService, LeadRefPipe],
})
export class ClientsModule {}
