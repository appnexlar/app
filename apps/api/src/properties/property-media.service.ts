import { join } from "node:path";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  ExternalMediaDto,
  MediaOrigin,
  PhotoRoom,
  PropertyMediaSummary,
  UpdateMediaDto,
} from "@nexlar/shared";
import type { MediaKind, PropertyMedia } from "@prisma/client";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";

const PHOTO_MIMES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  // HEIC aceito; conversão para JPEG fica no processamento em background.
  // TODO(backend): converter HEIC, corrigir orientação e gerar thumbnails.
  "image/heic": ".heic",
  "image/heif": ".heif",
};
const VIDEO_MIMES: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
};
const DOC_MIMES: Record<string, string> = {
  "application/pdf": ".pdf",
};

export interface UploadInput {
  filename: string;
  mimeType: string;
  buffer: Buffer;
  kind: "foto" | "video" | "planta" | "documento";
  origin?: MediaOrigin;
  authorized?: boolean;
  caption?: string;
  room?: PhotoRoom;
}

@Injectable()
export class PropertyMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly storage: StorageService,
  ) {}

  /**
   * Upload para a área PRIVADA do corretor:
   * {STORAGE_DIR}/brokers/{brokerId}/properties/{propertyId}/{images|videos}/{mediaId}{ext}
   * O arquivo nunca é acessível por URL direta: só via endpoint autenticado.
   * Na infra, este layout migra 1:1 para bucket S3-compatível (docs/06).
   */
  async upload(brokerId: string, propertyId: string, input: UploadInput): Promise<PropertyMediaSummary> {
    await this.getOwnedProperty(brokerId, propertyId);

    const allowed =
      input.kind === "video" ? VIDEO_MIMES : input.kind === "foto" ? PHOTO_MIMES : DOC_MIMES;
    const ext = allowed[input.mimeType];
    if (!ext) {
      throw new BadRequestException(
        input.kind === "video"
          ? "Formato de vídeo não suportado. Envie MP4 ou MOV."
          : input.kind === "foto"
            ? "Formato de foto não suportado. Envie JPEG, PNG, WebP ou HEIC."
            : "Formato não suportado. Envie um PDF.",
      );
    }

    const maxMb =
      input.kind === "video"
        ? this.config.get("MEDIA_MAX_VIDEO_MB", { infer: true })
        : this.config.get("MEDIA_MAX_PHOTO_MB", { infer: true });
    if (input.buffer.length > maxMb * 1024 * 1024) {
      throw new BadRequestException(`Arquivo acima do limite de ${maxMb}MB.`);
    }

    const maxCount =
      input.kind === "video"
        ? this.config.get("MEDIA_MAX_VIDEOS_PER_PROPERTY", { infer: true })
        : this.config.get("MEDIA_MAX_PHOTOS_PER_PROPERTY", { infer: true });
    const count = await this.prisma.propertyMedia.count({
      where: { propertyId, kind: input.kind, status: { not: "removido" } },
    });
    if (count >= maxCount) {
      throw new BadRequestException(`Limite de ${maxCount} arquivos deste tipo por imóvel.`);
    }

    const isFirstPhoto =
      input.kind === "foto" &&
      (await this.prisma.propertyMedia.count({
        where: { propertyId, kind: "foto", status: { not: "removido" } },
      })) === 0;

    const media = await this.prisma.propertyMedia.create({
      data: {
        brokerId,
        propertyId,
        kind: input.kind,
        origin: input.origin ?? "corretor",
        authorized: input.authorized ?? false,
        status: "enviando",
        mimeType: input.mimeType,
        sizeBytes: input.buffer.length,
        caption: input.caption,
        room: input.room,
        isCover: isFirstPhoto,
        sortOrder: count,
      },
    });

    const folder = input.kind === "video" ? "videos" : "images";
    const relativePath = join(
      "brokers",
      brokerId,
      "properties",
      propertyId,
      folder,
      `${media.id}${ext}`,
    );
    try {
      await this.storage.put(relativePath, input.buffer, input.mimeType);
    } catch {
      await this.prisma.propertyMedia.update({
        where: { id: media.id },
        data: { status: "falhou" },
      });
      throw new BadRequestException("Falha ao gravar o arquivo. Tente novamente.");
    }

    // MVP: vídeo fica pronto sem transcodificação.
    // TODO(backend): processar em background (1080p, thumbnail, bitrate).
    const done = await this.prisma.propertyMedia.update({
      where: { id: media.id },
      data: { status: "pronto", storagePath: relativePath },
    });
    return this.toSummary(done);
  }

  /** Nova tentativa quando o processamento falhou: volta para a fila. */
  async retry(brokerId: string, propertyId: string, mediaId: string): Promise<PropertyMediaSummary> {
    const media = await this.getOwnedMedia(brokerId, propertyId, mediaId);
    if (media.status !== "falhou") {
      throw new BadRequestException("Só é possível tentar novamente quando o envio falhou.");
    }
    const updated = await this.prisma.propertyMedia.update({
      where: { id: mediaId },
      data: { status: media.storagePath ? "pronto" : "falhou" },
    });
    return this.toSummary(updated);
  }

  async addExternal(
    brokerId: string,
    propertyId: string,
    dto: ExternalMediaDto,
  ): Promise<PropertyMediaSummary> {
    await this.getOwnedProperty(brokerId, propertyId);
    const media = await this.prisma.propertyMedia.create({
      data: {
        brokerId,
        propertyId,
        kind: "link_externo",
        origin: dto.origin,
        authorized: true,
        status: "pronto",
        externalUrl: dto.externalUrl,
        caption: dto.caption,
      },
    });
    return this.toSummary(media);
  }

  async updateMedia(
    brokerId: string,
    propertyId: string,
    mediaId: string,
    dto: UpdateMediaDto,
  ): Promise<PropertyMediaSummary> {
    await this.getOwnedMedia(brokerId, propertyId, mediaId);
    if (dto.isCover) {
      await this.prisma.propertyMedia.updateMany({
        where: { propertyId, isCover: true },
        data: { isCover: false },
      });
    }
    const updated = await this.prisma.propertyMedia.update({
      where: { id: mediaId },
      data: dto,
    });
    return this.toSummary(updated);
  }

  async removeMedia(brokerId: string, propertyId: string, mediaId: string): Promise<void> {
    const media = await this.getOwnedMedia(brokerId, propertyId, mediaId);
    if (media.storagePath) {
      await this.storage.remove(media.storagePath);
    }
    await this.prisma.propertyMedia.update({
      where: { id: mediaId },
      data: { status: "removido", storagePath: null },
    });
  }

  /** Apaga TODOS os arquivos físicos do imóvel (LGPD: excluir apaga o arquivo). */
  async removeAllFiles(brokerId: string, propertyId: string): Promise<void> {
    const all = await this.prisma.propertyMedia.findMany({
      where: { brokerId, propertyId, storagePath: { not: null } },
      select: { storagePath: true },
    });
    await Promise.all(all.map((m) => this.storage.remove(m.storagePath as string)));
  }

  /** Stream do arquivo, sempre validando a posse (isolamento por corretor). */
  async stream(brokerId: string, propertyId: string, mediaId: string) {
    const media = await this.getOwnedMedia(brokerId, propertyId, mediaId);
    if (!media.storagePath || media.status !== "pronto") {
      throw new NotFoundException("Arquivo não disponível.");
    }
    return {
      stream: await this.storage.getStream(media.storagePath),
      mimeType: media.mimeType ?? "application/octet-stream",
    };
  }

  private async getOwnedProperty(brokerId: string, propertyId: string) {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, brokerId },
      select: { id: true },
    });
    if (!property) throw new NotFoundException("Imóvel não encontrado.");
  }

  private async getOwnedMedia(brokerId: string, propertyId: string, mediaId: string) {
    const media = await this.prisma.propertyMedia.findFirst({
      where: { id: mediaId, propertyId, brokerId, status: { not: "removido" } },
    });
    if (!media) throw new NotFoundException("Mídia não encontrada.");
    return media;
  }

  private toSummary(m: PropertyMedia): PropertyMediaSummary {
    return {
      id: m.id,
      kind: m.kind as MediaKind,
      origin: m.origin,
      authorized: m.authorized,
      status: m.status,
      url: m.externalUrl ?? (m.storagePath ? `/api/properties/${m.propertyId}/media/${m.id}/file` : null),
      externalUrl: m.externalUrl,
      caption: m.caption,
      room: m.room,
      isCover: m.isCover,
      sortOrder: m.sortOrder,
    };
  }
}
