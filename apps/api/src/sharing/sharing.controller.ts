import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyReply } from "fastify";
import {
  createShareSchema,
  setPrioritySchema,
  setResponseSchema,
  type CreateShareDto,
  type LeadShareSummary,
  type PropertyShareSummary,
  type PublicSharedProperty,
  type SetPriorityDto,
  type SetResponseDto,
} from "@nexlar/shared";
import { CurrentBroker } from "../common/decorators/current-broker.decorator";
import { LeadRefPipe } from "../common/pipes/short-code.pipe";
import { Public } from "../common/decorators/public.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SharingService } from "./sharing.service";

@ApiTags("sharing")
@Controller()
export class SharingController {
  constructor(private readonly sharing: SharingService) {}

  @Post("properties/:id/shares")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Enviar um imóvel para uma lead (cria o compartilhamento)" })
  create(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", ParseUUIDPipe) propertyId: string,
    @Body(new ZodValidationPipe(createShareSchema)) dto: CreateShareDto,
  ): Promise<PropertyShareSummary> {
    return this.sharing.createShare(brokerId, propertyId, dto);
  }

  @Get("properties/:id/shares")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Leads que receberam este imóvel" })
  listForProperty(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", ParseUUIDPipe) propertyId: string,
  ): Promise<PropertyShareSummary[]> {
    return this.sharing.listForProperty(brokerId, propertyId);
  }

  @Get("leads/:id/shares")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Imóveis enviados para esta lead" })
  listForLead(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", LeadRefPipe) leadId: string,
  ): Promise<LeadShareSummary[]> {
    return this.sharing.listForLead(brokerId, leadId);
  }

  @Post("shares/:shareId/resend")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Reenviar o mesmo link (não duplica)" })
  resend(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("shareId", ParseUUIDPipe) shareId: string,
  ): Promise<PropertyShareSummary> {
    return this.sharing.resend(brokerId, shareId);
  }

  @Post("shares/:shareId/revoke")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Revogar o link do compartilhamento" })
  revoke(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("shareId", ParseUUIDPipe) shareId: string,
  ): Promise<PropertyShareSummary> {
    return this.sharing.revoke(brokerId, shareId);
  }

  // Resposta e prioridade são de um imóvel dentro do compartilhamento: a
  // seleção pode levar vários, então a rota nomeia o item.
  @Post("shares/:shareId/items/:itemId/response")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Registrar manualmente a resposta da lead sobre o imóvel" })
  setResponse(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("shareId", ParseUUIDPipe) shareId: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @Body(new ZodValidationPipe(setResponseSchema)) dto: SetResponseDto,
  ): Promise<void> {
    return this.sharing.setResponse(brokerId, shareId, itemId, dto);
  }

  @Post("shares/:shareId/items/:itemId/priority")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Marcar/desmarcar o imóvel como prioritário para a lead" })
  setPriority(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("shareId", ParseUUIDPipe) shareId: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @Body(new ZodValidationPipe(setPrioritySchema)) dto: SetPriorityDto,
  ): Promise<void> {
    return this.sharing.setPriority(brokerId, shareId, itemId, dto);
  }

  @Get("public/shares/:token")
  @Public()
  @ApiOperation({ summary: "Página pública do imóvel compartilhado (sem login)" })
  getPublic(@Param("token") token: string): Promise<PublicSharedProperty> {
    return this.sharing.getPublic(token);
  }

  @Get("public/shares/:token/media/:mediaId")
  @Public()
  @ApiOperation({ summary: "Serve a imagem autorizada do imóvel compartilhado" })
  async serveMedia(
    @Param("token") token: string,
    @Param("mediaId", ParseUUIDPipe) mediaId: string,
    @Res() reply: FastifyReply,
  ) {
    const { stream, mimeType } = await this.sharing.streamPublicMedia(token, mediaId);
    reply.header("Content-Type", mimeType);
    reply.header("Cache-Control", "public, max-age=3600");
    return reply.send(stream);
  }
}
