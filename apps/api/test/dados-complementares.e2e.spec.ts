import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  createTestApp,
  criarCliente,
  registerBroker,
  requestAs,
  resetDatabase,
  type TestBroker,
} from "./e2e-utils";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * Dados complementares em qualquer etapa, com ciência antes do primeiro dado
 * sensível (entidade única, etapa 5, set 2026).
 *
 * O que estes testes guardam: a etapa nunca bloqueia a coleta; dado pessoal
 * ou financeiro só entra depois da ciência da pessoa; a ciência é registrada
 * uma vez e vale para a ficha inteira; dado de negociação não é sensível e
 * não passa pela porta.
 */
describe("Dados complementares e ciência da coleta", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let ana: TestBroker;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    ana = await registerBroker(app, "Ana Corretora", "ana@teste.com");
  });

  it("quem ainda está em atendimento pode receber dados da negociação", async () => {
    const c = await criarCliente(app, ana, { fullName: "Em Atendimento" });
    const res = await requestAs(app, ana, {
      method: "PATCH",
      url: `/api/clients/${c.id}/negotiation`,
      payload: { propertyValue: 450000, needsFinancing: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().needsFinancing).toBe(true);
  });

  it("dado pessoal, financeiro ou de participante sem ciência é recusado com um código claro", async () => {
    const c = await criarCliente(app, ana);
    const tentativas = [
      { method: "PATCH" as const, url: `/api/clients/${c.id}/profile`, payload: { cpf: "39053344705" } },
      { method: "PATCH" as const, url: `/api/clients/${c.id}/financial`, payload: { monthlyIncome: 8000 } },
      {
        method: "POST" as const,
        url: `/api/clients/${c.id}/participants`,
        payload: { relation: "conjuge", fullName: "Par" },
      },
    ];
    for (const t of tentativas) {
      const res = await requestAs(app, ana, t);
      expect(res.statusCode).toBe(409);
      expect(res.json().details?.code).toBe("consent_required");
    }
    expect(await prisma.clientProfile.count({ where: { leadId: c.id } })).toBe(0);
    expect(await prisma.clientFinancial.count({ where: { leadId: c.id } })).toBe(0);
    expect(await prisma.clientParticipant.count({ where: { leadId: c.id } })).toBe(0);
  });

  it("registrar a ciência destrava a ficha inteira e fica no histórico", async () => {
    const c = await criarCliente(app, ana);

    const ciencia = await requestAs(app, ana, { method: "POST", url: `/api/clients/${c.id}/consent` });
    expect(ciencia.statusCode).toBe(201);
    expect(ciencia.json().purpose).toBe("coleta_dados_adicionais");

    // Idempotente: a segunda chamada devolve o mesmo registro.
    const deNovo = await requestAs(app, ana, { method: "POST", url: `/api/clients/${c.id}/consent` });
    expect(deNovo.json().id).toBe(ciencia.json().id);
    expect(await prisma.consent.count({ where: { leadId: c.id } })).toBe(1);

    const perfil = await requestAs(app, ana, {
      method: "PATCH",
      url: `/api/clients/${c.id}/profile`,
      payload: { cpf: "39053344705" },
    });
    expect(perfil.statusCode).toBe(200);
    const financeiro = await requestAs(app, ana, {
      method: "PATCH",
      url: `/api/clients/${c.id}/financial`,
      payload: { monthlyIncome: 8000 },
    });
    expect(financeiro.statusCode).toBe(200);

    const ficha = await requestAs(app, ana, { method: "GET", url: `/api/clients/${c.id}` });
    expect(ficha.json().consents).toHaveLength(1);
    expect(ficha.json().activities.map((a: { description: string }) => a.description)).toContain(
      "Ciência da coleta de dados registrada",
    );
  });

  it("quem fechou com ciência não precisa registrar de novo", async () => {
    const c = await criarCliente(app, ana, { status: "fechado", purpose: "compra", consent: true });
    const perfil = await requestAs(app, ana, {
      method: "PATCH",
      url: `/api/clients/${c.id}/profile`,
      payload: { cpf: "39053344705" },
    });
    expect(perfil.statusCode).toBe(200);

    // E registrar a ciência depois do fechamento também marca o fechamento.
    const outro = await criarCliente(app, ana, { fullName: "Fechado sem ciência" });
    await requestAs(app, ana, {
      method: "PATCH",
      url: `/api/clients/${outro.id}/status`,
      payload: { status: "fechado", purpose: "compra" },
    });
    await requestAs(app, ana, { method: "POST", url: `/api/clients/${outro.id}/consent` });
    const conv = await prisma.conversion.findUniqueOrThrow({ where: { leadId: outro.id } });
    expect(conv.consentGiven).toBe(true);
  });

  it("outro corretor não registra ciência nem grava dados na pessoa alheia", async () => {
    const bruno = await registerBroker(app, "Bruno", "bruno@teste.com");
    const c = await criarCliente(app, ana);
    const ciencia = await requestAs(app, bruno, { method: "POST", url: `/api/clients/${c.id}/consent` });
    expect(ciencia.statusCode).toBe(404);
    const perfil = await requestAs(app, bruno, {
      method: "PATCH",
      url: `/api/clients/${c.id}/profile`,
      payload: { cpf: "39053344705" },
    });
    expect(perfil.statusCode).toBe(404);
    expect(await prisma.consent.count({ where: { leadId: c.id } })).toBe(0);
  });
});
