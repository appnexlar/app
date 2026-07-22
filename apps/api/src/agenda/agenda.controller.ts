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
  createAgendaEventSchema,
  listAgendaSchema,
  updateAgendaEventSchema,
  type AgendaEventSummary,
  type AgendaListQuery,
  type AgendaSummary,
  type CreateAgendaEventDto,
  type UpdateAgendaEventDto,
} from "@nexlar/shared";
import { CurrentBroker } from "../common/decorators/current-broker.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AgendaService } from "./agenda.service";

@ApiTags("agenda")
@ApiBearerAuth()
@Controller("agenda")
export class AgendaController {
  constructor(private readonly agenda: AgendaService) {}

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
