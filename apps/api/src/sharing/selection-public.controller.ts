import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyReply } from "fastify";
import {
  publicBookVisitSchema,
  publicSelectionInfoSchema,
  publicSelectionResponseSchema,
  type PublicBookVisitDto,
  type PublicSelectionInfoDto,
  type PublicSelectionItemDetailResponse,
  type PublicSelectionPageResponse,
  type PublicSelectionResponseDto,
  type PublicVisitSlotsResponse,
  type PublicVisitView,
} from "@nexlar/shared";
import { Public } from "../common/decorators/public.decorator";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SelectionPublicService } from "./selection-public.service";

const MINUTO = 60_000;

/**
 * Rotas públicas da seleção personalizada (/selecao/:token). Sem login: a
 * posse do token é a credencial, e o rate limit por IP segura enumeração e
 * spam de ações.
 */
@ApiTags("public-selecao")
@Controller("public/selecoes")
export class SelectionPublicController {
  constructor(private readonly selecoes: SelectionPublicService) {}

  @Get(":token")
  @Public()
  @RateLimit({ name: "selecao", limit: 120, windowMs: 5 * MINUTO })
  @ApiOperation({ summary: "Página da seleção para a lead" })
  getPage(@Param("token") token: string): Promise<PublicSelectionPageResponse> {
    return this.selecoes.getPage(token);
  }

  @Get(":token/itens/:itemId")
  @Public()
  @RateLimit({ name: "selecao", limit: 120, windowMs: 5 * MINUTO })
  @ApiOperation({ summary: "Detalhe de um imóvel da seleção" })
  getItem(
    @Param("token") token: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
  ): Promise<PublicSelectionItemDetailResponse> {
    return this.selecoes.getItemDetail(token, itemId);
  }

  @Get(":token/media/:mediaId")
  @Public()
  @RateLimit({ name: "selecao-foto", limit: 600, windowMs: 5 * MINUTO })
  @ApiOperation({ summary: "Foto ou vídeo de um imóvel da seleção" })
  async media(
    @Param("token") token: string,
    @Param("mediaId", ParseUUIDPipe) mediaId: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { stream, mimeType } = await this.selecoes.streamMedia(token, mediaId);
    reply.header("Content-Type", mimeType);
    reply.header("Cache-Control", "private, max-age=300");
    await reply.send(stream);
  }

  @Post(":token/itens/:itemId/resposta")
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit({ name: "selecao-acao", limit: 30, windowMs: 10 * MINUTO })
  @ApiOperation({ summary: "Gostei / talvez / não combina / desfazer" })
  respond(
    @Param("token") token: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @Body(new ZodValidationPipe(publicSelectionResponseSchema)) dto: PublicSelectionResponseDto,
  ): Promise<void> {
    return this.selecoes.respond(token, itemId, dto);
  }

  @Post(":token/itens/:itemId/informacoes")
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit({ name: "selecao-info", limit: 10, windowMs: 10 * MINUTO })
  @ApiOperation({ summary: "Pedir mais informações sobre um imóvel" })
  requestInfo(
    @Param("token") token: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @Body(new ZodValidationPipe(publicSelectionInfoSchema)) dto: PublicSelectionInfoDto,
  ): Promise<void> {
    return this.selecoes.requestInfo(token, itemId, dto);
  }

  @Post(":token/itens/:itemId/visita")
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit({ name: "selecao-visita", limit: 10, windowMs: 10 * MINUTO })
  @ApiOperation({ summary: "Solicitar visita (o corretor confirma o horário)" })
  requestVisit(
    @Param("token") token: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
  ): Promise<void> {
    return this.selecoes.requestVisit(token, itemId);
  }

  @Get(":token/itens/:itemId/slots")
  @Public()
  @RateLimit({ name: "selecao-slots", limit: 60, windowMs: 10 * MINUTO })
  @ApiOperation({ summary: "Horários livres para visitar este imóvel" })
  getSlots(
    @Param("token") token: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
  ): Promise<PublicVisitSlotsResponse> {
    return this.selecoes.getVisitSlots(token, itemId);
  }

  @Post(":token/itens/:itemId/agendar")
  @Public()
  @RateLimit({ name: "selecao-visita", limit: 10, windowMs: 10 * MINUTO })
  @ApiOperation({ summary: "Agendar a visita num horário livre da agenda" })
  bookVisit(
    @Param("token") token: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @Body(new ZodValidationPipe(publicBookVisitSchema)) dto: PublicBookVisitDto,
  ): Promise<PublicVisitView> {
    return this.selecoes.bookVisit(token, itemId, dto);
  }

  @Post(":token/itens/:itemId/visita/cancelar")
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit({ name: "selecao-visita", limit: 10, windowMs: 10 * MINUTO })
  @ApiOperation({ summary: "Cancelar a visita agendada (o interesse permanece)" })
  cancelVisit(
    @Param("token") token: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
  ): Promise<void> {
    return this.selecoes.cancelVisit(token, itemId);
  }
}
