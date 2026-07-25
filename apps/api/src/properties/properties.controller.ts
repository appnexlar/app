import {
  BadRequestException,
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
  Req,
  Res,
} from "@nestjs/common";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  changeStatusSchema,
  confirmAvailabilitySchema,
  createPropertySchema,
  externalMediaSchema,
  listPropertiesSchema,
  propertyContactSchema,
  updateMediaSchema,
  updatePropertySchema,
  MEDIA_ORIGINS,
  PHOTO_ROOMS,
  type ChangeStatusDto,
  type ConfirmAvailabilityDto,
  type CreatePropertyDto,
  type ExternalMediaDto,
  type ListPropertiesQuery,
  type MediaOrigin,
  type PhotoRoom,
  type PropertyContactDto,
  type UpdateMediaDto,
  type UpdatePropertyDto,
} from "@nexlar/shared";
import { CurrentBroker } from "../common/decorators/current-broker.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { PropertiesService } from "./properties.service";
import { PropertyMediaService } from "./property-media.service";

@ApiTags("properties")
@ApiBearerAuth()
@Controller("properties")
export class PropertiesController {
  constructor(
    private readonly properties: PropertiesService,
    private readonly media: PropertyMediaService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Cria o rascunho do imóvel (etapa 1 do cadastro)" })
  create(
    @CurrentBroker("brokerId") brokerId: string,
    @Body(new ZodValidationPipe(createPropertySchema)) dto: CreatePropertyDto,
  ) {
    return this.properties.create(brokerId, dto);
  }

  @Get()
  @ApiOperation({ summary: "Carteira do corretor: busca, filtros, ordenação e paginação" })
  list(
    @CurrentBroker("brokerId") brokerId: string,
    @Query(new ZodValidationPipe(listPropertiesSchema)) query: ListPropertiesQuery,
  ) {
    return this.properties.list(brokerId, query);
  }

  @Get("duplicates")
  @ApiOperation({ summary: "Possíveis duplicidades na carteira (informativo, nunca bloqueia)" })
  duplicates(
    @CurrentBroker("brokerId") brokerId: string,
    @Query("externalCode") externalCode?: string,
    @Query("externalLink") externalLink?: string,
    @Query("street") street?: string,
    @Query("addressNumber") addressNumber?: string,
    @Query("complement") complement?: string,
    @Query("excludeId") excludeId?: string,
  ) {
    return this.properties.findDuplicates(brokerId, {
      externalCode,
      externalLink,
      street,
      addressNumber,
      complement,
      excludeId,
    });
  }

  @Get("partners")
  @ApiOperation({ summary: "Busca parceiros que o corretor já cadastrou antes (reuso)" })
  searchPartners(
    @CurrentBroker("brokerId") brokerId: string,
    @Query("q") q = "",
  ) {
    return this.properties.searchPartners(brokerId, q);
  }

  @Get(":id")
  @ApiOperation({ summary: "Ficha completa do imóvel" })
  findOne(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.properties.findOne(brokerId, id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Atualização progressiva (qualquer etapa do cadastro)" })
  update(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePropertySchema)) dto: UpdatePropertyDto,
  ) {
    return this.properties.update(brokerId, id, dto);
  }

  @Patch(":id/status")
  @ApiOperation({ summary: "Muda o status; tornar disponível valida o mínimo apresentável" })
  changeStatus(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(changeStatusSchema)) dto: ChangeStatusDto,
  ) {
    return this.properties.changeStatus(brokerId, id, dto);
  }

