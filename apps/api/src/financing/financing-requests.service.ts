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
  FinancingApproveResult,
  FinancingExpiryDays,
  FinancingPayload,
  FinancingRequestCorrectionDto,
  FinancingRequestStatus,
  FinancingRequestSummary,
  FinancingRequestView,
  FinancingReviewView,
  FinancingSection,
  FinancingSendResult,
  UpdateFinancingRequestDto,
} from "@nexlar/shared";
import { FINANCING_PUBLIC_PATH, FINANCING_SECTIONS } from "@nexlar/shared";
import type { Prisma, FinancingDataRequest } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationService } from "../notification/notification.service";
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
  include: {
    lead: { select: { fullName: true; email: true; whatsapp: true; code: true } };
    property: { select: { title: true } };
  };
}>;

const INCLUDE_VIEW = {
  lead: { select: { fullName: true, email: true, whatsapp: true, code: true } },
  property: { select: { title: true } },
} satisfies Prisma.FinancingDataRequestInclude;

@Injectable()
export class FinancingRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ProductEventService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationService,
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

  // -------------------------------------------------------------------------
  // Revisão, correção e aprovação (Fatia E)
  // -------------------------------------------------------------------------

  /**
   * A revisão: a última versão congelada + histórico. Abrir uma solicitação
   * respondida marca em_revisao e o reviewedAt, no mesmo espírito da
   * expiração sob demanda: é o fato de olhar que muda o estado.
   */
  async review(brokerId: string, id: string): Promise<FinancingReviewView> {
    let atual = await this.expirarSePreciso(await this.buscar(brokerId, id));

    const submissions = await this.prisma.financingDataSubmission.findMany({
      where: { requestId: atual.id },
      orderBy: { version: "desc" },
    });
    if (submissions.length === 0) {
      throw new ConflictException("O cliente ainda não enviou as respostas desta solicitação.");
    }

    if (atual.status === "respondida") {
      atual = await this.prisma.financingDataRequest.update({
        where: { id: atual.id },
        data: { status: "em_revisao", reviewedAt: new Date() },
        include: INCLUDE_VIEW,
      });
    }

    const ultima = submissions[0];
    return {
      request: this.toView(atual),
      payload: ultima.payload as FinancingPayload,
      version: ultima.version,
      submittedAt: ultima.submittedAt.toISOString(),
      versions: submissions.map((s) => ({
        version: s.version,
        submittedAt: s.submittedAt.toISOString(),
        correctionNote: s.correctionNote,
        correctionFields: (s.correctionFields as FinancingSection[] | null) ?? null,
      })),
    };
  }

  /**
   * Pede correção: o link renasce com token NOVO (o antigo morre), prazo
   * renovado, e a nota fica na última versão para o cliente ler no
   * formulário. As seções pedidas voltam a "não concluídas" no rascunho.
   */
  async requestCorrection(
    brokerId: string,
    id: string,
    dto: FinancingRequestCorrectionDto,
  ): Promise<FinancingSendResult> {
    const atual = await this.expirarSePreciso(await this.buscar(brokerId, id));
    this.garantirTransicao(atual.status, "correcao_solicitada");
    if (!atual.lead.email) {
      throw new BadRequestException("A lead precisa de um e-mail para receber o código de acesso.");
    }

    const ultima = await this.prisma.financingDataSubmission.findFirst({
      where: { requestId: atual.id },
      orderBy: { version: "desc" },
      select: { id: true },
    });
    if (!ultima) {
      throw new ConflictException("Não há resposta enviada para corrigir.");
    }

    const token = randomBytes(16).toString("base64url");
    const dias = dto.expiresInDays ?? atual.expiresInDays ?? PRAZO_PADRAO_DIAS;
    const expiresAt = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);

    const updated = await this.prisma.$transaction(async (tx) => {
      // A nota vive na versão que a motivou: o histórico conta a conversa.
      await tx.financingDataSubmission.update({
        where: { id: ultima.id },
        data: { correctionNote: dto.note, correctionFields: dto.sections },
      });
      // As seções a corrigir voltam a pendentes; o resto permanece concluído.
      const draft = await tx.financingDataDraft.findUnique({
        where: { requestId: atual.id },
        select: { id: true, completedSections: true },
      });
      if (draft) {
        await tx.financingDataDraft.update({
          where: { id: draft.id },
          data: {
            completedSections: draft.completedSections.filter(
              (s) => !(dto.sections as string[]).includes(s),
            ),
          },
        });
      }
      const row = await tx.financingDataRequest.update({
        where: { id: atual.id },
        data: {
          status: "correcao_solicitada",
          tokenHash: this.hash(token),
          expiresInDays: dias,
          expiresAt,
        },
        include: INCLUDE_VIEW,
      });
      await tx.leadActivity.create({
        data: {
          brokerId,
          leadId: atual.leadId,
          type: "financiamento",
          description: "Correção solicitada nos dados do financiamento.",
          metadata: { requestId: atual.id, fields: dto.sections },
        },
      });
      await this.events.track(
        brokerId,
        {
          type: "FINANCING_DATA_CORRECTION_REQUESTED",
          source: "ui",
          entityType: "financing_request",
          entityId: atual.id,
          dedupeKey: `FINANCING_DATA_CORRECTION_REQUESTED:${atual.id}:v${atual.currentVersion}`,
        },
        tx,
      );
      return row;
    });

    const baseUrl = this.config.get<string>("WEB_APP_URL", "http://localhost:5173");
    const publicPath = `${FINANCING_PUBLIC_PATH}/${token}`;
    const mensagem =
      `Olá, ${primeiroNome(updated.lead.fullName)}! Precisamos de um pequeno ajuste nos dados da sua ` +
      `simulação: ${dto.note} Acesse com segurança: ${baseUrl}${publicPath} ` +
      `O código de acesso chega no seu e-mail.`;
    const whatsappUrl = updated.lead.whatsapp
      ? `https://wa.me/55${updated.lead.whatsapp}?text=${encodeURIComponent(mensagem)}`
      : null;

    return { request: this.toView(updated), publicPath, whatsappUrl };
  }

  /**
   * Aprova para simulação e aplica à ficha (decisão docs/09 §5: automático,
   * e só campo preenchido na submissão sobrescreve; branco não apaga nada).
   * Também pré-preenche uma Simulation pendente com o que o cliente contou.
   */
  async approve(brokerId: string, id: string): Promise<FinancingApproveResult> {
    let atual = await this.expirarSePreciso(await this.buscar(brokerId, id));
    // Aprovar direto de "respondida" vale: passa pela revisão implícita.
    if (atual.status === "respondida") {
      atual = await this.prisma.financingDataRequest.update({
        where: { id: atual.id },
        data: { status: "em_revisao", reviewedAt: new Date() },
        include: INCLUDE_VIEW,
      });
    }
    this.garantirTransicao(atual.status, "aprovada_para_simulacao");

    const ultima = await this.prisma.financingDataSubmission.findFirst({
      where: { requestId: atual.id },
      orderBy: { version: "desc" },
    });
    if (!ultima) throw new ConflictException("Não há resposta enviada para aprovar.");
    const payload = ultima.payload as FinancingPayload;

    const resultado = await this.prisma.$transaction(async (tx) => {
      const aplicado = await this.aplicarNaFicha(tx, brokerId, atual.leadId, payload);
      const simulation = await tx.simulation.create({
        data: {
          brokerId,
          leadId: atual.leadId,
          bank: payload.imovel?.preferredBank ?? "Caixa",
          propertyValue: payload.imovel?.propertyValue ?? null,
          downPayment: payload.entrada_fgts?.downPaymentAmount ?? null,
          financedAmount:
            payload.imovel?.propertyValue != null && payload.entrada_fgts?.downPaymentAmount != null
              ? Math.max(0, payload.imovel.propertyValue - payload.entrada_fgts.downPaymentAmount)
              : null,
          termMonths: payload.imovel?.desiredTermMonths ?? null,
          status: "pendente",
          resultNotes: `Pré-preenchida pela coleta de dados (solicitação #${atual.code}, versão ${ultima.version}).`,
        },
      });
      const row = await tx.financingDataRequest.update({
        where: { id: atual.id },
        data: { status: "aprovada_para_simulacao", approvedAt: new Date() },
        include: INCLUDE_VIEW,
      });
      await tx.leadActivity.create({
        data: {
          brokerId,
          leadId: atual.leadId,
          type: "financiamento",
          description: "Dados aprovados para simulação e aplicados à ficha.",
          metadata: { requestId: atual.id, version: ultima.version },
        },
      });
      // Auditoria conta O QUE mudou (contagens), nunca os valores.
      await tx.auditLog.create({
        data: {
          brokerId,
          action: "financing_data_approved",
          entityType: "financing_request",
          entityId: atual.id,
          metadata: {
            version: ultima.version,
            updatedFields: aplicado.updatedFields,
            createdParticipants: aplicado.createdParticipants,
          },
        },
      });
      await this.events.track(
        brokerId,
        {
          type: "FINANCING_DATA_APPROVED_FOR_SIMULATION",
          source: "ui",
          entityType: "financing_request",
          entityId: atual.id,
          dedupeKey: `FINANCING_DATA_APPROVED_FOR_SIMULATION:${atual.id}`,
        },
        tx,
      );
      return { row, aplicado, simulationId: simulation.id };
    });

    return {
      request: this.toView(resultado.row),
      updatedFields: resultado.aplicado.updatedFields,
      createdParticipants: resultado.aplicado.createdParticipants,
      simulationId: resultado.simulationId,
    };
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

  /**
   * Regra de segurança da aprovação (docs/09 §5): a submissão imutável
   * preserva o que o cliente mandou; na ficha, só campo PREENCHIDO
   * sobrescreve. Campo em branco nunca apaga o que o corretor já tinha.
   */
  private async aplicarNaFicha(
    tx: Prisma.TransactionClient,
    brokerId: string,
    leadId: string,
    payload: FinancingPayload,
  ): Promise<{ updatedFields: number; createdParticipants: number }> {
    const d = payload.dados_pessoais;
    const t = payload.trabalho_renda;
    const e = payload.entrada_fgts;
    const im = payload.imovel;

    // Descarta chaves vazias: o que sobra é o que pode tocar a ficha.
    const preenchidos = <T extends Record<string, unknown>>(obj: T): Partial<T> =>
      Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined)) as Partial<T>;

    const perfil = preenchidos({
      cpf: d?.cpf ?? null,
      birthDate: d?.birthDate ? new Date(`${d.birthDate}T00:00:00Z`) : null,
      maritalStatus: d?.maritalStatus ?? null,
      nationality: d?.nationality ?? null,
      cep: d?.cep ?? null,
      street: d?.address ?? null,
      city: d?.city ?? null,
      state: d?.state ?? null,
    });

    const TIPO_DE_RENDA: Record<string, "assalariado" | "autonomo" | "empresario" | "aposentado" | "outro"> = {
      assalariado: "assalariado",
      autonomo: "autonomo",
      empresario: "empresario",
      aposentado: "aposentado",
    };
    const participantes = payload.participantes?.participants ?? [];
    const financeiro = preenchidos({
      incomeType: t?.situation ? (TIPO_DE_RENDA[t.situation] ?? "outro") : null,
      monthlyIncome: t?.netMonthlyIncome ?? t?.grossMonthlyIncome ?? null,
      occupation: t?.occupation ?? null,
      downPayment: e?.downPaymentAmount ?? null,
      hasFgts:
        im?.useFgts ?? ((e?.downPaymentSources ?? [])?.includes("fgts") ? true : null),
      preferredBank: im?.preferredBank ?? null,
      hasIncomeComposition: participantes.length > 0 ? true : null,
      dependentsCount: d?.dependentsCount ?? null,
    });

    let updatedFields = 0;
    if (Object.keys(perfil).length > 0) {
      await tx.clientProfile.upsert({
        where: { leadId },
        create: { brokerId, leadId, ...perfil },
        update: perfil,
      });
      updatedFields += Object.keys(perfil).length;
    }
    if (Object.keys(financeiro).length > 0) {
      await tx.clientFinancial.upsert({
        where: { leadId },
        create: { brokerId, leadId, ...financeiro },
        update: financeiro,
      });
      updatedFields += Object.keys(financeiro).length;
    }

    // Participantes: acrescenta quem a ficha ainda não conhece (por CPF ou,
    // sem CPF, por nome). Nunca remove nem edita os existentes.
    let createdParticipants = 0;
    if (participantes.length > 0) {
      const existentes = await tx.clientParticipant.findMany({
        where: { leadId, brokerId },
        select: { cpf: true, fullName: true },
      });
      const porCpf = new Set(existentes.map((x) => x.cpf).filter(Boolean));
      const porNome = new Set(existentes.map((x) => x.fullName.trim().toLowerCase()));
      for (const p of participantes) {
        const jaExiste = p.cpf ? porCpf.has(p.cpf) : porNome.has(p.fullName.trim().toLowerCase());
        if (jaExiste) continue;
        await tx.clientParticipant.create({
          data: {
            brokerId,
            leadId,
            relation: p.relation,
            fullName: p.fullName,
            cpf: p.cpf ?? null,
            phone: p.phone ?? null,
            email: p.email ?? null,
            notes:
              p.monthlyIncome != null
                ? `Renda mensal declarada: R$ ${p.monthlyIncome.toLocaleString("pt-BR")}`
                : null,
          },
        });
        createdParticipants += 1;
      }
    }

    return { updatedFields, createdParticipants };
  }

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

  /**
   * Prazo vencido com link vivo vira "expirada" antes de qualquer resposta.
   * A expiração é um fato do negócio, não só uma troca de rótulo: o corretor
   * é avisado, e o evento entra no histórico (dedupe garante uma vez só).
   */
  private async expirarSePreciso(row: RequestRecord): Promise<RequestRecord> {
    const vivo = COM_LINK_ATIVO.includes(row.status as FinancingRequestStatus);
    if (!vivo || !row.expiresAt || row.expiresAt.getTime() > Date.now()) return row;

    const expirada = await this.prisma.$transaction(async (tx) => {
      const atualizada = await tx.financingDataRequest.update({
        where: { id: row.id },
        data: { status: "expirada", tokenHash: null },
        include: INCLUDE_VIEW,
      });
      await this.events.track(
        row.brokerId,
        {
          type: "FINANCING_DATA_REQUEST_EXPIRED",
          source: "system",
          entityType: "financing_request",
          entityId: row.id,
          dedupeKey: `FINANCING_DATA_REQUEST_EXPIRED:${row.id}`,
        },
        tx,
      );
      return atualizada;
    });

    await this.notifications.create(
      row.brokerId,
      "financiamento_expirado",
      "Prazo do financiamento terminou",
      `${row.lead.fullName} não enviou os dados a tempo. Gere um link novo se ainda quiser a simulação.`,
      `/leads/${row.lead.code}`,
    );
    return expirada;
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
