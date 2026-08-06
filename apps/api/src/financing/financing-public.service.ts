import { createHash, randomInt } from "node:crypto";
import {
  BadRequestException,
  GoneException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  FinancingPayload,
  FinancingPublicForm,
  FinancingPublicState,
  FinancingSaveSectionDto,
  FinancingSection,
  FinancingSubmitResult,
} from "@nexlar/shared";
import {
  FINANCING_CONSENT_ORIGIN,
  FINANCING_CONSENT_PURPOSE,
  FINANCING_CONSENT_VERSION,
  FINANCING_SECTION_SCHEMAS,
  financingSubmissionPendencies,
} from "@nexlar/shared";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { NotificationService } from "../notification/notification.service";
import { ProductEventService } from "../guidance/product-event.service";

/**
 * O lado do cliente da coleta de dados (docs/09): abrir o link, confirmar a
 * identidade pelo código de e-mail e preencher por seções, com salvamento.
 *
 * Segurança em camadas, nesta ordem:
 * 1. o token da URL (128 bits, só o hash no banco) encontra a solicitação;
 * 2. o código de 6 dígitos por e-mail prova que quem abriu tem acesso à caixa
 *    da lead, com validade curta e limite de tentativas, porque código curto
 *    se adivinha por força bruta e link longo não;
 * 3. a sessão pós-código é um cookie httpOnly assinado, amarrado à
 *    solicitação, com vida curta. Cookie de uma solicitação não abre outra.
 *
 * Nenhuma resposta daqui carrega dado que o próprio cliente não forneceu,
 * fora o primeiro nome e o e-mail mascarado.
 */

export const FINANCING_COOKIE = "nexlar_financiamento";
const CODIGO_VALIDADE_MS = 10 * 60 * 1000;
const CODIGO_MAX_TENTATIVAS = 5;
const SESSAO_VALIDADE = "2h";

/** Estados em que o link responde e o formulário aceita escrita. */
const ABERTAS = ["enviada", "correcao_solicitada"] as const;

type PublicRecord = Prisma.FinancingDataRequestGetPayload<{
  include: {
    lead: { select: { fullName: true; email: true; code: true } };
    broker: { select: { fullName: true } };
    draft: true;
    submissions: {
      select: { correctionNote: true; correctionFields: true };
      orderBy: { version: "desc" };
      take: 1;
    };
  };
}>;

const INCLUDE_PUBLIC = {
  lead: { select: { fullName: true, email: true, code: true } },
  broker: { select: { fullName: true } },
  draft: true,
  // A última versão carrega a nota de correção, quando houver.
  submissions: {
    select: { correctionNote: true, correctionFields: true },
    orderBy: { version: "desc" },
    take: 1,
  },
} satisfies Prisma.FinancingDataRequestInclude;

interface SessaoPayload {
  scope: "financing-form";
  requestId: string;
}

