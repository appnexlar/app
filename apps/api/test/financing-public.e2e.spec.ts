import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import type {
  FinancingPublicForm,
  FinancingPublicState,
  FinancingSendResult,
  FinancingSubmitResult,
} from "@nexlar/shared";
import { FINANCING_CONSENT_PURPOSE } from "@nexlar/shared";
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

/** Captura os códigos em vez de enviar: o teste lê o que iria no e-mail. */
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
 * Fatia C da coleta de dados (docs/09): o lado do cliente. O que se protege:
 * o código chega no e-mail da ficha e vale 10 minutos, errar 5 vezes trava,
 * o formulário não abre sem a sessão do código, a sessão de uma solicitação
 * não abre outra, e formato inválido não entra nem no rascunho.
 */
describe("Financiamento: formulário público", () => {
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

  /** Cria lead com e-mail, solicita e envia; devolve o token do link. */
  async function prepararLink(broker: TestBroker): Promise<{ token: string; requestId: string }> {
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
    return { token: body.publicPath.split("/").pop() as string, requestId: view.id };
  }

  /** Passa pelo OTP e devolve o cookie da sessão. */
  async function abrirSessao(token: string): Promise<string> {
    await app.inject({ method: "POST", url: `/api/public/financiamento/${token}/otp` });
    const code = emails.last?.code as string;
    const verify = await app.inject({
      method: "POST",
      url: `/api/public/financiamento/${token}/verify`,
      payload: { code },
    });
    expect(verify.statusCode).toBe(200);
    const setCookie = String(verify.headers["set-cookie"]);
    const achado = /nexlar_financiamento=([^;]+)/.exec(setCookie);
    expect(achado).toBeTruthy();
    return achado![1];
  }

  it("estado do link não vaza dado pessoal e mascara o e-mail", async () => {
    const broker = await registerBroker(app, "Ana Corretora", "ana@teste.dev");
    const { token } = await prepararLink(broker);

    const res = await app.inject({ method: "GET", url: `/api/public/financiamento/${token}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toContain("no-store");
    const body: FinancingPublicState = res.json();
    expect(body.state).toBe("aguardando_codigo");
    expect(body.leadFirstName).toBe("Mariana");
    expect(body.emailHint).toBe("m•••@t•••.dev");
    const texto = res.body;
    expect(texto).not.toContain("mariana@teste.dev");
    expect(texto).not.toContain("Compradora");
  });

  it("token desconhecido responde 404 e link revogado responde 410", async () => {
    const broker = await registerBroker(app, "Ana Corretora", "ana@teste.dev");
    const { token, requestId } = await prepararLink(broker);

    const invalido = await app.inject({ method: "GET", url: "/api/public/financiamento/nao-existe" });
    expect(invalido.statusCode).toBe(404);

    const view = await prisma.financingDataRequest.findUnique({ where: { id: requestId } });
    await requestAs(app, broker, { method: "POST", url: `/api/financing-requests/${view!.code}/revoke` });

    // Revogar apaga o hash: o link some de verdade, então 404.
    const depois = await app.inject({ method: "GET", url: `/api/public/financiamento/${token}` });
    expect(depois.statusCode).toBe(404);

    // Já o OTP num link só expirado responde 410 (o estado explica na tela).
    const outra = await prepararLink(broker);
    await prisma.financingDataRequest.update({
      where: { id: outra.requestId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const estado = await app.inject({ method: "GET", url: `/api/public/financiamento/${outra.token}` });
    expect(estado.json().state).toBe("expirada");
    const otp = await app.inject({ method: "POST", url: `/api/public/financiamento/${outra.token}/otp` });
    expect(otp.statusCode).toBe(410);
  });

  it("dispara o código para o e-mail da ficha e registra a primeira abertura", async () => {
    const broker = await registerBroker(app, "Ana Corretora", "ana@teste.dev");
    const { token, requestId } = await prepararLink(broker);

    const res = await app.inject({ method: "POST", url: `/api/public/financiamento/${token}/otp` });
    expect(res.statusCode).toBe(204);
    expect(emails.last?.to).toBe("mariana@teste.dev");
    expect(emails.last?.code).toMatch(/^\d{6}$/);

    const row = await prisma.financingDataRequest.findUnique({ where: { id: requestId } });
    expect(row?.firstOpenedAt).toBeTruthy();

    const codigo = await prisma.financingAccessCode.findFirst({ where: { requestId } });
    expect(codigo?.codeHash).not.toBe(emails.last?.code);
  });

  it("código errado 5 vezes trava, e pedir outro destrava", async () => {
    const broker = await registerBroker(app, "Ana Corretora", "ana@teste.dev");
    const { token } = await prepararLink(broker);
    await app.inject({ method: "POST", url: `/api/public/financiamento/${token}/otp` });

    for (let i = 0; i < 5; i++) {
      const errado = await app.inject({
        method: "POST",
        url: `/api/public/financiamento/${token}/verify`,
        payload: { code: "000000" },
      });
      expect(errado.statusCode).toBe(400);
    }
    // Na sexta, mesmo o código CERTO é recusado: o registro travou.
    const certo = await app.inject({
      method: "POST",
      url: `/api/public/financiamento/${token}/verify`,
      payload: { code: emails.last!.code },
    });
    expect(certo.statusCode).toBe(400);
    expect(certo.json().message).toContain("tentativas");

    // Pedir código novo zera a contagem (código antigo morre junto).
    await app.inject({ method: "POST", url: `/api/public/financiamento/${token}/otp` });
    const denovo = await app.inject({
      method: "POST",
      url: `/api/public/financiamento/${token}/verify`,
      payload: { code: emails.last!.code },
    });
    expect(denovo.statusCode).toBe(200);
  });

  it("formulário não abre sem sessão e abre com ela", async () => {
    const broker = await registerBroker(app, "Ana Corretora", "ana@teste.dev");
    const { token } = await prepararLink(broker);

    const semSessao = await app.inject({ method: "GET", url: `/api/public/financiamento/${token}/form` });
    expect(semSessao.statusCode).toBe(401);

    const cookie = await abrirSessao(token);
    const res = await app.inject({
      method: "GET",
      url: `/api/public/financiamento/${token}/form`,
      headers: { cookie: `nexlar_financiamento=${cookie}` },
    });
    expect(res.statusCode).toBe(200);
    const form: FinancingPublicForm = res.json();
    expect(form.leadFullName).toBe("Mariana Compradora");
    expect(form.sections).toHaveLength(6);
    expect(form.payload).toEqual({});
  });

  it("sessão de uma solicitação não abre outra", async () => {
    const broker = await registerBroker(app, "Ana Corretora", "ana@teste.dev");
    const primeira = await prepararLink(broker);
    const cookie = await abrirSessao(primeira.token);

    const bia = await registerBroker(app, "Bia Corretora", "bia@teste.dev");
    const segunda = await prepararLink(bia);

    const res = await app.inject({
      method: "GET",
      url: `/api/public/financiamento/${segunda.token}/form`,
      headers: { cookie: `nexlar_financiamento=${cookie}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("salva a seção de dados pessoais, valida formato e marca o início", async () => {
    const broker = await registerBroker(app, "Ana Corretora", "ana@teste.dev");
    const { token, requestId } = await prepararLink(broker);
    const cookie = await abrirSessao(token);
    const headers = { cookie: `nexlar_financiamento=${cookie}` };

    // CPF inventado não entra nem em rascunho.
    const invalido = await app.inject({
      method: "PATCH",
      url: `/api/public/financiamento/${token}/form`,
      headers,
      payload: { section: "dados_pessoais", data: { cpf: "12345678900" } },
    });
    expect(invalido.statusCode).toBe(400);
    expect(invalido.json().message).toContain("CPF");

    const valido = await app.inject({
      method: "PATCH",
      url: `/api/public/financiamento/${token}/form`,
      headers,
      payload: {
        section: "dados_pessoais",
        data: {
          fullName: "Mariana Compradora",
          cpf: "52998224725",
          birthDate: "1990-04-12",
          maritalStatus: "casado",
          city: "São Paulo",
          state: "SP",
          dependentsCount: 1,
        },
        completed: true,
      },
    });
    expect(valido.statusCode).toBe(200);
    const form: FinancingPublicForm = valido.json();
    expect(form.payload.dados_pessoais?.cpf).toBe("52998224725");
    expect(form.completedSections).toEqual(["dados_pessoais"]);

    const row = await prisma.financingDataRequest.findUnique({ where: { id: requestId } });
    expect(row?.startedAt).toBeTruthy();

    // Seção fora do pedido é recusada.
    await prisma.financingDataRequest.update({
      where: { id: requestId },
      data: { requestedSections: ["dados_pessoais"] },
    });
    const foraDoPedido = await app.inject({
      method: "PATCH",
      url: `/api/public/financiamento/${token}/form`,
      headers,
      payload: { section: "imovel", data: {} },
    });
    expect(foraDoPedido.statusCode).toBe(400);
  });

  /** Preenche as seis seções com o mínimo exigível pelo envio. */
  async function preencherTudo(token: string, cookie: string): Promise<void> {
    const headers = { cookie: `nexlar_financiamento=${cookie}` };
    const secoes: Array<{ section: string; data: Record<string, unknown> }> = [
      {
        section: "dados_pessoais",
        data: { fullName: "Mariana Compradora", cpf: "52998224725", birthDate: "1990-04-12" },
      },
      { section: "trabalho_renda", data: { situation: "assalariado", netMonthlyIncome: 8500 } },
      { section: "participantes", data: { participants: [] } },
      { section: "entrada_fgts", data: { downPaymentAmount: 60000 } },
      { section: "compromissos", data: { commitments: [] } },
      { section: "imovel", data: { goal: "moradia" } },
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
  }

  it("não envia sem consentimento, com etapa pendente ou sem campo essencial", async () => {
    const broker = await registerBroker(app, "Ana Corretora", "ana@teste.dev");
    const { token } = await prepararLink(broker);
    const cookie = await abrirSessao(token);
    const headers = { cookie: `nexlar_financiamento=${cookie}` };

    // Sem o aceite explícito o corpo nem passa da validação.
    const semConsentimento = await app.inject({
      method: "POST",
      url: `/api/public/financiamento/${token}/submit`,
      headers,
      payload: {},
    });
    expect(semConsentimento.statusCode).toBe(400);

    // Com consentimento mas nada concluído: pendência de etapa.
    const incompleto = await app.inject({
      method: "POST",
      url: `/api/public/financiamento/${token}/submit`,
      headers,
      payload: { consent: true },
    });
    expect(incompleto.statusCode).toBe(400);
    expect(incompleto.json().message).toContain("Conclua a etapa");

    // Tudo concluído, mas sem CPF: a régua de campo essencial segura.
    await preencherTudo(token, cookie);
    await app.inject({
      method: "PATCH",
      url: `/api/public/financiamento/${token}/form`,
      headers,
      payload: {
        section: "dados_pessoais",
        data: { fullName: "Mariana Compradora", birthDate: "1990-04-12" },
        completed: true,
      },
    });
    const semCpf = await app.inject({
      method: "POST",
      url: `/api/public/financiamento/${token}/submit`,
      headers,
      payload: { consent: true },
    });
    expect(semCpf.statusCode).toBe(400);
    expect(semCpf.json().message).toContain("CPF");
  });

  it("enviar congela a versão imutável, registra o consentimento e avisa o corretor", async () => {
    const broker = await registerBroker(app, "Ana Corretora", "ana@teste.dev");
    const { token, requestId } = await prepararLink(broker);
    const cookie = await abrirSessao(token);
    const headers = { cookie: `nexlar_financiamento=${cookie}` };
    await preencherTudo(token, cookie);

    const res = await app.inject({
      method: "POST",
      url: `/api/public/financiamento/${token}/submit`,
      headers,
      payload: { consent: true },
    });
    expect(res.statusCode).toBe(200);
    const corpo: FinancingSubmitResult = res.json();
    expect(corpo.version).toBe(1);
    expect(corpo.brokerName).toBe("Ana Corretora");

    const row = await prisma.financingDataRequest.findUnique({ where: { id: requestId } });
    expect(row?.status).toBe("respondida");
    expect(row?.currentVersion).toBe(1);
    expect(row?.submittedAt).toBeTruthy();

    // A submissão congelou o payload do rascunho, com o consentimento anexado.
    const submissao = await prisma.financingDataSubmission.findUnique({
      where: { requestId_version: { requestId, version: 1 } },
    });
    expect(submissao).toBeTruthy();
    const payload = submissao?.payload as { dados_pessoais?: { cpf?: string } };
    expect(payload.dados_pessoais?.cpf).toBe("52998224725");
    expect(submissao?.consentId).toBeTruthy();

    const consent = await prisma.consent.findUnique({ where: { id: submissao!.consentId! } });
    expect(consent?.purpose).toBe(FINANCING_CONSENT_PURPOSE);
    expect(consent?.origin).toBe("formulario_publico");

    // O corretor foi avisado no sino, com o caminho da ficha.
    const notificacao = await prisma.notification.findFirst({
      where: { brokerId: broker.brokerId, type: "financiamento_respondido" },
    });
    expect(notificacao?.body).toContain("Mariana");
    expect(notificacao?.actionUrl).toMatch(/^\/leads\/\d+$/);

    // Depois do envio o link encerra: estado explica, formulário não abre mais.
    const estado = await app.inject({ method: "GET", url: `/api/public/financiamento/${token}` });
    expect((estado.json() as FinancingPublicState).state).toBe("encerrada");
    const formDepois = await app.inject({
      method: "GET",
      url: `/api/public/financiamento/${token}/form`,
      headers,
    });
    expect(formDepois.statusCode).toBe(410);
    const salvarDepois = await app.inject({
      method: "PATCH",
      url: `/api/public/financiamento/${token}/form`,
      headers,
      payload: { section: "imovel", data: {} },
    });
    expect(salvarDepois.statusCode).toBe(410);
    const enviarDeNovo = await app.inject({
      method: "POST",
      url: `/api/public/financiamento/${token}/submit`,
      headers,
      payload: { consent: true },
    });
    expect(enviarDeNovo.statusCode).toBe(410);
  });
});
