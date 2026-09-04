import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  changeLeadStatusSchema,
  convertLeadSchema,
  createLeadSchema,
  upsertLeadPreferenceSchema,
  type ChangeLeadStatusDto,
  type ConvertLeadDto,
  type CreateLeadDto,
  type LeadDetail,
  type LeadPreferenceView,
  type LeadSummary,
  type UpsertLeadPreferenceDto,
} from "@nexlar/shared";
import { CurrentBroker } from "../common/decorators/current-broker.decorator";
import { LeadRefPipe } from "../common/pipes/short-code.pipe";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { LeadsService } from "./leads.service";
import { LeadPreferencesService } from "./lead-preferences.service";

@ApiTags("leads")
@ApiBearerAuth()
@Controller("leads")
export class LeadsController {
  constructor(
    private readonly leads: LeadsService,
    private readonly preferences: LeadPreferencesService,
  ) {}

  @Get(":id/preferences")
  @ApiOperation({ summary: "Preferências de busca da lead (nulo se nunca preenchidas)" })
  getPreferences(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", LeadRefPipe) leadId: string,
  ): Promise<LeadPreferenceView | null> {
    return this.preferences.get(brokerId, leadId);
  }

  @Put(":id/preferences")
  @ApiOperation({ summary: "Salvar as preferências de busca (substitui o conjunto)" })
  upsertPreferences(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", LeadRefPipe) leadId: string,
    @Body(new ZodValidationPipe(upsertLeadPreferenceSchema)) dto: UpsertLeadPreferenceDto,
  ): Promise<LeadPreferenceView> {
    return this.preferences.upsert(brokerId, leadId, dto);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Cadastro rápido de lead (só nome e WhatsApp obrigatórios)" })
  create(
    @CurrentBroker("brokerId") brokerId: string,
    @Body(new ZodValidationPipe(createLeadSchema)) dto: CreateLeadDto,
  ): Promise<LeadSummary> {
    return this.leads.create(brokerId, dto);
  }

  @Get()
  @ApiOperation({ summary: "Apelido: lista quem ainda não fechou (use GET /clients)" })
  list(@CurrentBroker("brokerId") brokerId: string): Promise<LeadSummary[]> {
    // Entidade única (set 2026): a rota antiga segue devolvendo só quem ainda
    // não fechou, como sempre fez, até o front migrar para /clients.
    return this.leads.list(brokerId, { apenasAbertos: true });
  }

  @Get(":id")
  @ApiOperation({ summary: "Ficha completa do lead: dados + linha do tempo" })
  findOne(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", LeadRefPipe) id: string,
  ): Promise<LeadDetail> {
    return this.leads.findOne(brokerId, id);
  }

  @Patch(":id/status")
  @ApiOperation({ summary: "Muda o status do lead (ex.: converter em cliente)" })
  changeStatus(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", LeadRefPipe) id: string,
    @Body(new ZodValidationPipe(changeLeadStatusSchema)) dto: ChangeLeadStatusDto,
  ): Promise<LeadSummary> {
    return this.leads.changeStatus(brokerId, id, dto);
  }

  @Post(":id/convert")
  @ApiOperation({ summary: "Converte a lead em cliente (ação consciente, LEAD-13)" })
  convert(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", LeadRefPipe) id: string,
    @Body(new ZodValidationPipe(convertLeadSchema)) dto: ConvertLeadDto,
  ): Promise<LeadSummary> {
    return this.leads.convert(brokerId, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Exclui um lead do corretor autenticado" })
  remove(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", LeadRefPipe) id: string,
  ): Promise<void> {
    return this.leads.remove(brokerId, id);
  }
}
