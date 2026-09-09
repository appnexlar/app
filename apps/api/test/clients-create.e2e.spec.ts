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
 * Cadastro de cliente na entidade única (set 2026).
 *
 * As regras que estes testes guardam: todo mundo entra pelo mesmo cadastro
 * rápido e nasce em "novo"; a etapa é a etiqueta, não o tipo de cadastro;
 * quem traz carteira pode entrar já em "fechado", e só aí a ciência da coleta
 * é exigida; a mesma pessoa nunca vira duas fichas.
 */
describe("Cadastro de cliente (entidade única)", () => {
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

  it("o cadastro rápido cria a pessoa em 'novo', sem exigir nada além de nome e WhatsApp", async () => {
    const res = await requestAs(app, ana, {
      method: "POST",
      url: "/api/clients",
      payload: { fullName: "Marina Nova", whatsapp: "11988887777" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("novo");
    expect(res.json().isClient).toBe(false);

    // Aparece na lista única e também na rota antiga de leads (apelido).
    const lista = await requestAs(app, ana, { method: "GET", url: "/api/clients" });
    expect(lista.json()).toHaveLength(1);
    const antiga = await requestAs(app, ana, { method: "GET", url: "/api/leads" });
    expect(antiga.json()).toHaveLength(1);
  });

  it("aceita o formato do formulário anterior (phone no lugar de whatsapp)", async () => {
    const res = await requestAs(app, ana, {
      method: "POST",
      url: "/api/clients",
      payload: { fullName: "Marina Antiga", phone: "(11) 98888-7777" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().whatsapp).toBe("11988887777");
  });

  it("carteira antiga: pode nascer já em 'fechado', e aí a ciência é obrigatória", async () => {
    const semCiencia = await requestAs(app, ana, {
      method: "POST",
      url: "/api/clients",
      payload: { fullName: "Carlos Carteira", whatsapp: "11977776666", status: "fechado" },
    });
    expect(semCiencia.statusCode).toBe(400);
    expect(await prisma.lead.count()).toBe(0);

    const res = await requestAs(app, ana, {
      method: "POST",
      url: "/api/clients",
      payload: {
        fullName: "Carlos Carteira",
        whatsapp: "11977776666",
        status: "fechado",
        purpose: "compra",
        consent: true,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("fechado");
    expect(res.json().isClient).toBe(true);

    const conversao = await prisma.conversion.findFirstOrThrow({ where: { brokerId: ana.brokerId } });
    expect(conversao.reason).toBe("cliente_da_carteira");
    expect(conversao.consentGiven).toBe(true);
    const consentimento = await prisma.consent.findFirst({ where: { brokerId: ana.brokerId } });
    expect(consentimento?.purpose).toBe("coleta_dados_adicionais");

    // Fechado sai da rota antiga de leads e entra no filtro de fechados.
    const antiga = await requestAs(app, ana, { method: "GET", url: "/api/leads" });
    expect(antiga.json()).toHaveLength(0);
    const fechados = await requestAs(app, ana, { method: "GET", url: "/api/clients?fechados=true" });
    expect(fechados.json()).toHaveLength(1);
  });

  it("a finalidade informada vira preferência, no vocabulário do imóvel", async () => {
    const c = await criarCliente(app, ana, { purpose: "compra" });
    const pref = await prisma.leadPreference.findUniqueOrThrow({ where: { leadId: c.id } });
    expect(pref.purpose).toBe("venda");
  });

  it("recusa nome vazio e WhatsApp curto demais", async () => {
    for (const payload of [
      { fullName: " ", whatsapp: "11988887777" },
      { fullName: "Marina", whatsapp: "119" },
    ]) {
      const res = await requestAs(app, ana, { method: "POST", url: "/api/clients", payload });
      expect(res.statusCode).toBe(400);
    }
    expect(await prisma.lead.count()).toBe(0);
  });

  it("a mesma pessoa nunca vira duas fichas: WhatsApp repetido dá 409", async () => {
    await criarCliente(app, ana, { whatsapp: "11988887777" });
    const repetido = await requestAs(app, ana, {
      method: "POST",
      url: "/api/clients",
      payload: { fullName: "Marina de novo", whatsapp: "11988887777" },
    });
    expect(repetido.statusCode).toBe(409);
    expect(await prisma.lead.count()).toBe(1);
  });

  it("a lista filtra por etapa e por grupo do funil", async () => {
    await criarCliente(app, ana, { fullName: "Novo Um" });
    const b = await criarCliente(app, ana, { fullName: "Em Visita" });
    await requestAs(app, ana, {
      method: "PATCH",
      url: `/api/clients/${b.id}/status`,
      payload: { status: "visita_agendada" },
    });

    const novos = await requestAs(app, ana, { method: "GET", url: "/api/clients?status=novo" });
    expect(novos.json().map((c: { fullName: string }) => c.fullName)).toEqual(["Novo Um"]);

    const visitas = await requestAs(app, ana, { method: "GET", url: "/api/clients?grupo=visitas" });
    expect(visitas.json().map((c: { fullName: string }) => c.fullName)).toEqual(["Em Visita"]);
  });

  it("um corretor não vê nem alcança o cliente do outro", async () => {
    const bruno = await registerBroker(app, "Bruno Corretor", "bruno@teste.com");
    const c = await criarCliente(app, ana, { whatsapp: "11988887777" });

    const lista = await requestAs(app, bruno, { method: "GET", url: "/api/clients" });
    expect(lista.json()).toHaveLength(0);
    const ficha = await requestAs(app, bruno, { method: "GET", url: `/api/clients/${c.id}` });
    expect(ficha.statusCode).toBe(404);
    const etapa = await requestAs(app, bruno, {
      method: "PATCH",
      url: `/api/clients/${c.id}/status`,
      payload: { status: "em_atendimento" },
    });
    expect(etapa.statusCode).toBe(404);

    // O mesmo WhatsApp na carteira de outro corretor é outra pessoa.
    const doBruno = await criarCliente(app, bruno, { whatsapp: "11988887777" });
    expect(doBruno.id).not.toBe(c.id);
  });

  it("exige autenticação", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/clients",
      payload: { fullName: "X", whatsapp: "11988887777" },
    });
    expect(res.statusCode).toBe(401);
  });
});
