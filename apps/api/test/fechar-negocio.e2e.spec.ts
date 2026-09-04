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
 * Fechar o negócio pelo funil (entidade única, set 2026).
 *
 * "Fechado" deixou de ser uma etapa proibida à mudança de status. Chegar nela
 * pelo funil grava o mesmo que a antiga conversão gravava: a marca na pessoa,
 * o registro do fechamento, a timeline, a auditoria e o marco do checklist.
 * A rota antiga de conversão continua como apelido, com os detalhes a mais.
 */
describe("Fechar o negócio", () => {
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

  it("mudar a etapa para 'fechado' fecha o negócio, sem exigir consentimento", async () => {
    const c = await criarCliente(app, ana);
    const res = await requestAs(app, ana, {
      method: "PATCH",
      url: `/api/clients/${c.id}/status`,
      payload: { status: "fechado", purpose: "locacao", closeNote: "Assinou o contrato" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("fechado");
    expect(res.json().isClient).toBe(true);
    expect(res.json().convertedAt).not.toBeNull();

    const conversao = await prisma.conversion.findUniqueOrThrow({ where: { leadId: c.id } });
    expect(conversao.purpose).toBe("locacao");
    expect(conversao.reasonDetail).toBe("Assinou o contrato");
    // Sem ciência dada, nada de consentimento: ele é colhido antes do primeiro
    // dado complementar, não ao mudar de etapa.
    expect(conversao.consentGiven).toBe(false);
    expect(await prisma.consent.count({ where: { leadId: c.id } })).toBe(0);

    const timeline = await prisma.leadActivity.findFirst({
      where: { leadId: c.id, type: "conversao" },
    });
    expect(timeline?.description).toBe("Negócio fechado");
    const marco = await prisma.productEvent.findFirst({
      where: { brokerId: ana.brokerId, type: "FIRST_LEAD_CONVERTED" },
    });
    expect(marco).not.toBeNull();
  });

  it("fechar pela rota antiga de conversão continua funcionando, com os detalhes", async () => {
    const c = await criarCliente(app, ana);
    const res = await requestAs(app, ana, {
      method: "POST",
      url: `/api/leads/${c.id}/convert`,
      payload: {
        reason: "preparacao_proposta",
        nextStep: "preparar_proposta",
        purpose: "compra",
        consent: true,
      },
    });
    expect(res.statusCode).toBe(201);
    const conversao = await prisma.conversion.findUniqueOrThrow({ where: { leadId: c.id } });
    expect(conversao.reason).toBe("preparacao_proposta");
    expect(conversao.consentGiven).toBe(true);
    expect(await prisma.consent.count({ where: { leadId: c.id } })).toBe(1);
  });

  it("fechar de novo quem já fechou não duplica o fechamento", async () => {
    const c = await criarCliente(app, ana);
    await requestAs(app, ana, {
      method: "PATCH",
      url: `/api/clients/${c.id}/status`,
      payload: { status: "fechado" },
    });
    const denovo = await requestAs(app, ana, {
      method: "PATCH",
      url: `/api/clients/${c.id}/status`,
      payload: { status: "fechado" },
    });
    expect(denovo.statusCode).toBe(200);
    expect(await prisma.conversion.count({ where: { leadId: c.id } })).toBe(1);
  });

  it("a ficha de quem não fechou abre pela rota de clientes", async () => {
    const c = await criarCliente(app, ana, { fullName: "Ainda Novo" });
    const ficha = await requestAs(app, ana, { method: "GET", url: `/api/clients/${c.id}` });
    expect(ficha.statusCode).toBe(200);
    expect(ficha.json().fullName).toBe("Ainda Novo");
    expect(ficha.json().conversion).toBeNull();
  });

  it("imóvel de outro corretor não pode ser o imóvel do fechamento", async () => {
    const bruno = await registerBroker(app, "Bruno", "bruno@teste.com");
    const imovel = await prisma.property.create({
      data: {
        brokerId: bruno.brokerId,
        title: "Apto do Bruno",
        purpose: "venda",
        category: "residencial",
        type: "apartamento",
        origin: "captacao_propria",
        status: "disponivel",
        city: "São Paulo",
      },
    });
    const c = await criarCliente(app, ana);
    const res = await requestAs(app, ana, {
      method: "PATCH",
      url: `/api/clients/${c.id}/status`,
      payload: { status: "fechado", propertyId: imovel.id },
    });
    expect(res.statusCode).toBe(404);
    expect(await prisma.conversion.count()).toBe(0);
  });
});
