import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type {
  PublicSelectionPageResponse,
  PublicVisitSlotsResponse,
  SelectionView,
  VisitAvailabilityView,
} from "@nexlar/shared";
import { createTestApp, registerBroker, requestAs, resetDatabase, type TestBroker } from "./e2e-utils";
import { PrismaService } from "../src/prisma/prisma.service";
import { RateLimitStore } from "../src/common/rate-limit/rate-limit.store";

/**
 * Fatia 4: agendamento de visita com horários reais. O que se protege:
 * slot só existe dentro de janela configurada, conflito de agenda derruba o
 * horário, dois agendamentos no mesmo slot não coexistem, e cancelar
 * preserva o interesse e avisa o corretor.
 */
describe("Seleção personalizada: agendamento de visitas", () => {
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

  /** Data (YYYY-MM-DD) e dia da semana daqui a N dias, vistos de São Paulo. */
  function diaSp(diasAFrente: number): { date: string; weekday: number } {
    const deslocado = new Date(Date.now() + diasAFrente * 86_400_000 - 3 * 3_600_000);
    return { date: deslocado.toISOString().slice(0, 10), weekday: deslocado.getUTCDay() };
  }

  async function cenario(email: string) {
    const ana = await registerBroker(app, "Ana", email);
    const lead = await prisma.lead.create({
      data: { brokerId: ana.brokerId, fullName: "Mariana Souza", whatsapp: "11933332222" },
    });
    const imovel = await prisma.property.create({
      data: {
        brokerId: ana.brokerId,
        title: "Apartamento Jardim",
        purpose: "venda",
        category: "residencial",
        type: "apartamento",
        origin: "captacao_propria",
        status: "disponivel",
        salePrice: 500_000,
      },
    });
    const criada = (
      await requestAs(app, ana, { method: "POST", url: "/api/selections", payload: { leadId: lead.id } })
    ).json() as SelectionView;
    await requestAs(app, ana, {
      method: "POST",
      url: `/api/selections/${criada.id}/items`,
      payload: { propertyId: imovel.id },
    });
    await requestAs(app, ana, {
      method: "PATCH",
      url: `/api/selections/${criada.id}`,
      payload: { expiresInDays: 30 },
    });
    await requestAs(app, ana, { method: "POST", url: `/api/selections/${criada.id}/activate` });
    const ativa = (
      await requestAs(app, ana, { method: "GET", url: `/api/selections/${criada.id}` })
    ).json() as SelectionView;
    return { ana, lead, imovel, ativa, itemId: ativa.items[0].id };
  }

  /** Abre janela 09:00-12:00 daqui a 3 dias, slots de 60min, sem antecedência. */
  async function configurarAgenda(ana: TestBroker) {
    const alvo = diaSp(3);
    const res = await requestAs(app, ana, {
      method: "PUT",
      url: "/api/agenda/visit-availability",
      payload: {
        windows: [{ weekday: alvo.weekday, start: "09:00", end: "12:00" }],
        slotDurationMin: 60,
        minNoticeHours: 0,
        maxAdvanceDays: 14,
      },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as VisitAvailabilityView).configured).toBe(true);
    return alvo;
  }

  it("configuração salva e slots respeitam janela, duração e conflitos", async () => {
    const { ana, ativa, itemId } = await cenario("ana.vis1@teste.dev");
    const alvo = await configurarAgenda(ana);

    const slots = (
      await app.inject({
        method: "GET",
        url: `/api/public/selecoes/${ativa.publicToken}/itens/${itemId}/slots`,
      })
    ).json() as PublicVisitSlotsResponse;

    expect(slots.configured).toBe(true);
    const dia = slots.days.find((d) => d.date === alvo.date);
    expect(dia?.slots).toEqual(["09:00", "10:00", "11:00"]);

    // Compromisso das 10h derruba só o slot das 10h.
    await prisma.agendaEvent.create({
      data: {
        brokerId: ana.brokerId,
        type: "compromisso",
        status: "agendado",
        title: "Reunião",
        startAt: new Date(`${alvo.date}T10:00:00-03:00`),
        endAt: new Date(`${alvo.date}T11:00:00-03:00`),
      },
    });
    const depois = (
      await app.inject({
        method: "GET",
        url: `/api/public/selecoes/${ativa.publicToken}/itens/${itemId}/slots`,
      })
    ).json() as PublicVisitSlotsResponse;
    expect(depois.days.find((d) => d.date === alvo.date)?.slots).toEqual(["09:00", "11:00"]);
  });

  it("agendar cria visita + evento + notificação e move o funil; slot ocupado dá 409", async () => {
    const { ana, lead, ativa, itemId } = await cenario("ana.vis2@teste.dev");
    const alvo = await configurarAgenda(ana);

    const agendar = (payload: Record<string, unknown>) =>
      app.inject({
        method: "POST",
        url: `/api/public/selecoes/${ativa.publicToken}/itens/${itemId}/agendar`,
        payload,
      });

    // Horário fora dos slots (03:00): recusado mesmo estando "livre".
    expect((await agendar({ date: alvo.date, time: "03:00" })).statusCode).toBe(409);

    const ok = await agendar({ date: alvo.date, time: "10:00" });
    expect(ok.statusCode).toBe(201);

    // Visita + evento de agenda vinculado.
    const visita = await prisma.visit.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(visita.status).toBe("agendada");
    const evento = await prisma.agendaEvent.findFirstOrThrow({ where: { visitId: visita.id } });
    expect(evento.type).toBe("visita");
    expect(evento.status).toBe("confirmada");

    // Funil e notificação.
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("visita_agendada");
    expect(
      await prisma.notification.count({ where: { brokerId: ana.brokerId, type: "selecao_visita_agendada" } }),
    ).toBe(1);

    // A página da lead mostra a visita marcada.
    const pagina = (
      await app.inject({ method: "GET", url: `/api/public/selecoes/${ativa.publicToken}` })
    ).json() as PublicSelectionPageResponse;
    expect(pagina.selection?.items[0].visit?.scheduledAtLabel).toContain("10:00");

    // Mesmo slot de novo: 409 (o horário sumiu para todo mundo).
    expect((await agendar({ date: alvo.date, time: "10:00" })).statusCode).toBe(409);
    // Slot vizinho continua livre.
    expect((await agendar({ date: alvo.date, time: "11:00" })).statusCode).toBe(201);
  });

  it("cancelar mantém o interesse, cancela o evento e avisa o corretor", async () => {
    const { ana, lead, ativa, itemId } = await cenario("ana.vis3@teste.dev");
    const alvo = await configurarAgenda(ana);
    await app.inject({
      method: "POST",
      url: `/api/public/selecoes/${ativa.publicToken}/itens/${itemId}/agendar`,
      payload: { date: alvo.date, time: "09:00" },
    });

    const cancelar = await app.inject({
      method: "POST",
      url: `/api/public/selecoes/${ativa.publicToken}/itens/${itemId}/visita/cancelar`,
    });
    expect(cancelar.statusCode).toBe(204);

    const visita = await prisma.visit.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(visita.status).toBe("cancelada");
    expect(
      (await prisma.agendaEvent.findFirstOrThrow({ where: { visitId: visita.id } })).status,
    ).toBe("cancelada");
    expect(
      await prisma.notification.count({ where: { brokerId: ana.brokerId, type: "selecao_visita_cancelada" } }),
    ).toBe(1);

    // O interesse continua e o slot voltou a ficar livre.
    const pagina = (
      await app.inject({ method: "GET", url: `/api/public/selecoes/${ativa.publicToken}` })
    ).json() as PublicSelectionPageResponse;
    expect(pagina.selection?.items[0].response).toBe("tenho_interesse");
    expect(pagina.selection?.items[0].visit).toBeNull();

    const slots = (
      await app.inject({
        method: "GET",
        url: `/api/public/selecoes/${ativa.publicToken}/itens/${itemId}/slots`,
      })
    ).json() as PublicVisitSlotsResponse;
    expect(slots.days.find((d) => d.date === alvo.date)?.slots).toContain("09:00");
  });

  it("sem agenda configurada: slots avisam e agendar direto é recusado", async () => {
    const { ativa, itemId } = await cenario("ana.vis4@teste.dev");

    const slots = (
      await app.inject({
        method: "GET",
        url: `/api/public/selecoes/${ativa.publicToken}/itens/${itemId}/slots`,
      })
    ).json() as PublicVisitSlotsResponse;
    expect(slots.configured).toBe(false);
    expect(slots.days).toEqual([]);

    const alvo = diaSp(3);
    const agendar = await app.inject({
      method: "POST",
      url: `/api/public/selecoes/${ativa.publicToken}/itens/${itemId}/agendar`,
      payload: { date: alvo.date, time: "10:00" },
    });
    expect(agendar.statusCode).toBe(409);
  });

  it("isolamento: a disponibilidade de um corretor não vaza para o outro", async () => {
    const { ana } = await cenario("ana.vis5@teste.dev");
    await configurarAgenda(ana);

    const bruno = await registerBroker(app, "Bruno", "bruno.vis5@teste.dev");
    const doBruno = (
      await requestAs(app, bruno, { method: "GET", url: "/api/agenda/visit-availability" })
    ).json() as VisitAvailabilityView;
    expect(doBruno.configured).toBe(false);
    expect(doBruno.windows).toEqual([]);
  });
});
