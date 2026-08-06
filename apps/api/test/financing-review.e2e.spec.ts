import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import type {
  FinancingApproveResult,
  FinancingPublicForm,
  FinancingReviewView,
  FinancingSendResult,
} from "@nexlar/shared";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { RateLimitStore } from "../src/common/rate-limit/rate-limit.store";
import {
  EmailService,
  type EmailVerificationEmail,
  type FinancingAccessCodeEmail,
  type PasswordResetEmail,
  type WelcomeEmail,
} from "../src/email/email.service";
import { registerBroker, registerPlugins, requestAs, resetDatabase, type TestBroker } from "./e2e-utils";

class EmailCollector extends EmailService {
  readonly codes: FinancingAccessCodeEmail[] = [];
  async sendEmailVerification(_e: EmailVerificationEmail): Promise<void> {}
  async sendPasswordReset(_e: PasswordResetEmail): Promise<void> {}
  async sendWelcome(_e: WelcomeEmail): Promise<void> {}
  async sendFinancingAccessCode(email: FinancingAccessCodeEmail): Promise<void> {
    this.codes.push(email);
  }
  get last(): FinancingAccessCodeEmail | undefined {
    return this.codes[this.codes.length - 1];
  }
}

/**
 * Fatia E da coleta de dados (docs/09): revisão, correção e aprovação. O que
 * se protege: revisar marca em_revisao; a correção troca o token (o link
 * antigo morre) e devolve as seções pedidas a pendentes; a aprovação aplica à
 * ficha SÓ o que veio preenchido e pré-preenche a Simulation.
 */
