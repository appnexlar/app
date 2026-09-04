import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  changeLeadStatusSchema,
  createClientSchema,
  listClientsSchema,
  requestDeletionSchema,
  updateClientFinancialSchema,
  updateClientNegotiationSchema,
  updateClientProfileSchema,
  upsertParticipantSchema,
  type ClientDetail,
  type ClientFinancialData,
  type ClientNegotiationData,
  type ClientProfileData,
  type ClientSummary,
  type DeletionRequestSummary,
  type ChangeLeadStatusDto,
  type CreateClientDto,
  type LeadSummary,
  type ListClientsQuery,
  type ParticipantSummary,
  type RequestDeletionDto,
  type UpdateClientFinancialDto,
  type UpdateClientNegotiationDto,
  type UpdateClientProfileDto,
  type UpsertParticipantDto,
} from "@nexlar/shared";
import { CurrentBroker } from "../common/decorators/current-broker.decorator";
import { LeadRefPipe } from "../common/pipes/short-code.pipe";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ClientsService } from "./clients.service";
import { LeadsService } from "../leads/leads.service";

@ApiTags("clients")
@ApiBearerAuth()
@Controller("clients")
export class ClientsController {
  constructor(
    private readonly clients: ClientsService,
    private readonly leads: LeadsService,
  ) {}

  @Post()
  @ApiOperation({
    summary: "Cadastro rápido de cliente, com etapa inicial opcional",
  })
  create(
    @CurrentBroker("brokerId") brokerId: string,
    @Body(new ZodValidationPipe(createClientSchema)) dto: CreateClientDto,
  ): Promise<ClientSummary> {
    return this.clients.create(brokerId, dto);
  }

  @Patch(":id/status")
  @ApiOperation({ summary: "Muda a etapa do cliente no funil (inclui fechar o negócio)" })
  changeStatus(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", LeadRefPipe) id: string,
    @Body(new ZodValidationPipe(changeLeadStatusSchema)) dto: ChangeLeadStatusDto,
  ): Promise<LeadSummary> {
    return this.leads.changeStatus(brokerId, id, dto);
  }

  @Get()
  @ApiOperation({ summary: "Lista os clientes do corretor, com recorte opcional por etapa" })
  list(
    @CurrentBroker("brokerId") brokerId: string,
    @Query(new ZodValidationPipe(listClientsSchema)) query: ListClientsQuery,
  ): Promise<ClientSummary[]> {
    return this.clients.list(brokerId, query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Ficha completa do cliente" })
  findOne(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", LeadRefPipe) id: string,
  ): Promise<ClientDetail> {
    return this.clients.findOne(brokerId, id);
  }

  @Patch(":id/profile")
  @ApiOperation({ summary: "Atualiza os dados pessoais do cliente (coleta progressiva)" })
  updateProfile(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", LeadRefPipe) id: string,
    @Body(new ZodValidationPipe(updateClientProfileSchema)) dto: UpdateClientProfileDto,
  ): Promise<ClientProfileData> {
    return this.clients.updateProfile(brokerId, id, dto);
  }

  @Patch(":id/negotiation")
  @ApiOperation({ summary: "Atualiza o estado atual da negociação do cliente" })
  updateNegotiation(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", LeadRefPipe) id: string,
    @Body(new ZodValidationPipe(updateClientNegotiationSchema)) dto: UpdateClientNegotiationDto,
  ): Promise<ClientNegotiationData> {
    return this.clients.updateNegotiation(brokerId, id, dto);
  }

  @Patch(":id/financial")
  @ApiOperation({ summary: "Atualiza os dados financeiros (sensíveis) do cliente" })
  updateFinancial(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", LeadRefPipe) id: string,
    @Body(new ZodValidationPipe(updateClientFinancialSchema)) dto: UpdateClientFinancialDto,
  ): Promise<ClientFinancialData> {
    return this.clients.updateFinancial(brokerId, id, dto);
  }

  @Post(":id/participants")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Adiciona um participante (cônjuge, fiador...) ao cliente" })
  addParticipant(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", LeadRefPipe) id: string,
    @Body(new ZodValidationPipe(upsertParticipantSchema)) dto: UpsertParticipantDto,
  ): Promise<ParticipantSummary> {
    return this.clients.addParticipant(brokerId, id, dto);
  }

  @Patch(":id/participants/:participantId")
  @ApiOperation({ summary: "Edita um participante do cliente" })
  updateParticipant(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", LeadRefPipe) id: string,
    @Param("participantId", ParseUUIDPipe) participantId: string,
    @Body(new ZodValidationPipe(upsertParticipantSchema)) dto: UpsertParticipantDto,
  ): Promise<ParticipantSummary> {
    return this.clients.updateParticipant(brokerId, id, participantId, dto);
  }

  @Delete(":id/participants/:participantId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove um participante do cliente" })
  removeParticipant(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", LeadRefPipe) id: string,
    @Param("participantId", ParseUUIDPipe) participantId: string,
  ): Promise<void> {
    return this.clients.removeParticipant(brokerId, id, participantId);
  }

  @Post(":id/deletion-request")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Registra uma solicitação de exclusão de dados (LGPD, não apaga)" })
  requestDeletion(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", LeadRefPipe) id: string,
    @Body(new ZodValidationPipe(requestDeletionSchema)) dto: RequestDeletionDto,
  ): Promise<DeletionRequestSummary> {
    return this.clients.requestDeletion(brokerId, id, dto);
  }
}
