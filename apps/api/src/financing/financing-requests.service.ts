import { createHash, randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  CreateFinancingRequestDto,
  FinancingExpiryDays,
  FinancingRequestStatus,
  FinancingRequestSummary,
  FinancingRequestView,
  FinancingSection,
  FinancingSendResult,
  UpdateFinancingRequestDto,
} from "@nexlar/shared";
import { FINANCING_PUBLIC_PATH, FINANCING_SECTIONS } from "@nexlar/shared";
import type { Prisma, FinancingDataRequest } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ProductEventService } from "../guidance/product-event.service";

/**
 * Coleta de dados para simulação de financiamento, lado do corretor
 * (docs/09). Aqui mora a máquina de estados; o front nunca escreve status,
 * cada transição é um endpoint próprio.
 *
 *   rascunho             -> enviada | arquivada
 *   enviada              -> respondida | expirada | revogada | arquivada
 *   respondida           -> em_revisao | arquivada
 *   em_revisao           -> correcao_solicitada | aprovada_para_simulacao | arquivada
 *   correcao_solicitada  -> respondida | expirada | revogada | arquivada
 *   expirada             -> enviada | arquivada        (reenviar gera token novo)
 *   revogada             -> enviada | arquivada        (idem)
 *   aprovada_para_simulacao -> arquivada
 *   arquivada            -> (fim)
 *
 * A expiração é avaliada sob demanda, como na seleção: leitura que encontra
 * prazo vencido persiste "expirada" antes de responder. O relógio do banco
 * decide, nunca o front.
 */

const TRANSITIONS: Record<FinancingRequestStatus, FinancingRequestStatus[]> = {
  rascunho: ["enviada", "arquivada"],
  enviada: ["respondida", "expirada", "revogada", "arquivada"],
  respondida: ["em_revisao", "arquivada"],
  em_revisao: ["correcao_solicitada", "aprovada_para_simulacao", "arquivada"],
  correcao_solicitada: ["respondida", "expirada", "revogada", "arquivada"],
  aprovada_para_simulacao: ["arquivada"],
  expirada: ["enviada", "arquivada"],
  revogada: ["enviada", "arquivada"],
  arquivada: [],
};

/** Estados em que o link público está vivo e o prazo corre. */
const COM_LINK_ATIVO: FinancingRequestStatus[] = ["enviada", "correcao_solicitada"];

const PRAZO_PADRAO_DIAS: FinancingExpiryDays = 7;

type RequestRecord = Prisma.FinancingDataRequestGetPayload<{
  include: { lead: { select: { fullName: true; email: true; whatsapp: true } }; property: { select: { title: true } } };
}>;

const INCLUDE_VIEW = {
  lead: { select: { fullName: true, email: true, whatsapp: true } },
  property: { select: { title: true } },
} satisfies Prisma.FinancingDataRequestInclude;

