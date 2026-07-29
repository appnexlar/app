import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyReply } from "fastify";
import {
  publicListingQuerySchema,
  publicInterestSchema,
  type PublicBrokerPageResponse,
  type PublicListingQuery,
  type PublicListingResponse,
  type PublicPropertyDetailResponse,
  type CreateInterestRequest,
  type InterestResponse,
} from "@nexlar/shared";
import { Public } from "../common/decorators/public.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator";
import { PublicBrokerPageService } from "./public-broker-page.service";
import { PublicInterestService } from "./public-interest.service";

const MINUTO = 60 * 1000;

/**
 * A vitrine aberta na internet. Tudo aqui é @Public() e, por isso mesmo, tudo
 * tem limite por IP: é a primeira superfície do sistema exposta sem login
 * além das Seleções. O DTO já nasce sem dado privado; o controller só entrega.
 */
@ApiTags("public")
@Controller("public/corretor")
export class PublicBrokerPageController {
  constructor(
    private readonly vitrine: PublicBrokerPageService,
    private readonly interest: PublicInterestService,
  ) {}

  @Public()
  @RateLimit({ name: "vitrine", limit: 120, windowMs: 5 * MINUTO })
  @Get(":slug")
  @ApiOperation({ summary: "Página pública do corretor pelo endereço" })
  getPage(@Param("slug") slug: string): Promise<PublicBrokerPageResponse> {
    return this.vitrine.getBySlug(slug);
  }

  @Public()
  @RateLimit({ name: "vitrine-lista", limit: 240, windowMs: 5 * MINUTO })
  @Get(":slug/imoveis")
  @ApiOperation({ summary: "Imóveis da vitrine com busca, filtros e ordenação" })
  listProperties(
    @Param("slug") slug: string,
    @Query(new ZodValidationPipe(publicListingQuerySchema)) query: PublicListingQuery,
  ): Promise<PublicListingResponse> {
    return this.vitrine.listProperties(slug, query);
  }

  @Public()
  @RateLimit({ name: "vitrine", limit: 120, windowMs: 5 * MINUTO })
  @Get(":slug/imoveis/:code")
  @ApiOperation({ summary: "Detalhe público de um imóvel da vitrine" })
  getPropertyDetail(
    @Param("slug") slug: string,
    @Param("code", ParseIntPipe) code: number,
  ): Promise<PublicPropertyDetailResponse> {
    return this.vitrine.getPropertyDetail(slug, code);
  }

  @Public()
  @RateLimit({ name: "interesse", limit: 5, windowMs: 10 * MINUTO })
  @Post(":slug/imoveis/:code/interesse")
  @ApiOperation({ summary: "Registrar interesse no imóvel" })
  submitInterest(
    @Param("slug") slug: string,
    @Param("code", ParseIntPipe) code: number,
    @Body(new ZodValidationPipe(publicInterestSchema)) body: CreateInterestRequest,
  ): Promise<InterestResponse> {
    return this.interest.submitInterest(slug, code, body);
  }

  @Public()
  // Mesmo teto do interesse: é a mesma porta de entrada de lead, só que sem
  // imóvel, e merece a mesma proteção contra enxurrada.
  @RateLimit({ name: "interesse", limit: 5, windowMs: 10 * MINUTO })
  @Post(":slug/contato")
  @ApiOperation({ summary: "Pedir contato pelo WhatsApp a partir da vitrine" })
  submitContact(
    @Param("slug") slug: string,
    @Body(new ZodValidationPipe(publicInterestSchema)) body: CreateInterestRequest,
  ): Promise<InterestResponse> {
    return this.interest.submitContact(slug, body);
  }

  @Public()
  @RateLimit({ name: "vitrine-foto", limit: 600, windowMs: 5 * MINUTO })
  @Get(":slug/foto")
  @ApiOperation({ summary: "Foto de perfil do corretor da vitrine" })
  async avatar(@Param("slug") slug: string, @Res() reply: FastifyReply): Promise<void> {
    const { stream, mimeType } = await this.vitrine.streamAvatar(slug);
    void reply
      .header("Content-Type", mimeType)
      // Página aberta, foto pública: cache compartilhado à vontade. A URL é
      // versionada, então trocar a foto troca a URL.
      .header("Cache-Control", "public, max-age=86400")
      .send(stream);
  }

  @Public()
  @RateLimit({ name: "vitrine-foto", limit: 600, windowMs: 5 * MINUTO })
  @Get(":slug/imoveis/:code/foto/:mediaId")
  @ApiOperation({ summary: "Foto de um imóvel publicado na vitrine" })
  async propertyPhoto(
    @Param("slug") slug: string,
    @Param("code", ParseIntPipe) code: number,
    @Param("mediaId", ParseUUIDPipe) mediaId: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { stream, mimeType } = await this.vitrine.streamPropertyPhoto(slug, code, mediaId);
    void reply
      .header("Content-Type", mimeType)
      .header("Cache-Control", "public, max-age=3600")
      .send(stream);
  }
}
