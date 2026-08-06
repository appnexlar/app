import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Req, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  financingSaveSectionSchema,
  financingSubmitSchema,
  financingVerifyCodeSchema,
  type FinancingPublicForm,
  type FinancingPublicState,
  type FinancingSaveSectionDto,
  type FinancingSubmitDto,
  type FinancingSubmitResult,
  type FinancingVerifyCodeDto,
} from "@nexlar/shared";
import { Public } from "../common/decorators/public.decorator";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { FinancingPublicService } from "./financing-public.service";

const MINUTO = 60 * 1000;

/**
 * Rotas públicas do formulário de dados (docs/09). Token na URL, código por
 * e-mail, sessão em cookie. `private, no-store` em tudo: nada daqui pode
 * parar em cache compartilhado, nem o estado sem dados.
 */
@ApiTags("public-financing")
@Controller("public/financiamento")
export class FinancingPublicController {
  constructor(private readonly service: FinancingPublicService) {}

  @Public()
  @Get(":token")
  @RateLimit({ name: "financiamento", limit: 60, windowMs: 5 * MINUTO })
  @ApiOperation({ summary: "Estado do link, sem nenhum dado pessoal" })
  async state(
    @Param("token") token: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<FinancingPublicState> {
    reply.header("Cache-Control", "private, no-store");
    return this.service.state(token);
  }

  @Public()
  @Post(":token/otp")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit({ name: "financiamento-otp", limit: 5, windowMs: 10 * MINUTO })
  @ApiOperation({ summary: "Envia o código de acesso para o e-mail da ficha" })
  async requestCode(
    @Param("token") token: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    reply.header("Cache-Control", "private, no-store");
    await this.service.requestCode(token);
  }

  @Public()
  @Post(":token/verify")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: "financiamento-verify", limit: 10, windowMs: 10 * MINUTO })
  @ApiOperation({ summary: "Valida o código e abre a sessão do formulário" })
  async verify(
    @Param("token") token: string,
    @Body(new ZodValidationPipe(financingVerifyCodeSchema)) dto: FinancingVerifyCodeDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<FinancingPublicForm> {
    reply.header("Cache-Control", "private, no-store");
    return this.service.verify(token, dto.code, reply);
  }

  @Public()
  @Get(":token/form")
  @RateLimit({ name: "financiamento-form", limit: 60, windowMs: 5 * MINUTO })
  @ApiOperation({ summary: "Rascunho do formulário (exige a sessão do código)" })
  async form(
    @Param("token") token: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<FinancingPublicForm> {
    reply.header("Cache-Control", "private, no-store");
    return this.service.getForm(token, request);
  }

  @Public()
  @Patch(":token/form")
  @RateLimit({ name: "financiamento-save", limit: 120, windowMs: 5 * MINUTO })
  @ApiOperation({ summary: "Salva uma seção do rascunho (autosave)" })
  async save(
    @Param("token") token: string,
    @Body(new ZodValidationPipe(financingSaveSectionSchema)) dto: FinancingSaveSectionDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<FinancingPublicForm> {
    reply.header("Cache-Control", "private, no-store");
    return this.service.saveSection(token, request, dto);
  }

  @Public()
  @Post(":token/submit")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: "financiamento-submit", limit: 10, windowMs: 10 * MINUTO })
  @ApiOperation({ summary: "Envia as respostas: congela a versão imutável" })
  async submit(
    @Param("token") token: string,
    @Body(new ZodValidationPipe(financingSubmitSchema)) _dto: FinancingSubmitDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<FinancingSubmitResult> {
    reply.header("Cache-Control", "private, no-store");
    return this.service.submit(token, request);
  }
}