@Injectable()
export class FinancingRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ProductEventService,
    private readonly config: ConfigService,
  ) {}

  // -------------------------------------------------------------------------
  // Criação e configuração (rascunho)
  // -------------------------------------------------------------------------

  async create(brokerId: string, dto: CreateFinancingRequestDto): Promise<FinancingRequestView> {
    const lead = await this.prisma.lead.findFirst({
      where: { id: dto.leadId, brokerId },
      select: { id: true, email: true },
    });
    if (!lead) throw new NotFoundException("Lead não encontrada.");

    if (dto.propertyId) await this.garantirImovel(brokerId, dto.propertyId);

    const created = await this.prisma.$transaction(async (tx) => {
      // O OTP vai por e-mail (docs/09 §5). O campo do corretor PREENCHE a
      // ficha quando ela não tem e-mail; nunca sobrescreve um existente,
      // porque a ficha é a fonte e se edita lá.
      if (dto.leadEmail && !lead.email) {
        await tx.lead.update({ where: { id: lead.id }, data: { email: dto.leadEmail } });
      }

      const request = await tx.financingDataRequest.create({
        data: {
          brokerId,
          leadId: lead.id,
          propertyId: dto.propertyId ?? null,
          status: "rascunho",
          requestedSections: dto.sections ?? [...FINANCING_SECTIONS],
          message: dto.message ?? null,
          expiresInDays: dto.expiresInDays ?? PRAZO_PADRAO_DIAS,
        },
        include: INCLUDE_VIEW,
      });

      await this.events.track(
        brokerId,
        {
          type: "FINANCING_DATA_REQUEST_CREATED",
          source: "ui",
          entityType: "financing_request",
          entityId: request.id,
          dedupeKey: `FINANCING_DATA_REQUEST_CREATED:${request.id}`,
        },
        tx,
      );
      return request;
    });

    return this.toView(created);
  }

  async update(brokerId: string, id: string, dto: UpdateFinancingRequestDto): Promise<FinancingRequestView> {
    const atual = await this.buscar(brokerId, id);
    if (atual.status !== "rascunho") {
      throw new ConflictException("Só um rascunho pode ser configurado. Depois do envio, revogue e reenvie.");
    }
    if (dto.propertyId) await this.garantirImovel(brokerId, dto.propertyId);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.leadEmail) {
        const lead = await tx.lead.findFirst({ where: { id: atual.leadId, brokerId }, select: { email: true } });
        if (lead && !lead.email) {
          await tx.lead.update({ where: { id: atual.leadId }, data: { email: dto.leadEmail } });
        }
      }
      return tx.financingDataRequest.update({
        where: { id: atual.id },
        data: {
          propertyId: dto.propertyId === undefined ? undefined : dto.propertyId,
          requestedSections: dto.sections ?? undefined,
          message: dto.message === undefined ? undefined : dto.message,
          expiresInDays: dto.expiresInDays ?? undefined,
        },
        include: INCLUDE_VIEW,
      });
    });
    return this.toView(updated);
  }

  // -------------------------------------------------------------------------
  // Leitura
  // -------------------------------------------------------------------------

  async list(brokerId: string, leadId?: string): Promise<FinancingRequestSummary[]> {
    const rows = await this.prisma.financingDataRequest.findMany({
      where: { brokerId, ...(leadId ? { leadId } : {}) },
      include: INCLUDE_VIEW,
      orderBy: { createdAt: "desc" },
    });
    const vivos = await Promise.all(rows.map((r) => this.expirarSePreciso(r)));
    return vivos.map((r) => this.toSummary(r));
  }

  async get(brokerId: string, id: string): Promise<FinancingRequestView> {
    const row = await this.buscar(brokerId, id);
    return this.toView(await this.expirarSePreciso(row));
  }

  // -------------------------------------------------------------------------
  // Transições
  // -------------------------------------------------------------------------

  /**
   * Envia (ou reenvia): gera o token do link, guarda só o hash e devolve o
   * caminho público UMA única vez. Reenvio de expirada/revogada troca o
   * token: o link antigo morre de vez.
   */
  async send(brokerId: string, id: string): Promise<FinancingSendResult> {
    const atual = await this.expirarSePreciso(await this.buscar(brokerId, id));
    this.garantirTransicao(atual.status, "enviada");

    if (atual.requestedSections.length === 0) {
      throw new BadRequestException("Escolha pelo menos um bloco de informações antes de enviar.");
    }
    if (!atual.lead.email) {
      throw new BadRequestException(
        "A lead precisa de um e-mail para receber o código de acesso. Informe o e-mail antes de enviar.",
      );
    }

    const token = randomBytes(16).toString("base64url");
    const dias = atual.expiresInDays ?? PRAZO_PADRAO_DIAS;
    const expiresAt = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.financingDataRequest.update({
        where: { id: atual.id },
        data: {
          status: "enviada",
          tokenHash: this.hash(token),
          expiresAt,
          revokedAt: null,
        },
        include: INCLUDE_VIEW,
      });
      await tx.leadActivity.create({
        data: {
          brokerId,
          leadId: atual.leadId,
          type: "financiamento",
          description: "Solicitação de dados para simulação enviada.",
          metadata: { requestId: atual.id, code: atual.code },
        },
      });
      await this.events.track(
        brokerId,
        {
          type: "FINANCING_DATA_REQUEST_SENT",
          source: "ui",
          entityType: "financing_request",
          entityId: atual.id,
          dedupeKey: `FINANCING_DATA_REQUEST_SENT:${atual.id}`,
        },
        tx,
      );
      return row;
    });

    const baseUrl = this.config.get<string>("WEB_APP_URL", "http://localhost:5173");
    const publicPath = `${FINANCING_PUBLIC_PATH}/${token}`;
    const mensagem =
      `Olá, ${primeiroNome(updated.lead.fullName)}! Para prepararmos a simulação do seu financiamento, ` +
      `preencha seus dados com segurança neste link: ${baseUrl}${publicPath} ` +
      `O código de acesso chega no seu e-mail.`;
    const whatsappUrl = updated.lead.whatsapp
      ? `https://wa.me/55${updated.lead.whatsapp}?text=${encodeURIComponent(mensagem)}`
      : null;

    return { request: this.toView(updated), publicPath, whatsappUrl };
  }

  /** Revogação imediata: o link morre agora, o que já foi enviado permanece. */
  async revoke(brokerId: string, id: string): Promise<FinancingRequestView> {
    const atual = await this.expirarSePreciso(await this.buscar(brokerId, id));
    this.garantirTransicao(atual.status, "revogada");

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.financingDataRequest.update({
        where: { id: atual.id },
        data: { status: "revogada", revokedAt: new Date(), tokenHash: null },
        include: INCLUDE_VIEW,
      });
      await tx.auditLog.create({
        data: {
          brokerId,
          action: "financing_request_revoked",
          entityType: "financing_request",
          entityId: atual.id,
        },
      });
      await this.events.track(
        brokerId,
        {
          type: "FINANCING_DATA_REQUEST_REVOKED",
          source: "ui",
          entityType: "financing_request",
          entityId: atual.id,
          dedupeKey: `FINANCING_DATA_REQUEST_REVOKED:${atual.id}`,
        },
        tx,
      );
      return row;
    });
    return this.toView(updated);
  }

  async archive(brokerId: string, id: string): Promise<FinancingRequestView> {
    const atual = await this.expirarSePreciso(await this.buscar(brokerId, id));
    this.garantirTransicao(atual.status, "arquivada");
    const updated = await this.prisma.financingDataRequest.update({
      where: { id: atual.id },
      // Arquivar também mata o link: histórico preservado, acesso não.
      data: { status: "arquivada", archivedAt: new Date(), tokenHash: null },
      include: INCLUDE_VIEW,
    });
    return this.toView(updated);
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------

  private hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private async garantirImovel(brokerId: string, propertyId: string): Promise<void> {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, brokerId },
      select: { status: true },
    });
    if (!property) throw new NotFoundException("Imóvel não encontrado.");
    if (property.status === "arquivado") {
      throw new BadRequestException("Imóvel arquivado não pode ancorar uma solicitação.");
    }
  }

  private async buscar(brokerId: string, id: string): Promise<RequestRecord> {
    const row = await this.prisma.financingDataRequest.findFirst({
      where: { id, brokerId },
      include: INCLUDE_VIEW,
    });
    if (!row) throw new NotFoundException("Solicitação não encontrada.");
    return row;
  }

  private garantirTransicao(de: FinancingRequestStatus, para: FinancingRequestStatus): void {
    if (!TRANSITIONS[de].includes(para)) {
      throw new ConflictException(`Uma solicitação ${de.replace(/_/g, " ")} não pode ir para ${para.replace(/_/g, " ")}.`);
    }
  }

  /** Prazo vencido com link vivo vira "expirada" antes de qualquer resposta. */
  private async expirarSePreciso(row: RequestRecord): Promise<RequestRecord> {
    const vivo = COM_LINK_ATIVO.includes(row.status as FinancingRequestStatus);
    if (!vivo || !row.expiresAt || row.expiresAt.getTime() > Date.now()) return row;
    return this.prisma.financingDataRequest.update({
      where: { id: row.id },
      data: { status: "expirada", tokenHash: null },
      include: INCLUDE_VIEW,
    });
  }

  private toSummary(r: RequestRecord): FinancingRequestSummary {
    return {
      id: r.id,
      code: r.code,
      status: r.status as FinancingRequestStatus,
      leadId: r.leadId,
      propertyId: r.propertyId,
      propertyTitle: r.property?.title ?? null,
      sections: r.requestedSections as FinancingSection[],
      message: r.message,
      expiresInDays: (r.expiresInDays as FinancingExpiryDays | null) ?? null,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      firstOpenedAt: r.firstOpenedAt?.toISOString() ?? null,
      submittedAt: r.submittedAt?.toISOString() ?? null,
      approvedAt: r.approvedAt?.toISOString() ?? null,
      currentVersion: r.currentVersion,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  private toView(r: RequestRecord): FinancingRequestView {
    return {
      ...this.toSummary(r),
      leadName: r.lead.fullName,
      leadEmail: r.lead.email,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      revokedAt: r.revokedAt?.toISOString() ?? null,
      archivedAt: r.archivedAt?.toISOString() ?? null,
      startedAt: r.startedAt?.toISOString() ?? null,
    };
  }
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

export type { FinancingDataRequest };
