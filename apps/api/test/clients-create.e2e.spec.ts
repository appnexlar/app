import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createTestApp, registerBroker, requestAs, resetDatabase, type TestBroker } from "./e2e-utils";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * Cadastro de cliente direto, sem lead anterior.
 *
 * A regra que estes testes guardam: a pessoa nasce cliente e FORA do funil.
 * Quem chega ao Nextlar com carteira formada não tem lead nenhuma para
 * converter, e obrigá-lo a inventar uma faria a pessoa aparecer no funil de
 * leads como se fosse alguém a atender do zero.
 */
describe("Cadastro de cliente direto", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let ana: TestBroker;

  const cliente = {
    fullName: "Marina Compradora",
    phone: "11988887777",
    purpose: "compra" as const,
    consent: true as const,
  };

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

  it("cria a pessoa já como cliente, sem passar pelo funil de leads", async () => {
    const res = await requestAs(app, ana, { method: "POST", url: "/api/clients", payload: cliente });
    expect(res.statusCode).toBe(201);

    const criado = res.json();
    expect(criado.fullName).toBe("Marina Compradora");

    // Aparece entre os clientes...
    const clientes = await requestAs(app, ana, { method: "GET", url: "/api/clients" });
    expect(clientes.json()).toHaveLength(1);

    // ...e não aparece no funil, que é a diferença que importa aqui.
    const leads = await requestAs(app, ana, { method: "GET", url: "/api/leads" });
    expect(leads.json()).toHaveLength(0);

    const linha = await prisma.lead.findFirstOrThrow({ where: { brokerId: ana.brokerId } });
    expect(linha.isClient).toBe(true);
    expect(linha.status).toBe("convertida_em_cliente");
    expect(linha.convertedAt).not.toBeNull();
  });

  it("registra a conversão com o motivo de quem já era da carteira", async () => {
    await requestAs(app, ana, { method: "POST", url: "/api/clients", payload: cliente });

    const conversao = await prisma.conversion.findFirstOrThrow({
      where: { brokerId: ana.brokerId },
    });
    expect(conversao.reason).toBe("cliente_da_carteira");
    expect(conversao.nextStep).toBe("coletar_dados");
    expect(conversao.purpose).toBe("compra");
    expect(conversao.consentGiven).toBe(true);
  });

  it("guarda o consentimento: é ele que sustenta guardar CPF e renda depois", async () => {
    await requestAs(app, ana, { method: "POST", url: "/api/clients", payload: cliente });

    const consentimento = await prisma.consent.findFirstOrThrow({
      where: { brokerId: ana.brokerId },
    });
    expect(consentimento.purpose).toBe("coleta_dados_adicionais");
  });

  it("recusa sem a ciência da coleta", async () => {
    const res = await requestAs(app, ana, {
      method: "POST",
      url: "/api/clients",
      payload: { ...cliente, consent: false },
    });
    expect(res.statusCode).toBe(400);
    expect(await prisma.lead.count()).toBe(0);
  });

  it("recusa nome vazio e WhatsApp curto demais", async () => {
    for (const payload of [
      { ...cliente, fullName: " " },
      { ...cliente, phone: "119" },
    ]) {
      const res = await requestAs(app, ana, { method: "POST", url: "/api/clients", payload });
      expect(res.statusCode).toBe(400);
    }
    expect(await prisma.lead.count()).toBe(0);
  });

  it("não deixa criar duas fichas da mesma pessoa pelo WhatsApp", async () => {
    await requestAs(app, ana, { method: "POST", url: "/api/clients", payload: cliente });
    const repetido = await requestAs(app, ana, {
      method: "POST",
      url: "/api/clients",
      payload: { ...cliente, fullName: "Marina de novo" },
    });

    expect(repetido.statusCode).toBe(409);
    expect(await prisma.lead.count()).toBe(1);
  });

  it("quando já existe LEAD com o mesmo WhatsApp, manda converter pela ficha dela", async () => {
    await requestAs(app, ana, {
      method: "POST",
      url: "/api/leads",
      payload: { fullName: "Marina Lead", whatsapp: cliente.phone, source: "whatsapp" },
    });

    const res = await requestAs(app, ana, { method: "POST", url: "/api/clients", payload: cliente });

    expect(res.statusCode).toBe(409);
    // A mensagem aponta o caminho certo: converter preserva a jornada toda
    // (histórico, imóveis enviados, visitas), e cadastrar de novo a perderia.
    expect(res.json().message).toContain("Converta a lead");
  });

  it("um corretor não vê nem alcança o cliente do outro", async () => {
    const bruno = await registerBroker(app, "Bruno Corretor", "bruno@teste.com");
    const criado = await requestAs(app, ana, {
      method: "POST",
      url: "/api/clients",
      payload: cliente,
    });
    const id = criado.json().id;

    const lista = await requestAs(app, bruno, { method: "GET", url: "/api/clients" });
    expect(lista.json()).toHaveLength(0);

    const ficha = await requestAs(app, bruno, { method: "GET", url: `/api/clients/${id}` });
    expect(ficha.statusCode).toBe(404);

    // O mesmo WhatsApp na carteira de outro corretor é outra pessoa para o
    // sistema: a checagem de repetido é por corretor, nunca global.
    const doBruno = await requestAs(app, bruno, {
      method: "POST",
      url: "/api/clients",
      payload: cliente,
    });
    expect(doBruno.statusCode).toBe(201);
  });

  it("exige autenticação", async () => {
    const res = await app.inject({ method: "POST", url: "/api/clients", payload: cliente });
    expect(res.statusCode).toBe(401);
  });
});
