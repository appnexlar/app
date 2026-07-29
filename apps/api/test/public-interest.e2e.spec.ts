import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { NotificationListResponse } from "@nexlar/shared";
import { createTestApp, registerBroker, requestAs, resetDatabase, type TestBroker } from "./e2e-utils";
import { PrismaService } from "../src/prisma/prisma.service";
import { RateLimitStore } from "../src/common/rate-limit/rate-limit.store";

/**
 * e2e do "tenho interesse": o formulário aberto na internet vira lead na
 * carteira do corretor certo, com consentimento registrado e aviso no sino.
 *
 * É a única rota pública que ESCREVE no banco. Por isso os testes aqui olham
 * tanto para o que ela cria quanto para o que ela recusa a criar.
 */
describe("Página Pública — interesse do visitante e notificações", () => {
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

  /** Corretor com página ativa e um imóvel publicado. Devolve o código dele. */
  async function montarVitrine(
    slug: string,
    email: string,
  ): Promise<{ broker: TestBroker; code: number }> {
    const broker = await registerBroker(app, "Dona Vitrine", email);
    await requestAs(app, broker, { method: "GET", url: "/api/public-page/me" });
    await prisma.broker.update({
      where: { id: broker.brokerId },
      data: { avatarUrl: "https://cdn.exemplo/foto.jpg", creci: "123456", creciUf: "SP" },
    });

    const imovel = await prisma.property.create({
      data: {
        brokerId: broker.brokerId,
        title: "Apartamento com varanda",
        purpose: "venda",
        category: "residencial",
        type: "Apartamento",
        origin: "captacao_propria",
        status: "disponivel",
        city: "São Paulo",
        salePrice: 500_000,
        publicVisibility: "publico",
      },
    });
    await prisma.propertyMedia.create({
      data: {
        brokerId: broker.brokerId,
        propertyId: imovel.id,
        kind: "foto",
        status: "pronto",
        isCover: true,
        storagePath: `brokers/${broker.brokerId}/properties/${imovel.id}/images/x`,
      },
    });

    const patch = await requestAs(app, broker, {
      method: "PATCH",
      url: "/api/public-page/me",
      payload: {
        slug,
        mainCity: "São Paulo",
        publicWhatsapp: "11999998888",
        acceptPublicationTerms: true,
      },
    });
    expect(patch.statusCode).toBe(200);
    const pub = await requestAs(app, broker, {
      method: "POST",
      url: "/api/public-page/me/publicar",
    });
    expect(pub.statusCode).toBe(201);

    return { broker, code: imovel.code };
  }

  function demonstrarInteresse(
    slug: string,
    code: number,
    payload: Record<string, unknown>,
  ) {
    return app.inject({
      method: "POST",
      url: `/api/public/corretor/${slug}/imoveis/${code}/interesse`,
      payload,
    });
  }

  const VISITANTE = {
    name: "Joana Interessada",
    whatsapp: "11977776666",
    message: "Gostaria de agendar uma visita.",
    acceptedTerms: true,
  };

  async function notificacoes(broker: TestBroker): Promise<NotificationListResponse> {
    const res = await requestAs(app, broker, { method: "GET", url: "/api/notificacoes" });
    expect(res.statusCode).toBe(200);
    return res.json() as NotificationListResponse;
  }

  // -------------------------------------------------------------------------
  // O caminho feliz
  // -------------------------------------------------------------------------

  it("interesse vira lead do corretor certo, com consentimento e aviso", async () => {
    const { broker, code } = await montarVitrine("vitrine-int", "dona.int@teste.dev");

    const res = await demonstrarInteresse("vitrine-int", code, VISITANTE);
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);

    const lead = await prisma.lead.findFirstOrThrow({ where: { brokerId: broker.brokerId } });
    expect(lead.fullName).toBe("Joana Interessada");
    expect(lead.whatsapp).toBe("11977776666");
    expect(lead.source).toBe("pagina_publica");
    expect(lead.status).toBe("novo");

    // LGPD: o aceite fica registrado com finalidade e versão, não como flag solta.
    const consent = await prisma.consent.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(consent.purpose).toBe("contato_pagina_publica");
    expect(consent.textVersion).toBeTruthy();

    // A atividade guarda QUAL imóvel despertou o interesse e o recado.
    const atividade = await prisma.leadActivity.findFirstOrThrow({
      where: { leadId: lead.id, type: "contato" },
    });
    expect(atividade.description).toContain(`#${code}`);
    expect(atividade.metadata).toMatchObject({ propertyCode: code, message: VISITANTE.message });

    const avisos = await notificacoes(broker);
    expect(avisos.unreadCount).toBe(1);
    expect(avisos.items[0]?.title).toContain("Novo interessado");
    expect(avisos.items[0]?.actionUrl).toBe(`/leads/${lead.id}`);
  });

  it("mesmo WhatsApp duas vezes não duplica a lead: registra o novo interesse", async () => {
    const { broker, code } = await montarVitrine("vitrine-dup", "dona.dup@teste.dev");

    await demonstrarInteresse("vitrine-dup", code, VISITANTE);
    const segunda = await demonstrarInteresse("vitrine-dup", code, {
      ...VISITANTE,
      name: "Joana de novo",
      message: "Ainda interessada",
    });
    expect(segunda.statusCode).toBe(201);

    const leads = await prisma.lead.findMany({ where: { brokerId: broker.brokerId } });
    expect(leads).toHaveLength(1);

    // Uma lead, dois contatos registrados: o histórico não se perde.
    const atividades = await prisma.leadActivity.findMany({
      where: { leadId: leads[0].id, type: "contato" },
    });
    expect(atividades).toHaveLength(2);

    // O corretor é avisado das duas vezes, com o texto certo em cada caso.
    const avisos = await notificacoes(broker);
    expect(avisos.unreadCount).toBe(2);
    expect(avisos.items.map((i) => i.type)).toEqual([
      "nova_demonstracao_interesse",
      "novo_lead_pagina_publica",
    ]);
  });

  // -------------------------------------------------------------------------
  // O que a rota recusa
  // -------------------------------------------------------------------------

  it("recusa sem aceite, com nome curto, WhatsApp inválido ou isca preenchida", async () => {
    const { code } = await montarVitrine("vitrine-val", "dona.val@teste.dev");

    const casos: [string, Record<string, unknown>][] = [
      ["sem aceite", { ...VISITANTE, acceptedTerms: false }],
      ["nome curto", { ...VISITANTE, name: "J" }],
      ["whatsapp com letra", { ...VISITANTE, whatsapp: "119777abc" }],
      ["whatsapp curto", { ...VISITANTE, whatsapp: "119" }],
      // Campo escondido do formulário: humano nunca preenche, robô preenche.
      ["isca preenchida", { ...VISITANTE, honeypot: "robo" }],
    ];

    for (const [titulo, payload] of casos) {
      const res = await demonstrarInteresse("vitrine-val", code, payload);
      expect(res.statusCode, titulo).toBe(400);
    }

    expect(await prisma.lead.count()).toBe(0);
  });

  it("página pausada e imóvel vendido não aceitam interesse", async () => {
    const { broker, code } = await montarVitrine("vitrine-off", "dona.off@teste.dev");

    await requestAs(app, broker, { method: "POST", url: "/api/public-page/me/pausar" });
    expect((await demonstrarInteresse("vitrine-off", code, VISITANTE)).statusCode).toBe(404);

    // Volta ao ar, mas o imóvel sai de circulação.
    await requestAs(app, broker, { method: "POST", url: "/api/public-page/me/publicar" });
    await prisma.property.updateMany({ where: { code }, data: { status: "vendido" } });
    expect((await demonstrarInteresse("vitrine-off", code, VISITANTE)).statusCode).toBe(400);

    expect(await prisma.lead.count()).toBe(0);
  });

  it("endereço inexistente responde igual a imóvel inexistente", async () => {
    const { code } = await montarVitrine("vitrine-404", "dona.404@teste.dev");

    expect((await demonstrarInteresse("nao-existe", code, VISITANTE)).statusCode).toBe(404);
    expect((await demonstrarInteresse("vitrine-404", 999_999, VISITANTE)).statusCode).toBe(404);
  });

  it("o limite por IP segura uma enxurrada de envios", async () => {
    const { code } = await montarVitrine("vitrine-flood", "dona.flood@teste.dev");

    const status: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await demonstrarInteresse("vitrine-flood", code, {
        ...VISITANTE,
        whatsapp: `1197777000${i}`,
      });
      status.push(res.statusCode);
    }

    expect(status.filter((s) => s === 201).length).toBeLessThanOrEqual(5);
    expect(status).toContain(429);
  });

  // -------------------------------------------------------------------------
  // Contato sem imóvel: o "Chamar no WhatsApp" da vitrine
  // -------------------------------------------------------------------------

  function pedirContato(slug: string, payload: Record<string, unknown>) {
    return app.inject({ method: "POST", url: `/api/public/corretor/${slug}/contato`, payload });
  }

  it("chamar no WhatsApp vira lead antes de a conversa começar", async () => {
    const { broker } = await montarVitrine("vitrine-wa", "dona.wa@teste.dev");

    const res = await pedirContato("vitrine-wa", VISITANTE);
    expect(res.statusCode).toBe(201);

    // O ponto da mudança: quem tocaria num link direto agora existe no CRM.
    const lead = await prisma.lead.findFirstOrThrow({ where: { brokerId: broker.brokerId } });
    expect(lead.fullName).toBe("Joana Interessada");
    expect(lead.source).toBe("pagina_publica");
    expect(lead.status).toBe("novo");

    // LGPD vale igual, com ou sem imóvel na jogada.
    const consent = await prisma.consent.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(consent.purpose).toBe("contato_pagina_publica");

    // Sem imóvel, a atividade não pode inventar um.
    const atividade = await prisma.leadActivity.findFirstOrThrow({
      where: { leadId: lead.id, type: "contato" },
    });
    expect(atividade.description).not.toContain("#");
    expect(atividade.metadata).toMatchObject({ propertyCode: null });

    const avisos = await notificacoes(broker);
    expect(avisos.unreadCount).toBe(1);
    expect(avisos.items[0]?.body).toContain("WhatsApp");
    expect(avisos.items[0]?.actionUrl).toBe(`/leads/${lead.id}`);
  });

  it("o mesmo visitante pedindo contato de novo não vira uma segunda lead", async () => {
    const { broker } = await montarVitrine("vitrine-wa2", "dona.wa2@teste.dev");

    await pedirContato("vitrine-wa2", VISITANTE);
    const segunda = await pedirContato("vitrine-wa2", { ...VISITANTE, name: "Joana de novo" });
    expect(segunda.statusCode).toBe(201);

    expect(await prisma.lead.count({ where: { brokerId: broker.brokerId } })).toBe(1);
    // As duas passagens ficam registradas, mesmo sendo uma lead só.
    const lead = await prisma.lead.findFirstOrThrow({ where: { brokerId: broker.brokerId } });
    expect(await prisma.leadActivity.count({ where: { leadId: lead.id, type: "contato" } })).toBe(2);
  });

  it("vitrine pausada não aceita contato, e robô que preenche o campo oculto é recusado", async () => {
    const { broker } = await montarVitrine("vitrine-wa3", "dona.wa3@teste.dev");

    await requestAs(app, broker, { method: "POST", url: "/api/public-page/me/pausar" });
    expect((await pedirContato("vitrine-wa3", VISITANTE)).statusCode).toBe(404);

    await requestAs(app, broker, { method: "POST", url: "/api/public-page/me/publicar" });
    const robo = await pedirContato("vitrine-wa3", { ...VISITANTE, honeypot: "comprei-tudo" });
    expect(robo.statusCode).toBe(400);

    // Sem consentimento também não passa: não é caixinha decorativa.
    const semAceite = await pedirContato("vitrine-wa3", { ...VISITANTE, acceptedTerms: false });
    expect(semAceite.statusCode).toBe(400);

    expect(await prisma.lead.count()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Isolamento e leitura dos avisos
  // -------------------------------------------------------------------------

  it("isolamento: o interesse cria lead só para o dono da página", async () => {
    const a = await montarVitrine("vitrine-ana", "ana.iso2@teste.dev");
    const b = await montarVitrine("vitrine-bruno", "bruno.iso2@teste.dev");

    await demonstrarInteresse("vitrine-ana", a.code, VISITANTE);

    expect(await prisma.lead.count({ where: { brokerId: a.broker.brokerId } })).toBe(1);
    expect(await prisma.lead.count({ where: { brokerId: b.broker.brokerId } })).toBe(0);

    // O outro corretor não vê o aviso, nem sabe que existiu.
    expect((await notificacoes(b.broker)).items).toHaveLength(0);
    expect((await notificacoes(a.broker)).unreadCount).toBe(1);
  });

  it("marcar como lida zera o contador e não vaza para o outro corretor", async () => {
    const a = await montarVitrine("vitrine-lida", "ana.lida@teste.dev");
    const b = await montarVitrine("vitrine-lida-b", "bruno.lida@teste.dev");
    await demonstrarInteresse("vitrine-lida", a.code, VISITANTE);

    const antes = await notificacoes(a.broker);
    const aviso = antes.items[0];

    // O vizinho tentando marcar pelo id: some sem erro, e nada muda.
    const doVizinho = await requestAs(app, b.broker, {
      method: "POST",
      url: `/api/notificacoes/${aviso.id}/lida`,
    });
    expect(doVizinho.statusCode).toBe(201);
    expect((await notificacoes(a.broker)).unreadCount).toBe(1);

    const dono = await requestAs(app, a.broker, {
      method: "POST",
      url: `/api/notificacoes/${aviso.id}/lida`,
    });
    expect((dono.json() as NotificationListResponse).unreadCount).toBe(0);
  });

  it("notificações exigem login", async () => {
    const res = await app.inject({ method: "GET", url: "/api/notificacoes" });
    expect(res.statusCode).toBe(401);
  });
});
