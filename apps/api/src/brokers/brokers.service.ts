import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { extname } from "node:path";
import type { Readable } from "node:stream";
import type { Broker } from "@prisma/client";
import type { BrokerProfile, SubmitCreciDto } from "@nexlar/shared";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";

/** O documento do CRECI é foto ou PDF, e não precisa ser grande. */
const TIPOS_ACEITOS = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const TAMANHO_MAXIMO = 10 * 1024 * 1024; // 10 MB

export interface CreciUpload {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

/**
 * Perfil do corretor logado. Sempre opera sobre o broker do token, nunca sobre
 * um id vindo do payload: não há como um corretor ler ou editar o perfil de
 * outro, porque o id nem entra na conversa.
 */
@Injectable()
export class BrokersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async getMe(brokerId: string): Promise<BrokerProfile> {
    const broker = await this.prisma.broker.findUnique({ where: { id: brokerId } });
    // O guard já garantiu que a conta existe; isto cobre a corrida rara de a
    // conta ser apagada entre o guard e aqui.
    if (!broker) throw new NotFoundException("Conta não encontrada.");
    return toProfile(broker);
  }

  async updateMe(brokerId: string, dto: Record<string, string | undefined>): Promise<BrokerProfile> {
    // Campo vazio (string "") vira null no banco, para "apagar" a imobiliária
    // não gravar uma string em branco. Campo ausente não é tocado.
    const data: Record<string, string | null> = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.phone !== undefined) data.phone = dto.phone || null;
    if (dto.agencyName !== undefined) data.agencyName = dto.agencyName || null;
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl || null;

    const broker = await this.prisma.broker.update({ where: { id: brokerId }, data });
    return toProfile(broker);
  }

  /**
   * Envia o CRECI para conferência manual. Reenviar por cima de uma recusa é
   * o caminho normal: o corretor corrige o que foi apontado e manda de novo,
   * então o motivo antigo é limpo junto.
   *
   * Não deixa reenviar enquanto está pendente, para não trocar o documento
   * embaixo de quem já está conferindo, nem depois de aprovado, porque mudar
   * o número do CRECI de uma conta verificada precisa passar por análise de
   * novo, e isso é decisão de quem revisa, não do dono da conta.
   */
  async submitCreci(
    brokerId: string,
    dto: SubmitCreciDto,
    upload: CreciUpload,
  ): Promise<BrokerProfile> {
    const atual = await this.prisma.broker.findUnique({ where: { id: brokerId } });
    if (!atual) throw new NotFoundException("Conta não encontrada.");

    if (atual.creciStatus === "pendente") {
      throw new BadRequestException(
        "Seu CRECI já está em análise. Aguarde o resultado antes de enviar de novo.",
      );
    }
    if (atual.creciStatus === "aprovado") {
      throw new BadRequestException(
        "Seu CRECI já está verificado. Fale com o suporte se precisar alterá-lo.",
      );
    }

    if (!TIPOS_ACEITOS.includes(upload.mimeType)) {
      throw new BadRequestException("Envie uma foto (JPG, PNG ou WEBP) ou um PDF.");
    }
    if (upload.buffer.length > TAMANHO_MAXIMO) {
      throw new BadRequestException("O arquivo passa de 10 MB. Envie uma versão menor.");
    }

    // Nome aleatório: o nome original do arquivo pode conter o nome da pessoa
    // e vaza no caminho do storage sem necessidade.
    const extensao = extname(upload.filename).slice(0, 10) || "";
    const chave = `brokers/${brokerId}/creci/${randomBytes(12).toString("hex")}${extensao}`;
    await this.storage.put(chave, upload.buffer, upload.mimeType);

    // Documento antigo não fica para trás ocupando espaço e risco.
    if (atual.creciDocumentKey) {
      await this.storage.remove(atual.creciDocumentKey).catch(() => undefined);
    }

    const broker = await this.prisma.broker.update({
      where: { id: brokerId },
      data: {
        creci: dto.creci,
        creciUf: dto.creciUf,
        creciStatus: "pendente",
        creciDocumentKey: chave,
        creciSubmittedAt: new Date(),
        creciReviewedAt: null,
        creciRejectionReason: null,
      },
    });
    return toProfile(broker);
  }

  /**
   * Devolve o documento enviado, só para o próprio dono. Bucket é privado: não
   * existe URL pública para isto, quem serve é a API depois de conferir a posse.
   */
  async getCreciDocument(brokerId: string): Promise<{ stream: Readable; mimeType: string }> {
    const broker = await this.prisma.broker.findUnique({ where: { id: brokerId } });
    if (!broker?.creciDocumentKey) {
      throw new NotFoundException("Nenhum documento enviado.");
    }
    const stream = await this.storage.getStream(broker.creciDocumentKey);
    const ext = extname(broker.creciDocumentKey).toLowerCase();
    const mimeType =
      ext === ".pdf"
        ? "application/pdf"
        : ext === ".png"
          ? "image/png"
          : ext === ".webp"
            ? "image/webp"
            : "image/jpeg";
    return { stream, mimeType };
  }
}

/** Mesma forma do perfil devolvido pelo auth, para o front ter um só formato. */
function toProfile(broker: Broker): BrokerProfile {
  return {
    id: broker.id,
    fullName: broker.fullName,
    email: broker.email,
    phone: broker.phone,
    creci: broker.creci,
    creciUf: broker.creciUf,
    creciStatus: broker.creciStatus,
    creciRejectionReason: broker.creciRejectionReason,
    agencyName: broker.agencyName,
    avatarUrl: broker.avatarUrl,
    emailVerified: broker.emailVerifiedAt !== null,
    createdAt: broker.createdAt.toISOString(),
    updatedAt: broker.updatedAt.toISOString(),
  };
}