describe("Financiamento: revisão do corretor", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let emails: EmailCollector;

  beforeAll(async () => {
    emails = new EmailCollector();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue(emails)
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await registerPlugins(app);
    app.setGlobalPrefix("api");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    app.get(RateLimitStore).clearAll();
    emails.codes.length = 0;
  });

  async function prepararLink(broker: TestBroker): Promise<{ token: string; requestId: string; code: number; leadId: string }> {
    const lead = await prisma.lead.create({
      data: {
        brokerId: broker.brokerId,
        fullName: "Mariana Compradora",
        whatsapp: "11988887777",
        email: "mariana@teste.dev",
      },
    });
    const criada = await requestAs(app, broker, {
      method: "POST",
      url: "/api/financing-requests",
      payload: { leadId: lead.id },
    });
    const view = criada.json();
    const envio = await requestAs(app, broker, {
      method: "POST",
      url: `/api/financing-requests/${view.code}/send`,
    });
    const body: FinancingSendResult = envio.json();
    return { token: body.publicPath.split("/").pop() as string, requestId: view.id, code: view.code, leadId: lead.id };
  }

  async function abrirSessao(token: string): Promise<string> {
    await app.inject({ method: "POST", url: `/api/public/financiamento/${token}/otp` });
    const verify = await app.inject({
      method: "POST",
      url: `/api/public/financiamento/${token}/verify`,
      payload: { code: emails.last!.code },
    });
    expect(verify.statusCode).toBe(200);
    return /nexlar_financiamento=([^;]+)/.exec(String(verify.headers["set-cookie"]))![1];
  }

  /** Preenche tudo e envia; devolve o cookie usado. */
  async function responderTudo(token: string): Promise<string> {
    const cookie = await abrirSessao(token);
    const headers = { cookie: `nexlar_financiamento=${cookie}` };
    const secoes: Array<{ section: string; data: Record<string, unknown> }> = [
      {
        section: "dados_pessoais",
        data: {
          fullName: "Mariana Compradora",
          cpf: "52998224725",
          birthDate: "1990-04-12",
          maritalStatus: "casado",
          city: "São Paulo",
          state: "SP",
          dependentsCount: 2,
        },
      },
      {
        section: "trabalho_renda",
        data: { situation: "servidor_publico", occupation: "Professora", netMonthlyIncome: 8500 },
      },
      {
        section: "participantes",
        data: {
          participants: [
            { fullName: "Carlos Compradora", relation: "conjuge", cpf: "39053344705", monthlyIncome: 4200 },
          ],
        },
      },
      { section: "entrada_fgts", data: { downPaymentAmount: 60000, downPaymentSources: ["fgts"] } },
      { section: "compromissos", data: { commitments: [] } },
      {
        section: "imovel",
        data: { propertyValue: 400000, goal: "moradia", desiredTermMonths: 300, preferredBank: "Caixa", useFgts: true },
      },
    ];
    for (const s of secoes) {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/public/financiamento/${token}/form`,
        headers,
        payload: { ...s, completed: true },
      });
      expect(res.statusCode).toBe(200);
    }
    const envio = await app.inject({
      method: "POST",
      url: `/api/public/financiamento/${token}/submit`,
      headers,
      payload: { consent: true },
    });
    expect(envio.statusCode).toBe(200);
    return cookie;
  }

  it("revisar devolve a última versão e marca em_revisao; outro corretor não vê", async () => {
    const broker = await registerBroker(app, "Ana Corretora", "ana@teste.dev");
    const { token, requestId, code } = await prepararLink(broker);
    await responderTudo(token);

    const res = await requestAs(app, broker, {
      method: "GET",
      url: `/api/financing-requests/${code}/review`,
    });
    expect(res.statusCode).toBe(200);
    const review: FinancingReviewView = res.json();
    expect(review.version).toBe(1);
    expect(review.payload.dados_pessoais?.cpf).toBe("52998224725");
    expect(review.request.status).toBe("em_revisao");

    const row = await prisma.financingDataRequest.findUnique({ where: { id: requestId } });
    expect(row?.reviewedAt).toBeTruthy();

    const bia = await registerBroker(app, "Bia Corretora", "bia@teste.dev");
    const alheia = await requestAs(app, bia, {
      method: "GET",
      url: `/api/financing-requests/${code}/review`,
    });
    expect(alheia.statusCode).toBe(404);
  });

  it("correção troca o token, reabre só as seções pedidas e aceita a versão 2", async () => {
    const broker = await registerBroker(app, "Ana Corretora", "ana@teste.dev");
    const { token, requestId, code } = await prepararLink(broker);
    await responderTudo(token);
    await requestAs(app, broker, { method: "GET", url: `/api/financing-requests/${code}/review` });

    const correcao = await requestAs(app, broker, {
      method: "POST",
      url: `/api/financing-requests/${code}/request-correction`,
      payload: { sections: ["trabalho_renda"], note: "Confirme a renda líquida com o holerite mais recente.", expiresInDays: 7 },
    });
    expect(correcao.statusCode).toBe(200);
    const resultado: FinancingSendResult = correcao.json();
    expect(resultado.request.status).toBe("correcao_solicitada");
    const tokenNovo = resultado.publicPath.split("/").pop() as string;
    expect(tokenNovo).not.toBe(token);
    expect(resultado.whatsappUrl).toContain("wa.me");

    // O link antigo morreu de verdade.
    const antigo = await app.inject({ method: "GET", url: `/api/public/financiamento/${token}` });
    expect(antigo.statusCode).toBe(404);

    // O novo abre, mostra a nota e só a seção pedida voltou a pendente.
    const cookie = await abrirSessao(tokenNovo);
    const headers = { cookie: `nexlar_financiamento=${cookie}` };
    const form = await app.inject({ method: "GET", url: `/api/public/financiamento/${tokenNovo}/form`, headers });
    const corpo: FinancingPublicForm = form.json();
    expect(corpo.correctionNote).toContain("holerite");
    expect(corpo.correctionFields).toEqual(["trabalho_renda"]);
    expect(corpo.completedSections).not.toContain("trabalho_renda");
    expect(corpo.completedSections).toContain("dados_pessoais");
    // O que foi preenchido antes continua lá para editar.
    expect(corpo.payload.trabalho_renda?.netMonthlyIncome).toBe(8500);

    // Cliente corrige, conclui e reenvia: versão 2.
    const conserto = await app.inject({
      method: "PATCH",
      url: `/api/public/financiamento/${tokenNovo}/form`,
      headers,
      payload: {
        section: "trabalho_renda",
        data: { situation: "servidor_publico", occupation: "Professora", netMonthlyIncome: 9100 },
        completed: true,
      },
    });
    expect(conserto.statusCode).toBe(200);
    const reenvio = await app.inject({
      method: "POST",
      url: `/api/public/financiamento/${tokenNovo}/submit`,
      headers,
      payload: { consent: true },
    });
    expect(reenvio.statusCode).toBe(200);
    expect(reenvio.json().version).toBe(2);

    const row = await prisma.financingDataRequest.findUnique({ where: { id: requestId } });
    expect(row?.status).toBe("respondida");
    expect(row?.currentVersion).toBe(2);

    // O histórico guarda a nota na versão que a motivou.
    const revisao = await requestAs(app, broker, { method: "GET", url: `/api/financing-requests/${code}/review` });
    const view: FinancingReviewView = revisao.json();
    expect(view.version).toBe(2);
    expect(view.payload.trabalho_renda?.netMonthlyIncome).toBe(9100);
    expect(view.versions.find((v) => v.version === 1)?.correctionNote).toContain("holerite");
  });

  it("avisa o corretor na primeira abertura e quando o prazo termina sem envio", async () => {
    const broker = await registerBroker(app, "Ana Corretora", "ana@teste.dev");
    const { token, requestId, code } = await prepararLink(broker);

    // Primeira abertura: um aviso. Pedir outro código não gera outro.
    await app.inject({ method: "POST", url: `/api/public/financiamento/${token}/otp` });
    await app.inject({ method: "POST", url: `/api/public/financiamento/${token}/otp` });
    const aberturas = await prisma.notification.findMany({
      where: { brokerId: broker.brokerId, type: "financiamento_aberto" },
    });
    expect(aberturas).toHaveLength(1);
    expect(aberturas[0].body).toContain("Mariana");

    // Prazo vencido: a próxima leitura expira, avisa e registra o evento.
    await prisma.financingDataRequest.update({
      where: { id: requestId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await requestAs(app, broker, { method: "GET", url: `/api/financing-requests/${code}` });
    expect(res.json().status).toBe("expirada");

    const expiradas = await prisma.notification.findMany({
      where: { brokerId: broker.brokerId, type: "financiamento_expirado" },
    });
    expect(expiradas).toHaveLength(1);
    const evento = await prisma.productEvent.findFirst({
      where: { brokerId: broker.brokerId, type: "FINANCING_DATA_REQUEST_EXPIRED" },
    });
    expect(evento).toBeTruthy();
  });

  it("aprovar aplica à ficha só o que veio preenchido e pré-preenche a Simulation", async () => {
    const broker = await registerBroker(app, "Ana Corretora", "ana@teste.dev");
    const { token, requestId, code, leadId } = await prepararLink(broker);

    // A ficha já tinha dados do corretor: o branco da submissão não pode apagar.
    await prisma.clientProfile.create({
      data: { brokerId: broker.brokerId, leadId, city: "Campinas", nationality: "Brasileira", rg: "12345678" },
    });

    await responderTudo(token);

    const res = await requestAs(app, broker, {
      method: "POST",
      url: `/api/financing-requests/${code}/approve`,
    });
    expect(res.statusCode).toBe(200);
    const aprovado: FinancingApproveResult = res.json();
    expect(aprovado.request.status).toBe("aprovada_para_simulacao");
    expect(aprovado.createdParticipants).toBe(1);
    expect(aprovado.simulationId).toBeTruthy();

    // Perfil: cidade preenchida sobrescreve, nacionalidade em branco preserva.
    const perfil = await prisma.clientProfile.findUnique({ where: { leadId } });
    expect(perfil?.city).toBe("São Paulo");
    expect(perfil?.nationality).toBe("Brasileira");
    expect(perfil?.rg).toBe("12345678");
    expect(perfil?.cpf).toBe("52998224725");
    expect(perfil?.maritalStatus).toBe("casado");

    // Financeiro: renda, entrada, banco, FGTS, dependentes e composição.
    const financeiro = await prisma.clientFinancial.findUnique({ where: { leadId } });
    expect(Number(financeiro?.monthlyIncome)).toBe(8500);
    expect(Number(financeiro?.downPayment)).toBe(60000);
    expect(financeiro?.preferredBank).toBe("Caixa");
    expect(financeiro?.hasFgts).toBe(true);
    expect(financeiro?.dependentsCount).toBe(2);
    expect(financeiro?.hasIncomeComposition).toBe(true);
    // servidor_publico não existe no enum da ficha: vira "outro", nunca inventa.
    expect(financeiro?.incomeType).toBe("outro");

    // Participante entrou; aprovar de novo é recusado e não duplica.
    const participantes = await prisma.clientParticipant.findMany({ where: { leadId } });
    expect(participantes).toHaveLength(1);
    expect(participantes[0].fullName).toBe("Carlos Compradora");

    const simulacao = await prisma.simulation.findFirst({ where: { leadId } });
    expect(simulacao?.bank).toBe("Caixa");
    expect(Number(simulacao?.propertyValue)).toBe(400000);
    expect(Number(simulacao?.financedAmount)).toBe(340000);
    expect(simulacao?.termMonths).toBe(300);
    expect(simulacao?.status).toBe("pendente");

    const deNovo = await requestAs(app, broker, {
      method: "POST",
      url: `/api/financing-requests/${code}/approve`,
    });
    expect(deNovo.statusCode).toBe(409);

    const row = await prisma.financingDataRequest.findUnique({ where: { id: requestId } });
    expect(row?.approvedAt).toBeTruthy();

    const auditoria = await prisma.auditLog.findFirst({
      where: { brokerId: broker.brokerId, action: "financing_data_approved" },
    });
    expect(auditoria).toBeTruthy();
  });
});
