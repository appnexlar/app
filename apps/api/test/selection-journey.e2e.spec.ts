import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type {
  PublicSelectionPageResponse,
  PublicVisitSlotsResponse,
  SelectionCandidatesResult,
  SelectionSummary,
  SelectionView,
} from "@nexlar/shared";
import { createTestApp, registerBroker, requestAs, resetDatabase } from "./e2e-utils";
import { PrismaService } from "../src/prisma/prisma.service";
import { RateLimitStore } from "../src/common/rate-limit/rate-limit.store";

/**
 * O fluxo COMPLETO da épica, num teste só, do jeito que a spec desenha:
 *
 *   corretor abre a lead -> preferências -> pesquisa -> monta -> prazo ->
 *   ativa -> lead abre -> gosta/descarta -> agenda visita -> CRM atualizado
 *
 * Cada passo confere o efeito visível E o rastro (timeline, notificação,
 * evento de produto). Se este teste passa, a jornada existe de ponta a ponta.
 */
describe("Seleção personalizada: jornada integrada", () => {
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

  it("do cadastro da preferência até a visita agendada, com rastro completo", async () => {
    // -------------------------------------------------------------- corretor
    const ana = await registerBroker(app, "Ana", "ana.jornada@teste.dev");
    const lead = await prisma.lead.create({
      data: { brokerId: ana.brokerId, fullName: "Mariana Souza", whatsapp: "11922221111" },
    });

    // Preferências estruturadas.
    await requestAs(app, ana, {
      method: "PUT",
      url: `/api/leads/${lead.id}/preferences`,
      payload: { purpose: "venda", priceMax: 600_000, neighborhoods: ["Moema"], bedroomsMin: 2 },
    });

    // Carteira: um no perfil, um fora.
    const noPerfil = await prisma.property.create({
      data: {
        brokerId: ana.brokerId,
        title: "Apartamento Moema",
        purpose: "venda",
        category: "residencial",
        type: "apartamento",
        origin: "captacao_propria",
        status: "disponivel",
        neighborhood: "Moema",
        city: "São Paulo",
        salePrice: 550_000,
        details: { bedrooms: 2 },
      },
    });
    // Existe só para a pesquisa ter o que descartar: não bate com o perfil.
    await prisma.property.create({
      data: {
        brokerId: ana.brokerId,
        title: "Sala comercial Centro",
        purpose: "venda",
        category: "comercial",
        type: "sala",
        origin: "captacao_propria",
        status: "disponivel",
        city: "São Paulo",
        salePrice: 900_000,
      },
    });

    // Agenda de visitas aberta (daqui a 3 dias, 09:00-12:00).
    const deslocado = new Date(Date.now() + 3 * 86_400_000 - 3 * 3_600_000);
    const alvo = { date: deslocado.toISOString().slice(0, 10), weekday: deslocado.getUTCDay() };
    await requestAs(app, ana, {
      method: "PUT",
      url: "/api/agenda/visit-availability",
      payload: {
        windows: [{ weekday: alvo.weekday, start: "09:00", end: "12:00" }],
        slotDurationMin: 60,
        minNoticeHours: 0,
        maxAdvanceDays: 14,
      },
    });

    // Cria a seleção e pesquisa: a compatibilidade ordena o certo primeiro.
    const selecao = (
      await requestAs(app, ana, { method: "POST", url: "/api/selections", payload: { leadId: lead.id } })
    ).json() as SelectionView;
    const candidatos = (
      await requestAs(app, ana, { method: "GET", url: `/api/selections/${selecao.id}/candidates` })
    ).json() as SelectionCandidatesResult;
    expect(candidatos.items[0].propertyId).toBe(noPerfil.id);
    expect(candidatos.items[0].compatibility).toBe("alta");

    // Monta: os dois entram, o do perfil vira destaque com observação.
    for (const c of candidatos.items) {
      await requestAs(app, ana, {
        method: "POST",
        url: `/api/selections/${selecao.id}/items`,
        payload: { propertyId: c.propertyId, origin: c.compatibility === "alta" ? "preferencia" : "manual" },
      });
    }
    const montada = (
      await requestAs(app, ana, { method: "GET", url: `/api/selections/${selecao.id}` })
    ).json() as SelectionView;
    const itemBom = montada.items.find((i) => i.propertyId === noPerfil.id);
    await requestAs(app, ana, {
      method: "PATCH",
      url: `/api/selections/${selecao.id}/items/${itemBom?.id}`,
      payload: { highlight: true, brokerNote: "Tem os 2 quartos que você pediu" },
    });

    // Mensagem + prazo + ativação.
    await requestAs(app, ana, {
      method: "PATCH",
      url: `/api/selections/${selecao.id}`,
      payload: { message: "Separei pensando em você!", expiresInDays: 15 },
    });
    const ativada = await requestAs(app, ana, {
      method: "POST",
      url: `/api/selections/${selecao.id}/activate`,
    });
    expect(ativada.statusCode).toBe(200);
    const token = (ativada.json() as SelectionView).publicToken;

    // ------------------------------------------------------------------ lead
    // Abre o link: cabeçalho pessoal, destaque primeiro, corretor assinando.
    const pagina = (
      await app.inject({ method: "GET", url: `/api/public/selecoes/${token}` })
    ).json() as PublicSelectionPageResponse;
    expect(pagina.selection?.leadFirstName).toBe("Mariana");
    expect(pagina.selection?.message).toBe("Separei pensando em você!");
    const [destaque, comum] = pagina.selection?.items ?? [];
    expect(destaque.highlight).toBe(true);
    expect(destaque.brokerNote).toContain("2 quartos");

    // Gosta do destaque, descarta o outro com motivo.
    await app.inject({
      method: "POST",
      url: `/api/public/selecoes/${token}/itens/${destaque.itemId}/resposta`,
      payload: { response: "tenho_interesse" },
    });
    await app.inject({
      method: "POST",
      url: `/api/public/selecoes/${token}/itens/${comum.itemId}/resposta`,
      payload: { response: "sem_interesse", reason: "localizacao" },
    });

    // Agenda a visita num slot real.
    const slots = (
      await app.inject({
        method: "GET",
        url: `/api/public/selecoes/${token}/itens/${destaque.itemId}/slots`,
      })
    ).json() as PublicVisitSlotsResponse;
    const dia = slots.days.find((d) => d.date === alvo.date);
    expect(dia?.slots).toContain("10:00");
    const agendada = await app.inject({
      method: "POST",
      url: `/api/public/selecoes/${token}/itens/${destaque.itemId}/agendar`,
      payload: { date: alvo.date, time: "10:00" },
    });
    expect(agendada.statusCode).toBe(201);

    // ------------------------------------------------------------------- CRM
    // Funil andou até visita agendada, sem intervenção manual.
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("visita_agendada");

    // Visita + evento de agenda de pé.
    const visita = await prisma.visit.findFirstOrThrow({ where: { leadId: lead.id, status: "agendada" } });
    expect(await prisma.agendaEvent.count({ where: { visitId: visita.id, status: "confirmada" } })).toBe(1);

    // Notificações do sino, na ordem da história.
    const tipos = (
      await prisma.notification.findMany({ where: { brokerId: ana.brokerId }, orderBy: { createdAt: "asc" } })
    ).map((n) => n.type);
    expect(tipos).toEqual(
      expect.arrayContaining(["selecao_aberta", "selecao_gostou", "selecao_descartou", "selecao_visita_agendada"]),
    );

    // Histórico na ficha: contadores fiéis.
    const resumo = (
      await requestAs(app, ana, { method: "GET", url: `/api/leads/${lead.id}/selections` })
    ).json() as SelectionSummary[];
    expect(resumo[0]).toMatchObject({ itemCount: 2, likedCount: 0, dismissedCount: 1, visitRequestedCount: 1 });
    // (o destaque saiu de "gostou" para "quer visitar": o contador acompanha)

    // Eventos de produto da jornada, deduplicados e sem dado pessoal.
    const eventos = await prisma.productEvent.findMany({ where: { brokerId: ana.brokerId } });
    const tiposDeEvento = eventos.map((e) => e.type);
    for (const esperado of [
      "SELECTION_CREATED",
      "SELECTION_ACTIVATED",
      "SELECTION_SENT",
      "SELECTION_OPENED",
      "SELECTION_PROPERTY_LIKED",
      "SELECTION_PROPERTY_DISMISSED",
      "SELECTION_VISIT_SCHEDULED",
      "CALENDAR_CONFIGURED",
      "FIRST_VISIT_SCHEDULED",
      "FIRST_INTEREST_RECEIVED",
    ]) {
      expect(tiposDeEvento).toContain(esperado);
    }
    expect(JSON.stringify(eventos)).not.toContain("Mariana");

    // Timeline conta a história completa.
    const timeline = await prisma.leadActivity.findMany({
      where: { leadId: lead.id },
      orderBy: { createdAt: "asc" },
    });
    const descricoes = timeline.map((t) => t.description).join(" | ");
    expect(descricoes).toContain("Preferências de busca atualizadas");
    expect(descricoes).toContain("ativada");
    expect(descricoes).toContain("Gostou do imóvel");
    expect(descricoes).toContain("Não combina");
    expect(descricoes).toContain("Visita agendada pela lead");
  });
});