  @Post(":id/availability")
  @ApiOperation({ summary: "Confirma a disponibilidade operacional do imóvel" })
  confirmAvailability(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(confirmAvailabilitySchema)) dto: ConfirmAvailabilityDto,
  ) {
    return this.properties.confirmAvailability(brokerId, id, dto);
  }

  @Post(":id/duplicate")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Duplica o imóvel como novo rascunho (sem mídias)" })
  duplicate(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.properties.duplicate(brokerId, id);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Exclui o imóvel definitivamente (apaga também os arquivos)" })
  async remove(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    await this.media.removeAllFiles(brokerId, id);
    return this.properties.remove(brokerId, id);
  }

  // --- Contatos (pessoas envolvidas) ----------------------------------------

  @Post(":id/contacts")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Registra uma pessoa envolvida no imóvel" })
  addContact(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(propertyContactSchema)) dto: PropertyContactDto,
  ) {
    return this.properties.addContact(brokerId, id, dto);
  }

  @Patch(":id/contacts/:contactId")
  @ApiOperation({ summary: "Atualiza uma pessoa envolvida" })
  updateContact(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("contactId", ParseUUIDPipe) contactId: string,
    @Body(new ZodValidationPipe(propertyContactSchema)) dto: PropertyContactDto,
  ) {
    return this.properties.updateContact(brokerId, id, contactId, dto);
  }

  @Delete(":id/contacts/:contactId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove uma pessoa envolvida" })
  removeContact(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("contactId", ParseUUIDPipe) contactId: string,
  ) {
    return this.properties.removeContact(brokerId, id, contactId);
  }

  // --- Mídia -----------------------------------------------------------------

  @Post(":id/media")
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Upload de foto, vídeo, planta ou PDF (multipart)" })
  async uploadMedia(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() req: FastifyRequest,
  ) {
    const file = await req.file();
    if (!file) throw new BadRequestException("Envie um arquivo.");

    const fieldValue = (name: string): string | undefined => {
      const field = file.fields[name];
      const single = Array.isArray(field) ? field[0] : field;
      return single && "value" in single ? String(single.value) : undefined;
    };

    const kindRaw = fieldValue("kind") ?? "foto";
    if (!["foto", "video", "planta", "documento"].includes(kindRaw)) {
      throw new BadRequestException("Tipo de mídia inválido.");
    }
    const originRaw = fieldValue("origin");
    const roomRaw = fieldValue("room");

    return this.media.upload(brokerId, id, {
      filename: file.filename,
      mimeType: file.mimetype,
      buffer: await file.toBuffer(),
      kind: kindRaw as "foto" | "video" | "planta" | "documento",
      origin:
        originRaw && (MEDIA_ORIGINS as readonly string[]).includes(originRaw)
          ? (originRaw as MediaOrigin)
          : undefined,
      // Só recusa quando o cliente diz explicitamente que não. O padrão é a
      // mídia entrar disponível para o anúncio.
      authorized: fieldValue("authorized") !== "false",
      caption: fieldValue("caption"),
      room:
        roomRaw && (PHOTO_ROOMS as readonly string[]).includes(roomRaw)
          ? (roomRaw as PhotoRoom)
          : undefined,
    });
  }

  @Post(":id/media/external")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Adiciona link externo (vídeo, tour virtual, 360°)" })
  addExternalMedia(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(externalMediaSchema)) dto: ExternalMediaDto,
  ) {
    return this.media.addExternal(brokerId, id, dto);
  }

  @Patch(":id/media/:mediaId")
  @ApiOperation({ summary: "Atualiza legenda, ambiente, capa, ordem ou origem da mídia" })
  updateMedia(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("mediaId", ParseUUIDPipe) mediaId: string,
    @Body(new ZodValidationPipe(updateMediaSchema)) dto: UpdateMediaDto,
  ) {
    return this.media.updateMedia(brokerId, id, mediaId, dto);
  }

  @Post(":id/media/:mediaId/retry")
  @ApiOperation({ summary: "Tenta novamente uma mídia com falha" })
  retryMedia(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("mediaId", ParseUUIDPipe) mediaId: string,
  ) {
    return this.media.retry(brokerId, id, mediaId);
  }

  @Delete(":id/media/:mediaId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove a mídia (marca como removida e apaga o arquivo)" })
  removeMedia(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("mediaId", ParseUUIDPipe) mediaId: string,
  ) {
    return this.media.removeMedia(brokerId, id, mediaId);
  }

  @Get(":id/media/:mediaId/file")
  @ApiOperation({ summary: "Serve o arquivo privado (sempre autenticado e do próprio corretor)" })
  async serveMedia(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("mediaId", ParseUUIDPipe) mediaId: string,
    @Res() reply: FastifyReply,
  ) {
    const { stream, mimeType } = await this.media.stream(brokerId, id, mediaId);
    reply.header("Content-Type", mimeType);
    reply.header("Cache-Control", "private, max-age=3600");
    return reply.send(stream);
  }
}
