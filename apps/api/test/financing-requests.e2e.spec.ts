import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { FinancingRequestView, FinancingSendResult } from "@nexlar/shared";
import { createTestApp, registerBroker, requestAs, resetDatabase, type TestBroker } from "./e2e-utils";
import { PrismaService } from "../src/prisma/prisma.service";
import { RateLimitStore } from "../src/common/rate-limit/rate-limit.store";

/**
 * Fatia A da coleta de dados para simulação (docs/09): a solicitação e sua
 * máquina de estados. O que se protege aqui: transição proibida devolve 409,
 * o token nunca fica em claro no banco, o prazo é do relógio do servidor e um
 * corretor jamais enxerga a solicitação do outro.
 */
describe("Financiamento: solicitação de dados", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    app.get(RateLimitStore).clearAll();
  });

  async function criarLead(
    broker: TestBroker,
    overrides: { email?: string | null; nome?: string } = {},
  ): Promise<string> {
    const lead = await prisma.lead.create({
      data: {
        brokerId: broker.brokerId,
        fullName: overrides.nome ?? "Mariana Compradora",
        whatsapp: `1198888${Math.floor(Math.random() * 10_000)}`,
        email: overrides.email === undefined ? "mariana@teste.dev" : overrides.email,
      },
    });
    return lead.id;
  }

  async function criarSolicitacao(broker: TestBroker, leadId: string): Promise<FinancingRequestView> {
    const res = await requestAs(app, broker, {
      method: "POST",
      url: "/api/financing-requests",
      payload: { leadId },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  // -------------------------------------------------------------------------
  // Criação e configuração
  // -------------------------------------------------------------------------

  it("cria rascunho com todas as seções e prazo padrão de 7 dias", async () => {
    const broker = await registerBroker(app, "Ana Corretora", "ana@teste.dev");
    const leadId = await criarLead(broker);

    const view = await criarSolicitacao(broker, leadId);
    expect(view.status).toBe("rascunho");
    expect(view.sections).toHaveLength(6);
    expect(view.expiresInDays).toBe(7);
    expect(view.currentVersion).toBe(0);
    expect(view.code).toBeGreaterThan(0);
    expect(view.leadName).toBe("Mariana Compradora");
  });

  it("preenche o e-mail da lead quando ela não tem, e nunca sobrescreve o existente", async () => {
    const broker = await registerBroker(app, "Ana Corretora", "ana@teste.dev");
    const semEmail = await criarLead(broker, { email: null });
    const comEmail = await criarLead(broker, { email: "fixo@teste.dev", nome: "Carlos" });

    const res1 = await requestAs(app, broker, {
      method: "POST",
      url: "/api/financing-requests",
      payload: { leadId: semEmail, leadEmail: "novo@teste.dev" },
    });
    expect(res1.statusCode).toBe(201);
    const lead1 = await prisma.lead.findUnique({ where: { id: semEmail } });
    expect(lead1?.email).toBe("novo@teste.dev");

    const res2 = await requestAs(app, broker, {
      method: "POST",
      url: "/api/financing-requests",
      payload: { leadId: comEmail, leadEmail: "invasor@teste.dev" },
    });
    expect(res2.statusCode).toBe(201);
    const lead2 = await prisma.lead.findUnique({ where: { id: comEmail } });
    expect(lead2?.email).toBe("fixo@teste.dev");
  });

  it("configura o rascunho e recusa configurar depois do envio", async () => {
    const broker = await registerBroker(app, "Ana Corretora", "ana@teste.dev");
    const leadId = await criarLead(broker);
    const view = await criarSolicitacao(broker, leadId);

    const patch = await requestAs(app, broker, {
      method: "PATCH",
      url: `/api/financing-requests/${view.code}`,
      payload: { sections: ["dados_pessoais", "trabalho_renda"], expiresInDays: 3, message: "Oi!" },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().sections).toEqual(["dados_pessoais", "trabalho_renda"]);
    expect(patch.json().expiresInDays).toBe(3);

    const send = await requestAs(app, broker, { method: "POST", url: `/api/financing-requests/${view.code}/send` });
    expect(send.statusCode).toBe(200);

    const depois = await requestAs(app, broker, {
      method: "PATCH",
      url: `/api/financing-requests/${view.code}`,
      payload: { message: "tarde demais" },
    });
    expect(depois.statusCode).toBe(409);
  });

  // -------------------------------------------------------------------------
  // Envio e token
  // -------------------------------------------------------------------------

  it("envia gerando link com token, e no banco só existe o hash", async () => {
    const broker = await registerBroker(app, "Ana Corretora", "ana@teste.dev");
    const leadId = await criarLead(broker);
    const view = await criarSolicitacao(broker, leadId);

    const res = await requestAs(app, broker, { method: "POST", url: `/api/financing-requests/${view.code}/send` });
    expect(res.statusCode).toBe(200);
    const body: FinancingSendResult = res.json();

    expect(body.request.status).toBe("enviada");
    expect(body.request.expiresAt).toBeTruthy();
    expect(body.publicPath).toMatch(/^\/f\/[A-Za-z0-9_-]{20,}$/);
    expect(body.whatsappUrl).toContain("wa.me/55");

    const token = body.publicPath.split("/").pop() as string;
    const row = await prisma.financingDataRequest.findUnique({ where: { id: body.request.id } });
    expect(row?.tokenHash).toBeTruthy();
    expect(row?.tokenHash).not.toBe(token);
    expect(row?.tokenHash).toHaveLength(64);
  });

  it("recusa enviar quando a lead não tem e-mail (o OTP vai por e-mail)", async () => {
    const broker = await registerBroker(app, "Ana Corretora", "ana@teste.dev");
    const leadId = await criarLead(broker, { email: null });
    const view = await criarSolicitacao(broker, leadId);

    const res = await requestAs(app, broker, { method: "POST", url: `/api/financing-requests/${view.code}/send` });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("e-mail");
  });

  it("reenviar depois de revogar troca o token: o link antigo morre", async () => {
    const broker = await registerBroker(app, "Ana Corretora", "ana@teste.dev");
    const leadId = await criarLead(broker);
    const view = await criarSolicitacao(broker, leadId);

    const envio1: FinancingSendResult = (
      await requestAs(app, broker, { method: "POST", url: `/api/financing-requests/${view.code}/send` })
    ).json();
    const hash1 = (await prisma.financingDataRequest.findUnique({ where: { id: view.id } }))?.tokenHash;

    const revoga = await requestAs(app, broker, { method: "POST", url: `/api/financing-requests/${view.code}/revoke` });
    expect(revoga.statusCode).toBe(200);
    expect(revoga.json().status).toBe("revogada");
    const hashRevogado = (await prisma.financingDataRequest.findUnique({ where: { id: view.id } }))?.tokenHash;
    expect(hashRevogado).toBeNull();

    const envio2: FinancingSendResult = (
      await requestAs(app, broker, { method: "POST", url: `/api/financing-requests/${view.code}/send` })
    ).json();
    expect(envio2.request.status).toBe("enviada");
    const hash2 = (await prisma.financingDataRequest.findUnique({ where: { id: view.id } }))?.tokenHash;
    expect(hash2).toBeTruthy();
    expect(hash2).not.toBe(hash1);
    expect(envio2.publicPath).not.toBe(envio1.publicPath);
  });

  // -------------------------------------------------------------------------
  // Máquina de estados e prazo
  // -------------------------------------------------------------------------

  it("recusa transição proibida com 409", async () => {
    const broker = await registerBroker(app, "Ana Corretora", "ana@teste.dev");
    const leadId = await criarLead(broker);
    const view = await criarSolicitacao(broker, leadId);

    // Revogar um rascunho não existe: o link ainda nem nasceu.
    const res = await requestAs(app, broker, { method: "POST", url: `/api/financing-requests/${view.code}/revoke` });
    expect(res.statusCode).toBe(409);
  });

  it("prazo vencido vira expirada na leitura, e o hash do token some", async () => {
    const broker = await registerBroker(app, "Ana Corretora", "ana@teste.dev");
    const leadId = await criarLead(broker);
    const view = await criarSolicitacao(broker, leadId);
    await requestAs(app, broker, { method: "POST", url: `/api/financing-requests/${view.code}/send` });

    // O relógio do banco decide: vence o prazo direto no registro.
    await prisma.financingDataRequest.update({
      where: { id: view.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const res = await requestAs(app, broker, { method: "GET", url: `/api/financing-requests/${view.code}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("expirada");
    const row = await prisma.financingDataRequest.findUnique({ where: { id: view.id } });
    expect(row?.tokenHash).toBeNull();
  });

  it("arquiva de qualquer estado permitido e trava depois", async () => {
    const broker = await registerBroker(app, "Ana Corretora", "ana@teste.dev");
    const leadId = await criarLead(broker);
    const view = await criarSolicitacao(broker, leadId);

    const arquiva = await requestAs(app, broker, { method: "POST", url: `/api/financing-requests/${view.code}/archive` });
    expect(arquiva.statusCode).toBe(200);
    expect(arquiva.json().status).toBe("arquivada");

    const denovo = await requestAs(app, broker, { method: "POST", url: `/api/financing-requests/${view.code}/send` });
    expect(denovo.statusCode).toBe(409);
  });

  // -------------------------------------------------------------------------
  // Isolamento entre corretores
  // -------------------------------------------------------------------------

  it("um corretor não vê nem transiciona a solicitação do outro", async () => {
    const ana = await registerBroker(app, "Ana Corretora", "ana@teste.dev");
    const bia = await registerBroker(app, "Bia Corretora", "bia@teste.dev");
    const leadDaAna = await criarLead(ana);
    const view = await criarSolicitacao(ana, leadDaAna);

    const lista = await requestAs(app, bia, { method: "GET", url: "/api/financing-requests" });
    expect(lista.statusCode).toBe(200);
    expect(lista.json()).toHaveLength(0);

    const detalhe = await requestAs(app, bia, { method: "GET", url: `/api/financing-requests/${view.code}` });
    expect(detalhe.statusCode).toBe(404);

    const envio = await requestAs(app, bia, { method: "POST", url: `/api/financing-requests/${view.code}/send` });
    expect(envio.statusCode).toBe(404);

    const criaComLeadAlheia = await requestAs(app, bia, {
      method: "POST",
      url: "/api/financing-requests",
      payload: { leadId: leadDaAna },
    });
    expect(criaComLeadAlheia.statusCode).toBe(404);
  });

  it("marca a timeline da lead no envio", async () => {
    const broker = await registerBroker(app, "Ana Corretora", "ana@teste.dev");
    const leadId = await criarLead(broker);
    const view = await criarSolicitacao(broker, leadId);
    await requestAs(app, broker, { method: "POST", url: `/api/financing-requests/${view.code}/send` });

    const atividades = await prisma.leadActivity.findMany({ where: { leadId, type: "financiamento" } });
    expect(atividades).toHaveLength(1);
    expect(atividades[0].description).toContain("simulação");
  });
});
