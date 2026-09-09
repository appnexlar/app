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
 * Preferências num lugar só (entidade única, etapa 4, set 2026).
 *
 * O que estes testes guardam: o que o corretor anota no cadastro rápido é a
 * mesma coisa que a ficha edita e que a seleção usa; região e faixa nunca
 * ficam em dois registros discordantes; e anotar preferência pela ficha
 * conta como marco da jornada guiada.
 */
describe("Preferências unificadas", () => {
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

  it("região e faixa do cadastro rápido nascem como preferência", async () => {
    const c = await criarCliente(app, ana, {
      fullName: "Marina Zona Sul",
      region: "Zona sul, perto do metrô",
      budgetMin: 300000,
      budgetMax: 500000,
    });

    const pref = await requestAs(app, ana, { method: "GET", url: `/api/clients/${c.id}/preferences` });
    expect(pref.statusCode).toBe(200);
    expect(pref.json()).toMatchObject({
      region: "Zona sul, perto do metrô",
      priceMin: 300000,
      priceMax: 500000,
    });

    // O resumo continua mostrando o que sempre mostrou.
    expect(c.region).toBe("Zona sul, perto do metrô");
    expect(c.budgetMax).toBe(500000);
  });

  it("cadastro sem nenhum critério não cria preferência vazia", async () => {
    const c = await criarCliente(app, ana, { fullName: "Sem Nada" });
    expect(await prisma.leadPreference.count({ where: { leadId: c.id } })).toBe(0);
    const pref = await requestAs(app, ana, { method: "GET", url: `/api/clients/${c.id}/preferences` });
    expect(pref.json()).toBeNull();
  });

  it("finalidade e região do cadastro convivem no mesmo registro", async () => {
    const c = await criarCliente(app, ana, { purpose: "locacao", region: "Centro" });
    const pref = await prisma.leadPreference.findUniqueOrThrow({ where: { leadId: c.id } });
    expect(pref.purpose).toBe("locacao");
    expect(pref.region).toBe("Centro");
  });

  it("editar pela ficha atualiza a região e a faixa que a lista mostra", async () => {
    const c = await criarCliente(app, ana, { region: "Centro", budgetMax: 400000 });

    const salvo = await requestAs(app, ana, {
      method: "PUT",
      url: `/api/clients/${c.id}/preferences`,
      payload: { region: "Moema", priceMin: 500000, priceMax: 800000, bedroomsMin: 2 },
    });
    expect(salvo.statusCode).toBe(200);
    expect(salvo.json().region).toBe("Moema");

    const ficha = await requestAs(app, ana, { method: "GET", url: `/api/clients/${c.id}` });
    expect(ficha.json()).toMatchObject({ region: "Moema", budgetMin: 500000, budgetMax: 800000 });

    // Limpar a região na ficha limpa no resumo também: nunca dois valores.
    await requestAs(app, ana, {
      method: "PUT",
      url: `/api/clients/${c.id}/preferences`,
      payload: { bedroomsMin: 2 },
    });
    const depois = await requestAs(app, ana, { method: "GET", url: `/api/clients/${c.id}` });
    expect(depois.json()).toMatchObject({ region: null, budgetMin: null, budgetMax: null });
  });

  it("anotar preferências pela ficha conclui o passo da jornada guiada", async () => {
    const c = await criarCliente(app, ana, { fullName: "Sem Preferência" });

    const antes = await requestAs(app, ana, { method: "GET", url: "/api/guidance" });
    const itemAntes = antes.json().checklist.items.find((i: { key: string }) => i.key === "preferencias");
    expect(itemAntes?.done).toBe(false);
    expect(itemAntes?.actionUrl).toBe("/clientes");

    await requestAs(app, ana, {
      method: "PUT",
      url: `/api/clients/${c.id}/preferences`,
      payload: { cities: ["São Paulo"] },
    });

    const depois = await requestAs(app, ana, { method: "GET", url: "/api/guidance" });
    const itemDepois = depois.json().checklist.items.find((i: { key: string }) => i.key === "preferencias");
    expect(itemDepois?.done).toBe(true);
    expect(await prisma.productEvent.count({ where: { brokerId: ana.brokerId, type: "LEAD_PREFERENCES_ADDED" } })).toBe(1);
  });

  it("outro corretor não lê nem grava as preferências", async () => {
    const bruno = await registerBroker(app, "Bruno", "bruno@teste.com");
    const c = await criarCliente(app, ana, { region: "Centro" });
    const leitura = await requestAs(app, bruno, { method: "GET", url: `/api/clients/${c.id}/preferences` });
    expect(leitura.statusCode).toBe(404);
    const escrita = await requestAs(app, bruno, {
      method: "PUT",
      url: `/api/clients/${c.id}/preferences`,
      payload: { region: "Invasão" },
    });
    expect(escrita.statusCode).toBe(404);
    const pref = await prisma.leadPreference.findUniqueOrThrow({ where: { leadId: c.id } });
    expect(pref.region).toBe("Centro");
  });
});
