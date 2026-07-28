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
  Put,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  createAgendaEventSchema,
  listAgendaSchema,
  updateAgendaEventSchema,
  upsertVisitAvailabilitySchema,
  type AgendaEventSummary,
  type AgendaListQuery,
  type AgendaSummary,
  type CreateAgendaEventDto,
  type UpdateAgendaEventDto,
  type UpsertVisitAvailabilityDto,
  type VisitAvailabilityView,
} from "@nexlar/shared";
import { CurrentBroker } from "../common/decorators/current-broker.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AgendaService } from "./agenda.service";
import { VisitAvailabilityService } from "./visit-availability.service";

@ApiTags("agenda")
@ApiBearerAuth()
@Controller("agenda")
export class AgendaController {
  constructor(
    private readonly agenda: AgendaService,
    private readonly availability: VisitAvailabilityService,
  ) {}

  @Get("visit-availability")
  @ApiOperation({ summary: "Horários em que o corretor aceita visitas" })
  getAvailability(@CurrentBroker("brokerId") brokerId: string): Promise<VisitAvailabilityView> {
    return this.availability.get(brokerId);
  }

  @Put("visit-availability")
  @ApiOperation({ summary: "Salvar os horários de visita (substitui o conjunto)" })
  upsertAvailability(
    @CurrentBroker("brokerId") brokerId: string,
    @Body(new ZodValidationPipe(upsertVisitAvailabilitySchema)) dto: UpsertVisitAvailabilityDto,
  ): Promise<VisitAvailabilityView> {
    return this.availability.upsert(brokerId, dto);
  }

  @Get()
  @ApiOperation({ summary: "Lista eventos da agenda do corretor no período, com filtros" })
  list(
    @CurrentBroker("brokerId") brokerId: string,
    @Query(new ZodValidationPipe(listAgendaSchema)) query: AgendaListQuery,
  ): Promise<AgendaEventSummary[]> {
    return this.agenda.list(brokerId, query);
  }

  @Get("summary")
  @ApiOperation({ summary: "Contadores do resumo operacional (atrasadas, hoje, visitas)" })
  summary(@CurrentBroker("brokerId") brokerId: string): Promise<AgendaSummary> {
    return this.agenda.summary(brokerId);
  }

  @Get(":id")
  @ApiOperation({ summary: "Detalhe de um evento da agenda" })
  findOne(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<AgendaEventSummary> {
    return this.agenda.findOne(brokerId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Cria tarefa ou compromisso na agenda" })
  create(
    @CurrentBroker("brokerId") brokerId: string,
    @Body(new ZodValidationPipe(createAgendaEventSchema)) dto: CreateAgendaEventDto,
  ): Promise<AgendaEventSummary> {
    return this.agenda.create(brokerId, dto);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Edita, reagenda, conclui ou cancela um evento" })
  update(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAgendaEventSchema)) dto: UpdateAgendaEventDto,
  ): Promise<AgendaEventSummary> {
    return this.agenda.update(brokerId, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Exclui um evento da agenda" })
  remove(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.agenda.remove(brokerId, id);
  }
}
