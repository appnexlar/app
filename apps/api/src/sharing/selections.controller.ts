import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  addSelectionItemSchema,
  createSelectionSchema,
  reorderSelectionItemsSchema,
  selectionCandidatesQuerySchema,
  updateSelectionItemSchema,
  updateSelectionSchema,
  type AddSelectionItemDto,
  type CreateSelectionDto,
  type PublicSelectionPageResponse,
  type ReorderSelectionItemsDto,
  type SelectionCandidatesQuery,
  type SelectionCandidatesResult,
  type SelectionSummary,
  type SelectionView,
  type UpdateSelectionDto,
  type UpdateSelectionItemDto,
} from "@nexlar/shared";
import { CurrentBroker } from "../common/decorators/current-broker.decorator";
import { LeadRefPipe, SelectionRefPipe } from "../common/pipes/short-code.pipe";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SelectionsService } from "./selections.service";
import { SelectionCandidatesService } from "./selection-candidates.service";
import { SelectionPublicService } from "./selection-public.service";

/**
 * Seleção personalizada de imóveis, lado administrativo. Todas as rotas são
 * autenticadas e isoladas pelo broker do token. As transições de estado são
 * endpoints próprios: o front nunca escreve status.
 */
@ApiTags("selections")
@ApiBearerAuth()
@Controller()
export class SelectionsController {
  constructor(
    private readonly selections: SelectionsService,
    private readonly candidates: SelectionCandidatesService,
    private readonly publicView: SelectionPublicService,
  ) {}

  @Get("selections/:id/preview")
  @ApiOperation({ summary: "Prévia autenticada: a página exatamente como a lead verá" })
  preview(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", SelectionRefPipe) id: string,
  ): Promise<PublicSelectionPageResponse> {
    return this.publicView.preview(brokerId, id);
  }

  @Get("selections/:id/candidates")
  @ApiOperation({ summary: "Pesquisar imóveis da carteira para esta seleção" })
  searchCandidates(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", SelectionRefPipe) id: string,
    @Query(new ZodValidationPipe(selectionCandidatesQuerySchema)) query: SelectionCandidatesQuery,
  ): Promise<SelectionCandidatesResult> {
    return this.candidates.search(brokerId, id, query);
  }

  @Post("selections")
  @ApiOperation({ summary: "Criar uma seleção em rascunho para uma lead" })
  create(
    @CurrentBroker("brokerId") brokerId: string,
    @Body(new ZodValidationPipe(createSelectionSchema)) dto: CreateSelectionDto,
  ): Promise<SelectionView> {
    return this.selections.create(brokerId, dto);
  }

  @Get("selections/:id")
  @ApiOperation({ summary: "Detalhe da seleção com os imóveis" })
  get(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", SelectionRefPipe) id: string,
  ): Promise<SelectionView> {
    return this.selections.get(brokerId, id);
  }

  @Get("leads/:id/selections")
  @ApiOperation({ summary: "Histórico de seleções da lead" })
  listForLead(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", LeadRefPipe) leadId: string,
  ): Promise<SelectionSummary[]> {
    return this.selections.listForLead(brokerId, leadId);
  }

  @Patch("selections/:id")
  @ApiOperation({ summary: "Editar mensagem e prazo do rascunho" })
  update(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", SelectionRefPipe) id: string,
    @Body(new ZodValidationPipe(updateSelectionSchema)) dto: UpdateSelectionDto,
  ): Promise<SelectionView> {
    return this.selections.update(brokerId, id, dto);
  }

  @Post("selections/:id/items")
  @ApiOperation({ summary: "Adicionar um imóvel à seleção" })
  addItem(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", SelectionRefPipe) id: string,
    @Body(new ZodValidationPipe(addSelectionItemSchema)) dto: AddSelectionItemDto,
  ): Promise<SelectionView> {
    return this.selections.addItem(brokerId, id, dto);
  }

  @Patch("selections/:id/items/reorder")
  @ApiOperation({ summary: "Reordenar os imóveis (ids na ordem final)" })
  reorder(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", SelectionRefPipe) id: string,
    @Body(new ZodValidationPipe(reorderSelectionItemsSchema)) dto: ReorderSelectionItemsDto,
  ): Promise<SelectionView> {
    return this.selections.reorderItems(brokerId, id, dto);
  }

  @Patch("selections/:id/items/:itemId")
  @ApiOperation({ summary: "Ajustar um imóvel da seleção (destaque, observação, posição)" })
  updateItem(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", SelectionRefPipe) id: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @Body(new ZodValidationPipe(updateSelectionItemSchema)) dto: UpdateSelectionItemDto,
  ): Promise<SelectionView> {
    return this.selections.updateItem(brokerId, id, itemId, dto);
  }

  @Delete("selections/:id/items/:itemId")
  @ApiOperation({ summary: "Remover um imóvel da seleção (não exclui o imóvel)" })
  removeItem(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", SelectionRefPipe) id: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
  ): Promise<SelectionView> {
    return this.selections.removeItem(brokerId, id, itemId);
  }

  @Post("selections/:id/activate")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Ativar a seleção (calcula a expiração no servidor)" })
  activate(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", SelectionRefPipe) id: string,
  ): Promise<SelectionView> {
    return this.selections.activate(brokerId, id);
  }

  @Post("selections/:id/revoke")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Revogar o acesso imediatamente" })
  revoke(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", SelectionRefPipe) id: string,
  ): Promise<SelectionView> {
    return this.selections.revoke(brokerId, id);
  }

  @Post("selections/:id/archive")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Arquivar a seleção (histórico permanece)" })
  archive(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", SelectionRefPipe) id: string,
  ): Promise<SelectionView> {
    return this.selections.archive(brokerId, id);
  }
}
