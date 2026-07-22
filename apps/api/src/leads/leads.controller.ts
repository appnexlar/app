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
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  changeLeadStatusSchema,
  convertLeadSchema,
  createLeadSchema,
  type ChangeLeadStatusDto,
  type ConvertLeadDto,
  type CreateLeadDto,
  type LeadDetail,
  type LeadSummary,
} from "@nexlar/shared";
import { CurrentBroker } from "../common/decorators/current-broker.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { LeadsService } from "./leads.service";

@ApiTags("leads")
@ApiBearerAuth()
@Controller("leads")
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

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
  @ApiOperation({ summary: "Lista os leads do corretor autenticado, mais recentes primeiro" })
  list(@CurrentBroker("brokerId") brokerId: string): Promise<LeadSummary[]> {
    return this.leads.list(brokerId);
  }

  @Get(":id")
  @ApiOperation({ summary: "Ficha completa do lead: dados + linha do tempo" })
  findOne(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<LeadDetail> {
    return this.leads.findOne(brokerId, id);
  }

  @Patch(":id/status")
  @ApiOperation({ summary: "Muda o status do lead (ex.: converter em cliente)" })
  changeStatus(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(changeLeadStatusSchema)) dto: ChangeLeadStatusDto,
  ): Promise<LeadSummary> {
    return this.leads.changeStatus(brokerId, id, dto);
  }

  @Post(":id/convert")
  @ApiOperation({ summary: "Converte a lead em cliente (ação consciente, LEAD-13)" })
  convert(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(convertLeadSchema)) dto: ConvertLeadDto,
  ): Promise<LeadSummary> {
    return this.leads.convert(brokerId, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Exclui um lead do corretor autenticado" })
  remove(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.leads.remove(brokerId, id);
  }
}
