import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { BadRequestException } from "@nestjs/common";
import { createTestApp, registerBroker, requestAs, resetDatabase } from "./e2e-utils";
import { PrismaService } from "../src/prisma/prisma.service";
import { ProductEventService } from "../src/guidance/product-event.service";

/**
 * Fundação da Jornada 2: o registro de eventos de produto.
 *
 * O que estes testes protegem:
 *  - idempotência dos marcos (§27): o mesmo FIRST_* não duplica;
 *  - eventos repetíveis realmente repetem;
 *  - isolamento por corretor (GUI-07): o evento de um não conta para o outro;
 *  - validação (§26): tipo fora do catálogo é recusado;
 *  - a emissão real disparada pelos fluxos existentes (criar lead).
 */
describe("ProductEvent — fundação da experiência guiada", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let events: ProductEventService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    events = app.get(ProductEventService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  async function contarEventos(brokerId: string, type: string): Promise<number> {
    return prisma.productEvent.count({ where: { brokerId, type } });
  }

  it("um marco registrado duas vezes não duplica", async () => {
    const corretor = await registerBroker(app, "Ana", "ana@teste.dev");

    await events.track(corretor.brokerId, { type: "FIRST_LEAD_CREATED" });
    await events.track(corretor.brokerId, { type: "FIRST_LEAD_CREATED" });
    await events.track(corretor.brokerId, { type: "FIRST_LEAD_CREATED" });

    expect(await contarEventos(corretor.brokerId, "FIRST_LEAD_CREATED")).toBe(1);
  });

  it("evento repetível registra toda vez que acontece", async () => {
    const corretor = await registerBroker(app, "Beto", "beto@teste.dev");

    await events.track(corretor.brokerId, { type: "GUIDANCE_SHOWN" });
    await events.track(corretor.brokerId, { type: "GUIDANCE_SHOWN" });

    expect(await contarEventos(corretor.brokerId, "GUIDANCE_SHOWN")).toBe(2);
  });

  it("evento repetível deduplica quando recebe uma chave explícita", async () => {
    const corretor = await registerBroker(app, "Cadu", "cadu@teste.dev");

    await events.track(corretor.brokerId, { type: "FEATURE_DISCOVERED", dedupeKey: "feature:tags" });
    await events.track(corretor.brokerId, { type: "FEATURE_DISCOVERED", dedupeKey: "feature:tags" });
    await events.track(corretor.brokerId, { type: "FEATURE_DISCOVERED", dedupeKey: "feature:relatorios" });

    expect(await contarEventos(corretor.brokerId, "FEATURE_DISCOVERED")).toBe(2);
  });

  it("recusa um tipo de evento fora do catálogo", async () => {
    const corretor = await registerBroker(app, "Duda", "duda@teste.dev");

    await expect(
      // @ts-expect-error: tipo inválido de propósito, é o que o teste verifica.
      events.track(corretor.brokerId, { type: "EVENTO_QUE_NAO_EXISTE" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(await prisma.productEvent.count({ where: { brokerId: corretor.brokerId } })).toBe(0);
  });

  it("isola os eventos por corretor: o marco de um não conta para o outro", async () => {
    const ana = await registerBroker(app, "Ana", "ana2@teste.dev");
    const beto = await registerBroker(app, "Beto", "beto2@teste.dev");

    await events.track(ana.brokerId, { type: "FIRST_LEAD_CREATED" });

    expect(await contarEventos(ana.brokerId, "FIRST_LEAD_CREATED")).toBe(1);
    expect(await contarEventos(beto.brokerId, "FIRST_LEAD_CREATED")).toBe(0);

    // O mesmo marco pode existir uma vez para cada corretor, sem conflito.
    await events.track(beto.brokerId, { type: "FIRST_LEAD_CREATED" });
    expect(await contarEventos(beto.brokerId, "FIRST_LEAD_CREATED")).toBe(1);
  });

  it("hasMilestone reflete o que já aconteceu", async () => {
    const corretor = await registerBroker(app, "Edu", "edu@teste.dev");

    expect(await events.hasMilestone(corretor.brokerId, "FIRST_PROPERTY_CREATED")).toBe(false);
    await events.track(corretor.brokerId, { type: "FIRST_PROPERTY_CREATED" });
    expect(await events.hasMilestone(corretor.brokerId, "FIRST_PROPERTY_CREATED")).toBe(true);
  });

  it("criar leads pela API emite FIRST_LEAD_CREATED uma vez só", async () => {
    const corretor = await registerBroker(app, "Fabi", "fabi@teste.dev");

    const primeira = await requestAs(app, corretor, {
      method: "POST",
      url: "/api/leads",
      payload: { fullName: "Cliente Um", whatsapp: "11999990001" },
    });
    expect(primeira.statusCode).toBe(201);

    const segunda = await requestAs(app, corretor, {
      method: "POST",
      url: "/api/leads",
      payload: { fullName: "Cliente Dois", whatsapp: "11999990002" },
    });
    expect(segunda.statusCode).toBe(201);

    // Duas leads, mas o marco de "primeira lead" é único.
    expect(await contarEventos(corretor.brokerId, "FIRST_LEAD_CREATED")).toBe(1);
  });

  it("lead cadastrada com preferências emite também LEAD_PREFERENCES_ADDED", async () => {
    const corretor = await registerBroker(app, "Gabi", "gabi@teste.dev");

    const semPref = await requestAs(app, corretor, {
      method: "POST",
      url: "/api/leads",
      payload: { fullName: "Sem Preferência", whatsapp: "11999990003" },
    });
    expect(semPref.statusCode).toBe(201);
    expect(await contarEventos(corretor.brokerId, "LEAD_PREFERENCES_ADDED")).toBe(0);

    const comPref = await requestAs(app, corretor, {
      method: "POST",
      url: "/api/leads",
      payload: { fullName: "Com Preferência", whatsapp: "11999990004", region: "Centro" },
    });
    expect(comPref.statusCode).toBe(201);
    expect(await contarEventos(corretor.brokerId, "LEAD_PREFERENCES_ADDED")).toBe(1);
  });
});
