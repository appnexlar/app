import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { PublicSelectionItemDetailResponse, PublicSelectionPageResponse, SelectionView } from "@nexlar/shared";
import { createTestApp, registerBroker, requestAs, resetDatabase, type TestBroker } from "./e2e-utils";
import { PrismaService } from "../src/prisma/prisma.service";
import { RateLimitStore } from "../src/common/rate-limit/rate-limit.store";

/**
 * Fatia 3: a página da lead (/selecao/:token) e as ações dela. O que se
 * protege: só ativa e no prazo abre, o motivo interno nunca vaza, primeiro
 * nome apenas, ação vira timeline + notificação, clique repetido não duplica
 * e imóvel fora de oferta bloqueia ação sem sumir da página.
 */
describe("Seleção personalizada: página pública da lead", () => {
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

  /** Corretor + lead + seleção ativa com 2 imóveis. */
  async function cenario(email: string) {
    const ana = await registerBroker(app, "Ana", email);
    const lead = await prisma.lead.create({
      data: { brokerId: ana.brokerId, fullName: "Mariana Souza Lima", whatsapp: "11955554444" },
    });
    const criarImovel = (title: string) =>
      prisma.property.create({
        data: {
          brokerId: ana.brokerId,
          title,
          purpose: "venda",
          category: "residencial",
          type: "apartamento",
          origin: "captacao_propria",
          status: "disponivel",
          city: "São Paulo",
          neighborhood: "Moema",
          salePrice: 450_000,
          details: { bedrooms: 2 },
        },
      });
    const im1 = await criarImovel("Apartamento Aurora");
    const im2 = await criarImovel("Casa Horizonte");

    const criada = (
      await requestAs(app, ana, { method: "POST", url: "/api/selections", payload: { leadId: lead.id } })
    ).json() as SelectionView;
    for (const propertyId of [im1.id, im2.id]) {
      await requestAs(app, ana, {
        method: "POST",
        url: `/api/selections/${criada.id}/items`,
        payload: { propertyId },
      });
    }
    await requestAs(app, ana, {
      method: "PATCH",
      url: `/api/selections/${criada.id}`,
      payload: { expiresInDays: 15, message: "Separei com carinho!" },
    });
    const ativa = (
      await requestAs(app, ana, { method: "POST", url: `/api/selections/${criada.id}/activate` })
    ).json() as SelectionView;

    return { ana, lead, ativa, im1, im2 };
  }

  const abrir = async (token: string): Promise<PublicSelectionPageResponse> => {
    const res = await app.inject({ method: "GET", url: `/api/public/selecoes/${token}` });
    expect(res.statusCode).toBe(200);
    return res.json() as PublicSelectionPageResponse;
  };

  it("abre com primeiro nome, mensagem, validade e itens; conta acesso e notifica a primeira vez", async () => {
    const { ana, ativa } = await cenario("ana.pub1@teste.dev");

    const pagina = await abrir(ativa.publicToken);
    expect(pagina.available).toBe(true);
    expect(pagina.selection?.leadFirstName).toBe("Mariana");
    expect(pagina.selection?.message).toBe("Separei com carinho!");
    expect(pagina.selection?.itemCount).toBe(2);
    expect(pagina.selection?.expiresAtLabel).toBeTruthy();

    // Minimização: nome completo, telefone e ids internos não saem.
    const corpo = JSON.stringify(pagina);
    expect(corpo).not.toContain("Souza");
    expect(corpo).not.toContain("11955554444");

    await abrir(ativa.publicToken);
    const doBanco = await prisma.propertySelection.findUniqueOrThrow({ where: { id: ativa.id } });
    expect(doBanco.viewCount).toBe(2);
    expect(doBanco.viewedAt).not.toBeNull();

    // Só UMA notificação de abertura, apesar de dois acessos.
    const aberturas = await prisma.notification.findMany({
      where: { brokerId: ana.brokerId, type: "selecao_aberta" },
    });
    expect(aberturas).toHaveLength(1);
    expect(aberturas[0].title).toContain("Mariana");
  });

  it("token inválido, revogada e expirada: genérico, sem vazar motivo interno", async () => {
    const { ana, ativa } = await cenario("ana.pub2@teste.dev");

    const invalido = await abrir("token-que-nao-existe");
    expect(invalido.available).toBe(false);
    expect(invalido.broker).toBeNull();

    // Expirada: broker continua alcançável.
    await prisma.propertySelection.update({
      where: { id: ativa.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expirada = await abrir(ativa.publicToken);
    expect(expirada.available).toBe(false);
    expect(expirada.unavailableReason).toBe("expirado");
    expect(expirada.broker?.name).toBeTruthy();
    expect(expirada.selection).toBeNull();

    // E o banco persistiu a expiração na primeira leitura pública.
    expect(
      (await prisma.propertySelection.findUniqueOrThrow({ where: { id: ativa.id } })).status,
    ).toBe("expirada");

    // Revogada: acesso cai na hora.
    const outra = await cenario("ana.pub2b@teste.dev");
    await requestAs(app, outra.ana, { method: "POST", url: `/api/selections/${outra.ativa.id}/revoke` });
    const revogada = await abrir(outra.ativa.publicToken);
    expect(revogada.available).toBe(false);
    expect(revogada.unavailableReason).toBe("revogado");
    void ana;
  });

  it("gostei, não combina com motivo e desfazer: estado muda, histórico fica, sem duplicar", async () => {
    const { ana, lead, ativa } = await cenario("ana.pub3@teste.dev");
    const pagina = await abrir(ativa.publicToken);
    const [a, b] = pagina.selection?.items ?? [];

    const responder = (itemId: string, payload: Record<string, unknown>) =>
      app.inject({
        method: "POST",
        url: `/api/public/selecoes/${ativa.publicToken}/itens/${itemId}/resposta`,
        payload,
      });

    // Gostei no primeiro.
    expect((await responder(a.itemId, { response: "tenho_interesse" })).statusCode).toBe(204);
    // Clique repetido: aceito e ignorado.
    expect((await responder(a.itemId, { response: "tenho_interesse" })).statusCode).toBe(204);

    // Não combina no segundo, com motivo.
    expect(
      (await responder(b.itemId, { response: "sem_interesse", reason: "preco" })).statusCode,
    ).toBe(204);

    const depois = await abrir(ativa.publicToken);
    const itens = Object.fromEntries((depois.selection?.items ?? []).map((i) => [i.itemId, i]));
    expect(itens[a.itemId].response).toBe("tenho_interesse");
    expect(itens[b.itemId].response).toBe("sem_interesse");
    expect(itens[b.itemId].responseReason).toBe("preco");

    // Notificações: uma de gostou (sem duplicar), uma de descartou.
    expect(
      await prisma.notification.count({ where: { brokerId: ana.brokerId, type: "selecao_gostou" } }),
    ).toBe(1);
    expect(
      await prisma.notification.count({ where: { brokerId: ana.brokerId, type: "selecao_descartou" } }),
    ).toBe(1);

    // A lead avançou no funil automaticamente.
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe(
      "avaliando_imoveis",
    );

    // Desfazer o gostei: estado volta, timeline preserva tudo.
    expect((await responder(a.itemId, { response: "visualizado" })).statusCode).toBe(204);
    const final = await abrir(ativa.publicToken);
    expect(final.selection?.items.find((i) => i.itemId === a.itemId)?.response).toBe("visualizado");
    const timeline = await prisma.leadActivity.findMany({
      where: { leadId: lead.id, type: "selecao" },
    });
    expect(timeline.some((t) => t.description.startsWith("Gostou"))).toBe(true);
    expect(timeline.some((t) => t.description.startsWith("Resposta desfeita"))).toBe(true);
  });

  it("pedir visita e pedir informações: pendência única, notificação e funil", async () => {
    const { ana, lead, ativa } = await cenario("ana.pub4@teste.dev");
    const pagina = await abrir(ativa.publicToken);
    const item = pagina.selection?.items[0];

    const visitar = () =>
      app.inject({
        method: "POST",
        url: `/api/public/selecoes/${ativa.publicToken}/itens/${item?.itemId}/visita`,
      });
    expect((await visitar()).statusCode).toBe(204);
    expect((await visitar()).statusCode).toBe(204);

    expect(
      await prisma.notification.count({ where: { brokerId: ana.brokerId, type: "selecao_visita" } }),
    ).toBe(1);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe(
      "visita_solicitada",
    );

    const info = await app.inject({
      method: "POST",
      url: `/api/public/selecoes/${ativa.publicToken}/itens/${item?.itemId}/informacoes`,
      payload: { kind: "tenho_duvida", message: "Aceita pet?" },
    });
    expect(info.statusCode).toBe(204);
    const notifInfo = await prisma.notification.findFirst({
      where: { brokerId: ana.brokerId, type: "selecao_informacoes" },
    });
    expect(notifInfo?.body).toContain("Aceita pet?");
  });

  it("imóvel vendido durante a validade: card fica como indisponível e ação é bloqueada", async () => {
    const { ativa, im1 } = await cenario("ana.pub5@teste.dev");
    await prisma.property.update({ where: { id: im1.id }, data: { status: "vendido" } });

    const pagina = await abrir(ativa.publicToken);
    const doVendido = pagina.selection?.items.find((i) => i.title === "Apartamento Aurora");
    expect(doVendido?.unavailable).toBe(true);
    // O outro imóvel segue normal.
    expect(pagina.selection?.items.find((i) => i.title === "Casa Horizonte")?.unavailable).toBe(false);

    const acao = await app.inject({
      method: "POST",
      url: `/api/public/selecoes/${ativa.publicToken}/itens/${doVendido?.itemId}/resposta`,
      payload: { response: "tenho_interesse" },
    });
    expect(acao.statusCode).toBe(404);

    // Detalhe do vendido: indisponível; detalhe do outro: abre completo.
    const detVendido = await app.inject({
      method: "GET",
      url: `/api/public/selecoes/${ativa.publicToken}/itens/${doVendido?.itemId}`,
    });
    expect((detVendido.json() as PublicSelectionItemDetailResponse).available).toBe(false);

    const outro = pagina.selection?.items.find((i) => i.title === "Casa Horizonte");
    const detOutro = (
      await app.inject({
        method: "GET",
        url: `/api/public/selecoes/${ativa.publicToken}/itens/${outro?.itemId}`,
      })
    ).json() as PublicSelectionItemDetailResponse;
    expect(detOutro.available).toBe(true);
    expect(detOutro.item?.property.title).toBe("Casa Horizonte");
  });

  it("prévia autenticada mostra o rascunho como a lead verá; o público não", async () => {
    const ana = await registerBroker(app, "Ana", "ana.pub6@teste.dev");
    const lead = await prisma.lead.create({
      data: { brokerId: ana.brokerId, fullName: "Paulo Teste", whatsapp: "11944443333" },
    });
    const imovel = await prisma.property.create({
      data: {
        brokerId: ana.brokerId,
        title: "Loft Central",
        purpose: "venda",
        category: "residencial",
        type: "loft",
        origin: "captacao_propria",
        status: "disponivel",
        salePrice: 300_000,
      },
    });
    const rascunho = (
      await requestAs(app, ana, { method: "POST", url: "/api/selections", payload: { leadId: lead.id } })
    ).json() as SelectionView;
    await requestAs(app, ana, {
      method: "POST",
      url: `/api/selections/${rascunho.id}/items`,
      payload: { propertyId: imovel.id },
    });

    // Público: nada (e sem corretor, porque rascunho nunca circulou).
    const publico = await abrir(rascunho.publicToken);
    expect(publico.available).toBe(false);
    expect(publico.broker).toBeNull();

    // Prévia do dono: página completa.
    const previa = (
      await requestAs(app, ana, { method: "GET", url: `/api/selections/${rascunho.id}/preview` })
    ).json() as PublicSelectionPageResponse;
    expect(previa.available).toBe(true);
    expect(previa.selection?.leadFirstName).toBe("Paulo");
    expect(previa.selection?.items[0]?.title).toBe("Loft Central");

    // Prévia é do dono: outro corretor leva 404.
    const bruno = await registerBroker(app, "Bruno", "bruno.pub6@teste.dev");
    const alheia = await requestAs(app, bruno, {
      method: "GET",
      url: `/api/selections/${rascunho.id}/preview`,
    });
    expect(alheia.statusCode).toBe(404);
  });
});
