import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { importPropertySchema, type ImportPropertyDto } from "@nexlar/shared";
import { CurrentBroker } from "../common/decorators/current-broker.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator";
import { PropertyImportService } from "./property-import.service";

@ApiTags("properties")
@ApiBearerAuth()
@Controller("properties/imports")
export class PropertyImportController {
  constructor(private readonly imports: PropertyImportService) {}

  /**
   * Síncrono de propósito: a página do anúncio responde em segundos e a API
   * não tem fila. A trava por IP aqui é a grossa; a fina, por corretor, mora
   * no serviço.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ name: "import-imovel", limit: 20, windowMs: 15 * 60 * 1000 })
  @ApiOperation({ summary: "Importa um imóvel a partir da URL pública do anúncio" })
  create(
    @CurrentBroker("brokerId") brokerId: string,
    @Body(new ZodValidationPipe(importPropertySchema)) dto: ImportPropertyDto,
  ) {
    return this.imports.import(brokerId, dto);
  }
}
