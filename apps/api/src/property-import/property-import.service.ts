import { Injectable, Logger } from "@nestjs/common";
import type { ImportPropertyDto, PropertyImportResult } from "@nexlar/shared";
import type { Prisma, PropertyImportStatus } from "@prisma/client";
import { RateLimitStore, formatWait } from "../common/rate-limit/rate-limit.store";
import { PrismaService } from "../prisma/prisma.service";
import { PropertiesService } from "../properties/properties.service";
import { extractFromHtml } from "./extraction";
import { ImportFailedError, type ImportErrorCode } from "./import-errors";
import { mapExtraction, type MappedImport } from "./import-mapper";
import { PageFetchService } from "./page-fetch.service";

/** Trava fina por corretor, além da trava por IP do controller. */
const BROKER_LIMIT = 15;
const BROKER_WINDOW_MS = 60 * 60 * 1000;

/**
 * Importação de imóvel por URL, síncrona de ponta a ponta: valida, busca,
 * extrai, mapeia e cria o RASCUNHO pelos serviços atuais de imóvel (nenhum
 * dado entra por fora do PropertiesService). Cada tentativa vira uma linha
 * de property_import: o que deu certo, o que falhou e por quê.
 */
@Injectable()
export class PropertyImportService {
  private readonly logger = new Logger(PropertyImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly properties: PropertiesService,
    private readonly fetcher: PageFetchService,
    private readonly rateLimit: RateLimitStore,
  ) {}

  async import(brokerId: string, dto: ImportPropertyDto): Promise<PropertyImportResult> {
    this.checkBrokerLimit(brokerId);
    const url = dto.url;
    const domain = new URL(url).hostname;

    // Mesmo link já na carteira: nada é criado até o corretor decidir.
    if (!dto.force) {
      const duplicates = await this.properties.findDuplicates(brokerId, { externalLink: url });
      if (duplicates.length > 0) {
        const importId = await this.persist(brokerId, {
          url,
          domain,
          status: "duplicada",
        });
        return {
          outcome: "duplicado",
          importId,
          propertyId: null,
          propertyCode: null,
          summary: { found: 0, review: 0, missing: 0 },
          fields: [],
          photosFound: 0,
          duplicates,
        };
      }
    }

    let mapped: MappedImport | null = null;
    try {
      const page = await this.fetcher.fetch(url);
      const canonical = extractFromHtml(page.html, page.finalUrl);
      mapped = mapExtraction(canonical, { url, domain });

      // Página viva, mas sem dado aproveitável: rascunho vazio só atrapalha.
      if (mapped.foundCount < 2) {
        throw new ImportFailedError(
          "sem_dados",
          "Encontramos pouca coisa neste anúncio para valer a importação. Você pode cadastrar o imóvel manualmente.",
        );
      }

      const created = await this.properties.create(brokerId, mapped.createDto);
      await this.properties.update(brokerId, created.id, mapped.updateDto);

      const importId = await this.persist(brokerId, {
        url,
        finalUrl: page.finalUrl,
        domain,
        status: "concluida",
        httpStatus: page.httpStatus,
        propertyId: created.id,
        payload: { fields: mapped.fields, photos: mapped.photosFound },
        summary: mapped.summary,
      });

      return {
        outcome: "criado",
        importId,
        propertyId: created.id,
        propertyCode: created.code,
        summary: mapped.summary,
        fields: mapped.fields,
        photosFound: mapped.photosFound,
        duplicates: [],
      };
    } catch (error) {
      const code: ImportErrorCode =
        error instanceof ImportFailedError ? error.code : "inacessivel";
      if (!(error instanceof ImportFailedError)) {
        this.logger.error(`Importação quebrou de forma inesperada: ${String(error)}`);
      }
      await this.persist(brokerId, {
        url,
        domain,
        status: "falhou",
        error: code,
        summary: mapped?.summary,
      }).catch(() => undefined);
      if (error instanceof ImportFailedError) throw error;
      throw new ImportFailedError(
        "inacessivel",
        "Não conseguimos importar este anúncio agora. Tente de novo ou cadastre manualmente.",
      );
    }
  }

  /** 15 importações por hora por corretor: sobra para trabalho, falta para robô. */
  private checkBrokerLimit(brokerId: string): void {
    const bucket = this.rateLimit.hit(`import-imovel:broker:${brokerId}`, BROKER_WINDOW_MS);
    if (bucket.count > BROKER_LIMIT) {
      const wait = Math.ceil((bucket.resetAt - Date.now()) / 1000);
      throw new ImportFailedError(
        "limite",
        `Muitas importações em pouco tempo. Aguarde ${formatWait(wait)} e tente de novo.`,
      );
    }
  }

  private async persist(
    brokerId: string,
    data: {
      url: string;
      finalUrl?: string;
      domain: string;
      status: PropertyImportStatus;
      httpStatus?: number;
      propertyId?: string;
      payload?: unknown;
      summary?: unknown;
      error?: string;
    },
  ): Promise<string> {
    const row = await this.prisma.propertyImport.create({
      data: {
        brokerId,
        url: data.url,
        finalUrl: data.finalUrl,
        domain: data.domain,
        status: data.status,
        httpStatus: data.httpStatus,
        propertyId: data.propertyId,
        payload: (data.payload as Prisma.InputJsonValue) ?? undefined,
        summary: (data.summary as Prisma.InputJsonValue) ?? undefined,
        error: data.error,
      },
    });
    return row.id;
  }
}
