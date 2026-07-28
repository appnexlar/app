import { Module } from "@nestjs/common";
import { ClientsController } from "./clients.controller";
import { ClientsService } from "./clients.service";
import { LeadRefPipe } from "../common/pipes/short-code.pipe";

@Module({
  controllers: [ClientsController],
  providers: [ClientsService, LeadRefPipe],
})
export class ClientsModule {}
