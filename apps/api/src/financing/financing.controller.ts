import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  createFinancingRequestSchema,
  updateFinancingRequestSchema,
  type CreateFinancingRequestDto,
  type FinancingRequestSummary,
  type FinancingRequestView,
  type FinancingSendResult,
  type UpdateFinancingRequestDto,
} from "@nexlar/shared";
import { CurrentBroker } from "../common/decorators/current-broker.decorator";
import { FinancingRefPipe } from "../common/pipes/short-code.pipe";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { FinancingRequestsService } from "./financing-requests.service";

/**
 * Coleta de dados para simulação, lado administrativo. Rotas autenticadas e
 * isoladas pelo broker do token. Transições são endpoints próprios: o front
 * nunca escreve status.
 */
@ApiTags("financing")
@ApiBearerAuth()
@Controller("financing-requests")
export class FinancingController {
  constructor(private readonly requests: FinancingRequestsService) {}

  @Post()
  @ApiOperation({ summary: "Cria a solicitação (rascunho) para uma lead" })
  create(
    @CurrentBroker("brokerId") brokerId: string,
    @Body(new ZodValidationPipe(createFinancingRequestSchema)) dto: CreateFinancingRequestDto,
  ): Promise<FinancingRequestView> {
    return this.requests.create(brokerId, dto);
  }

  @Get()
  @ApiOperation({ summary: "Lista as solicitações, opcionalmente de uma lead" })
  list(
    @CurrentBroker("brokerId") brokerId: string,
    @Query("leadId") leadId?: string,
  ): Promise<FinancingRequestSummary[]> {
    return this.requests.list(brokerId, leadId || undefined);
  }

  @Get(":ref")
  @ApiOperation({ summary: "Detalhe da solicitação" })
  get(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("ref", FinancingRefPipe) id: string,
  ): Promise<FinancingRequestView> {
    return this.requests.get(brokerId, id);
  }

  @Patch(":ref")
  @ApiOperation({ summary: "Configura o rascunho (blocos, prazo, mensagem, imóvel)" })
  update(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("ref", FinancingRefPipe) id: string,
    @Body(new ZodValidationPipe(updateFinancingRequestSchema)) dto: UpdateFinancingRequestDto,
  ): Promise<FinancingRequestView> {
    return this.requests.update(brokerId, id, dto);
  }

  @Post(":ref/send")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Gera o link seguro e ativa o prazo. O token aparece só aqui." })
  send(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("ref", FinancingRefPipe) id: string,
  ): Promise<FinancingSendResult> {
    return this.requests.send(brokerId, id);
  }

  @Post(":ref/revoke")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Revoga o link imediatamente" })
  revoke(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("ref", FinancingRefPipe) id: string,
  ): Promise<FinancingRequestView> {
    return this.requests.revoke(brokerId, id);
  }

  @Post(":ref/archive")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Arquiva a solicitação preservando o histórico" })
  archive(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("ref", FinancingRefPipe) id: string,
  ): Promise<FinancingRequestView> {
    return this.requests.archive(brokerId, id);
  }
}
