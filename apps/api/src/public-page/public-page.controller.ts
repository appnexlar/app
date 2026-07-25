import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  changeVisibilitySchema,
  setHighlightsSchema,
  updatePublicPageSchema,
  type ChangeVisibilityDto,
  type ManagedPropertiesResponse,
  type ManagedProperty,
  type MyPublicPageState,
  type PublicBrokerPageResponse,
  type SetHighlightsDto,
  type SlugAvailability,
  type UpdatePublicPageDto,
} from "@nexlar/shared";
import { CurrentBroker } from "../common/decorators/current-broker.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { PropertyPublicationService } from "./property-publication.service";
import { PublicBrokerPageService } from "./public-broker-page.service";
import { PublicPageService } from "./public-page.service";

/**
 * Área ADMINISTRATIVA da página pública: tudo aqui é autenticado e fala da
 * página do próprio corretor (o broker vem do token, nunca da URL). A rota
 * pública de visitante (/corretor/:slug) é outra fatia, outro controller.
 */
@ApiTags("public-page")
@Controller("public-page")
export class PublicPageController {
  constructor(
    private readonly publicPage: PublicPageService,
    private readonly publication: PropertyPublicationService,
    private readonly publicView: PublicBrokerPageService,
  ) {}

  @Get("me")
  @ApiOperation({ summary: "Minha página pública: dados + requisitos de publicação" })
  getMe(@CurrentBroker("brokerId") brokerId: string): Promise<MyPublicPageState> {
    return this.publicPage.getState(brokerId);
  }

  @Patch("me")
  @ApiOperation({ summary: "Atualiza o perfil público (salva rascunho a qualquer momento)" })
  updateMe(
    @CurrentBroker("brokerId") brokerId: string,
    @Body(new ZodValidationPipe(updatePublicPageSchema)) dto: UpdatePublicPageDto,
  ): Promise<MyPublicPageState> {
    return this.publicPage.update(brokerId, dto);
  }

  @Get("slug")
  @ApiOperation({ summary: "Verifica disponibilidade de um endereço público" })
  checkSlug(
    @CurrentBroker("brokerId") brokerId: string,
    @Query("slug") slug?: string,
  ): Promise<SlugAvailability> {
    if (!slug?.trim()) throw new BadRequestException("Informe o endereço que quer verificar.");
    return this.publicPage.checkSlug(brokerId, slug);
  }

  @Post("me/publicar")
  @ApiOperation({ summary: "Publica a página (exige todos os requisitos mínimos)" })
  publish(@CurrentBroker("brokerId") brokerId: string): Promise<MyPublicPageState> {
    return this.publicPage.publish(brokerId);
  }

  @Post("me/pausar")
  @ApiOperation({ summary: "Pausa a página sem apagar nada" })
  pause(@CurrentBroker("brokerId") brokerId: string): Promise<MyPublicPageState> {
    return this.publicPage.pause(brokerId);
  }

  @Get("me/preview")
  @ApiOperation({ summary: "Prévia da própria vitrine, sem exigir página ativa" })
  preview(@CurrentBroker("brokerId") brokerId: string): Promise<PublicBrokerPageResponse> {
    return this.publicView.preview(brokerId);
  }

  // ---------------------------------------------------------------------------
  // Imóveis da vitrine
  // ---------------------------------------------------------------------------

  @Get("me/imoveis")
  @ApiOperation({ summary: "Carteira com visibilidade e elegibilidade de cada imóvel" })
  async listProperties(
    @CurrentBroker("brokerId") brokerId: string,
  ): Promise<ManagedPropertiesResponse> {
    // Destaque pode ter ficado órfão por caminhos de fora daqui (imóvel
    // vendido, foto removida). Arruma antes de responder.
    await this.publication.reconcileHighlights(brokerId);
    return this.publication.listForManager(brokerId);
  }

  @Patch("me/imoveis/:id/visibilidade")
  @ApiOperation({ summary: "Publica, oculta ou torna privado um imóvel" })
  changeVisibility(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(changeVisibilitySchema)) dto: ChangeVisibilityDto,
  ): Promise<ManagedProperty> {
    return this.publication.changeVisibility(brokerId, id, dto.visibility);
  }

  @Post("me/imoveis/publicar-todos")
  @ApiOperation({ summary: "Põe no ar todos os imóveis elegíveis que estão fora" })
  publishAll(@CurrentBroker("brokerId") brokerId: string): Promise<{ publicados: number }> {
    return this.publication.publishAllEligible(brokerId);
  }

  @Put("me/destaques")
  @ApiOperation({ summary: "Define os imóveis em destaque, na ordem enviada" })
  setHighlights(
    @CurrentBroker("brokerId") brokerId: string,
    @Body(new ZodValidationPipe(setHighlightsSchema)) dto: SetHighlightsDto,
  ): Promise<ManagedPropertiesResponse> {
    return this.publication.setHighlights(brokerId, dto.propertyIds);
  }
}