@Injectable()
export class FinancingPublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly events: ProductEventService,
    private readonly notifications: NotificationService,
  ) {}

  // -------------------------------------------------------------------------
  // Estado do link (sem identidade confirmada)
  // -------------------------------------------------------------------------

  async state(token: string): Promise<FinancingPublicState> {
    const request = await this.resolver(token);
    return {
      state: this.estadoPublico(request),
      leadFirstName: primeiroNome(request.lead.fullName),
      brokerName: request.broker.fullName,
      emailHint: request.lead.email ? mascararEmail(request.lead.email) : null,
      sections: request.requestedSections as FinancingSection[],
      message: request.message,
      expiresAt: request.expiresAt?.toISOString() ?? null,
    };
  }

  // -------------------------------------------------------------------------
  // Código de acesso
  // -------------------------------------------------------------------------

  async requestCode(token: string): Promise<void> {
    const request = await this.resolverAberta(token);
    if (!request.lead.email) {
      // Sem e-mail não há para onde mandar; o corretor precisa completar a ficha.
      throw new BadRequestException("Peça ao corretor para conferir seu e-mail e reenviar o link.");
    }

    // randomInt é criptográfico e o intervalo mantém sempre 6 dígitos.
    const code = String(randomInt(100000, 1000000));
    let primeiraAbertura = false;

    await this.prisma.$transaction(async (tx) => {
      // Um código vivo por vez: pedir outro mata o anterior, o que também
      // zera qualquer contagem de tentativas acumulada nele.
      await tx.financingAccessCode.updateMany({
        where: { requestId: request.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.financingAccessCode.create({
        data: {
          brokerId: request.brokerId,
          requestId: request.id,
          codeHash: sha256(code),
          expiresAt: new Date(Date.now() + CODIGO_VALIDADE_MS),
        },
      });
      if (!request.firstOpenedAt) {
        await tx.financingDataRequest.update({
          where: { id: request.id },
          data: { firstOpenedAt: new Date() },
        });
        await this.events.track(
          request.brokerId,
          {
            type: "FINANCING_DATA_REQUEST_OPENED",
            source: "api",
            entityType: "financing_request",
            entityId: request.id,
            dedupeKey: `FINANCING_DATA_REQUEST_OPENED:${request.id}`,
          },
          tx,
        );
        primeiraAbertura = true;
      }
    });

    // Só na primeira abertura: saber que o cliente começou vale um aviso; a
    // cada pedido de código, não.
    if (primeiraAbertura) {
      await this.notifications.create(
        request.brokerId,
        "financiamento_aberto",
        "Cliente abriu o formulário",
        `${request.lead.fullName} abriu o link dos dados para simulação.`,
        `/leads/${request.lead.code}`,
      );
    }

    await this.email.sendFinancingAccessCode({
      to: request.lead.email,
      firstName: primeiroNome(request.lead.fullName),
      brokerName: request.broker.fullName,
      code,
    });
  }

  async verify(token: string, code: string, reply: FastifyReply): Promise<FinancingPublicForm> {
    const request = await this.resolverAberta(token);

    const registro = await this.prisma.financingAccessCode.findFirst({
      where: { requestId: request.id, usedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!registro || registro.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("Código vencido. Peça um novo.");
    }
    if (registro.attemptCount >= CODIGO_MAX_TENTATIVAS) {
      throw new BadRequestException("Muitas tentativas. Peça um código novo.");
    }
    if (registro.codeHash !== sha256(code)) {
      await this.prisma.financingAccessCode.update({
        where: { id: registro.id },
        data: { attemptCount: { increment: 1 } },
      });
      throw new BadRequestException("Código incorreto. Confira o e-mail e tente de novo.");
    }

    await this.prisma.financingAccessCode.update({
      where: { id: registro.id },
      data: { usedAt: new Date() },
    });

    const sessao: SessaoPayload = { scope: "financing-form", requestId: request.id };
    const jwt = await this.jwt.signAsync(sessao, {
      secret: this.config.get<string>("JWT_ACCESS_SECRET"),
      expiresIn: SESSAO_VALIDADE,
    });
    reply.setCookie(FINANCING_COOKIE, jwt, {
      httpOnly: true,
      secure: this.config.get<string>("NODE_ENV") === "production",
      sameSite: "lax",
      // Só as rotas deste formulário recebem o cookie.
      path: "/api/public/financiamento",
      maxAge: 2 * 60 * 60,
    });

    return this.montarFormulario(request);
  }

  // -------------------------------------------------------------------------
  // Formulário (exige sessão)
  // -------------------------------------------------------------------------

  async getForm(token: string, request: FastifyRequest): Promise<FinancingPublicForm> {
    const solicitacao = await this.resolverAberta(token);
    this.exigirSessao(request, solicitacao.id);
    return this.montarFormulario(solicitacao);
  }

  async saveSection(
    token: string,
    request: FastifyRequest,
    dto: FinancingSaveSectionDto,
  ): Promise<FinancingPublicForm> {
    const solicitacao = await this.resolverAberta(token);
    this.exigirSessao(request, solicitacao.id);

    const secao = dto.section as FinancingSection;
    if (!(solicitacao.requestedSections as string[]).includes(secao)) {
      throw new BadRequestException("Esta seção não faz parte desta solicitação.");
    }

    // O pedaço é validado pelo schema da seção ANTES de tocar o rascunho:
    // formato errado nunca entra no banco, nem em rascunho.
    const parsed = FINANCING_SECTION_SCHEMAS[secao].safeParse(dto.data);
    if (!parsed.success) {
      const primeira = parsed.error.issues[0];
      throw new BadRequestException(primeira?.message ?? "Dados inválidos nesta seção.");
    }

    const payloadAtual = (solicitacao.draft?.payload as FinancingPayload | undefined) ?? {};
    const payloadNovo = { ...payloadAtual, [secao]: parsed.data };

    const concluidas = new Set(solicitacao.draft?.completedSections ?? []);
    if (dto.completed === true) concluidas.add(secao);
    if (dto.completed === false) concluidas.delete(secao);

    const atualizado = await this.prisma.$transaction(async (tx) => {
      const draft = await tx.financingDataDraft.upsert({
        where: { requestId: solicitacao.id },
        create: {
          brokerId: solicitacao.brokerId,
          requestId: solicitacao.id,
          payload: payloadNovo,
          completedSections: [...concluidas],
        },
        update: { payload: payloadNovo, completedSections: [...concluidas] },
      });
      if (!solicitacao.startedAt) {
        await tx.financingDataRequest.update({
          where: { id: solicitacao.id },
          data: { startedAt: new Date() },
        });
        await this.events.track(
          solicitacao.brokerId,
          {
            type: "FINANCING_DATA_REQUEST_STARTED",
            source: "api",
            entityType: "financing_request",
            entityId: solicitacao.id,
            dedupeKey: `FINANCING_DATA_REQUEST_STARTED:${solicitacao.id}`,
          },
          tx,
        );
      }
      return draft;
    });

    return this.montarFormulario({
      ...solicitacao,
      draft: atualizado,
      startedAt: solicitacao.startedAt ?? new Date(),
    });
  }

  // -------------------------------------------------------------------------
  // Envio (exige sessão): congela a versão imutável
  // -------------------------------------------------------------------------

  async submit(token: string, request: FastifyRequest): Promise<FinancingSubmitResult> {
    const solicitacao = await this.resolverAberta(token);
    this.exigirSessao(request, solicitacao.id);

    const payload = (solicitacao.draft?.payload as FinancingPayload | undefined) ?? {};
    const concluidas = (solicitacao.draft?.completedSections ?? []) as FinancingSection[];
    const pendencias = financingSubmissionPendencies(
      payload,
      solicitacao.requestedSections as FinancingSection[],
      concluidas,
    );
    if (pendencias.length > 0) {
      // A mesma régua roda no front antes de habilitar o botão; chegar aqui
      // com pendência é rascunho de outro dispositivo ou requisição direta.
      throw new BadRequestException(pendencias[0].message);
    }

    const version = solicitacao.currentVersion + 1;
    const agora = new Date();

    await this.prisma.$transaction(async (tx) => {
      const consent = await tx.consent.create({
        data: {
          brokerId: solicitacao.brokerId,
          leadId: solicitacao.leadId,
          purpose: FINANCING_CONSENT_PURPOSE,
          textVersion: FINANCING_CONSENT_VERSION,
          origin: FINANCING_CONSENT_ORIGIN,
        },
      });
      await tx.financingDataSubmission.create({
        data: {
          brokerId: solicitacao.brokerId,
          requestId: solicitacao.id,
          version,
          payload,
          consentId: consent.id,
        },
      });
      await tx.financingDataRequest.update({
        where: { id: solicitacao.id },
        data: {
          status: "respondida",
          submittedAt: agora,
          currentVersion: version,
          consentVersion: FINANCING_CONSENT_VERSION,
        },
      });
      await tx.leadActivity.create({
        data: {
          brokerId: solicitacao.brokerId,
          leadId: solicitacao.leadId,
          type: "financiamento",
          description:
            version === 1
              ? "Cliente enviou os dados para a simulação de financiamento."
              : `Cliente reenviou os dados para a simulação (versão ${version}).`,
        },
      });
      // Auditoria sem conteúdo sensível: o quê e quando, nunca renda ou CPF.
      await tx.auditLog.create({
        data: {
          brokerId: solicitacao.brokerId,
          action: "financing_data_submitted",
          entityType: "financing_request",
          entityId: solicitacao.id,
          metadata: { version },
        },
      });
      await this.events.track(
        solicitacao.brokerId,
        {
          type: "FINANCING_DATA_REQUEST_SUBMITTED",
          source: "api",
          entityType: "financing_request",
          entityId: solicitacao.id,
          dedupeKey: `FINANCING_DATA_REQUEST_SUBMITTED:${solicitacao.id}:v${version}`,
        },
        tx,
      );
    });

    await this.notifications.create(
      solicitacao.brokerId,
      "financiamento_respondido",
      "Dados para simulação recebidos",
      version === 1
        ? `${solicitacao.lead.fullName} enviou as informações do financiamento.`
        : `${solicitacao.lead.fullName} reenviou as informações do financiamento (versão ${version}).`,
      `/leads/${solicitacao.lead.code}`,
    );

    return {
      version,
      submittedAt: agora.toISOString(),
      brokerName: solicitacao.broker.fullName,
    };
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------

  /** Token da URL para registro, com expiração sob demanda. 404 se não existe. */
  private async resolver(token: string): Promise<PublicRecord> {
    const row = await this.prisma.financingDataRequest.findUnique({
      where: { tokenHash: sha256(token) },
      include: INCLUDE_PUBLIC,
    });
    if (!row) throw new NotFoundException("Link não encontrado.");

    const aberta = (ABERTAS as readonly string[]).includes(row.status);
    if (aberta && row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      return this.prisma.financingDataRequest.update({
        where: { id: row.id },
        // O hash fica: o cliente que abrir o link vencido merece a explicação
        // "expirou", não um 404 que parece erro dele.
        data: { status: "expirada" },
        include: INCLUDE_PUBLIC,
      });
    }
    return row;
  }

  private async resolverAberta(token: string): Promise<PublicRecord> {
    const row = await this.resolver(token);
    if (!(ABERTAS as readonly string[]).includes(row.status)) {
      // 410: o link existiu e não vale mais. O front mostra o estado bonito.
      throw new GoneException("Este link não está mais ativo.");
    }
    return row;
  }

  private exigirSessao(request: FastifyRequest, requestId: string): void {
    const cookie = request.cookies?.[FINANCING_COOKIE];
    if (!cookie) throw new UnauthorizedException("Confirme o código de acesso.");
    let payload: SessaoPayload;
    try {
      payload = this.jwt.verify<SessaoPayload>(cookie, {
        secret: this.config.get<string>("JWT_ACCESS_SECRET"),
      });
    } catch {
      throw new UnauthorizedException("Sessão vencida. Confirme o código de novo.");
    }
    if (payload.scope !== "financing-form" || payload.requestId !== requestId) {
      throw new UnauthorizedException("Confirme o código de acesso.");
    }
  }

  private estadoPublico(r: PublicRecord): FinancingPublicState["state"] {
    if ((ABERTAS as readonly string[]).includes(r.status)) return "aguardando_codigo";
    if (r.status === "expirada") return "expirada";
    if (r.status === "revogada") return "revogada";
    return "encerrada";
  }

  private montarFormulario(r: PublicRecord): FinancingPublicForm {
    // A nota de correção só aparece enquanto a correção está aberta; depois
    // do reenvio ela vira história e sai da frente do cliente.
    const emCorrecao = r.status === "correcao_solicitada";
    const ultima = r.submissions[0];
    return {
      leadFirstName: primeiroNome(r.lead.fullName),
      leadFullName: r.lead.fullName,
      brokerName: r.broker.fullName,
      sections: r.requestedSections as FinancingSection[],
      message: r.message,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      payload: (r.draft?.payload as FinancingPayload | undefined) ?? {},
      completedSections: (r.draft?.completedSections ?? []) as FinancingSection[],
      correctionNote: emCorrecao ? (ultima?.correctionNote ?? null) : null,
      correctionFields: emCorrecao
        ? ((ultima?.correctionFields as FinancingSection[] | undefined) ?? null)
        : null,
    };
  }
}

function sha256(valor: string): string {
  return createHash("sha256").update(valor).digest("hex");
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

/** m•••@t•••.dev: o dono reconhece, um estranho não aprende nada. */
function mascararEmail(email: string): string {
  const [usuario, dominio] = email.split("@");
  if (!dominio) return "•••";
  const [host, ...resto] = dominio.split(".");
  const mascarar = (parte: string) => (parte.length <= 1 ? parte : `${parte[0]}•••`);
  return `${mascarar(usuario)}@${[mascarar(host), ...resto].join(".")}`;
}
