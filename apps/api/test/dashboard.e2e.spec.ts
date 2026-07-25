import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { DashboardSummary } from "@nexlar/shared";
import { createTestApp, registerBroker, requestAs, resetDatabase, type TestBroker } from "./e2e-utils";
import { PrismaService } from "../src/prisma/prisma.service";
import { RateLimitStore } from "../src/common/rate-limit/rate-limit.store";

/**
 * e2e do Dashboard. O resumo era um mock no front; agora sai do banco, então
 * o que estes testes protegem é justamente o que um mock nunca quebra: número
 * que conta o movimento do corretor errado, e conta que divide por zero.
 */
describe("Dashboard: resumo real do corretor", () => {
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

  async function resumo(broker: TestBroker): Promise<DashboardSummary> {
    const res = await requestAs(app, broker, { method: "GET", url: "/api/dashboard" });
    expect(res.statusCode).toBe(200);
    return res.json() as DashboardSummary;
  }

  const criarLead = (broker: TestBroker, dados: Record<string, unknown> = {}) =>
    prisma.lead.create({
      data: {
        brokerId: broker.brokerId,
        fullName: "Cliente",
        whatsapp: `1199999${Math.floor(Math.random() * 10_000)}`,
        ...dados,
      },
    });

  it("corretor novo recebe tudo zerado, sem divisão por zero nas taxas", async () => {
    const ana = await registerBroker(app, "Ana", "ana.dash@teste.dev");
    const s = await resumo(ana);

    expect(s.today.dueToday).toEqual([]);
    expect(s.today.overdue).toEqual([]);
    expect(s.alerts.newLeadsAwaitingContact).toBe(0);
    expect(s.metrics.leadsThisMonth).toBe(0);

    // Sem lead nenhuma, a taxa não pode virar NaN nem Infinity.
    expect(s.conversions.leadToVisit).toBe(0);
    expect(s.conversions.visitToNegotiation).toBe(0);
    expect(s.conversions.avgDaysToClose).toBeNull();

    // O gráfico vem com os seis meses mesmo vazio, senão o eixo some.
    expect(s.metrics.leadsByMonth).toHaveLength(6);
    expect(s.metrics.activeByStage.map((e) => e.group)).toEqual([
      "novos",
      "atendimento",
      "imoveis_enviados",
      "visitas",
    ]);
  });

  it("conta leads, etapas do funil e tarefas do dia a partir do banco", async () => {
    const ana = await registerBroker(app, "Ana", "ana.dash2@teste.dev");

    await criarLead(ana, { fullName: "Nova", status: "novo" });
    await criarLead(ana, { fullName: "Em atendimento", status: "em_atendimento" });
    await criarLead(ana, { fullName: "Enviados", status: "imoveis_enviados" });
    const perdida = await criarLead(ana, { fullName: "Perdida", status: "perdida" });

    const hoje = new Date();
    hoje.setHours(10, 0, 0, 0);
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);

    await prisma.agendaEvent.create({
      data: {
        brokerId: ana.brokerId,
        type: "tarefa",
        status: "pendente",
        title: "Ligar hoje",
        startAt: hoje,
      },
    });
    await prisma.agendaEvent.create({
      data: {
        brokerId: ana.brokerId,
        type: "tarefa",
        status: "pendente",
        title: "Esqueci ontem",
        startAt: ontem,
      },
    });

    const s = await resumo(ana);

    expect(s.metrics.leadsThisMonth).toBe(4);
    expect(s.alerts.newLeadsAwaitingContact).toBe(1);

    // Encerradas ficam fora do funil vivo: 3 ativas, não 4.
    const porGrupo = Object.fromEntries(s.metrics.activeByStage.map((e) => [e.group, e.count]));
    expect(porGrupo.novos).toBe(1);
    expect(porGrupo.atendimento).toBe(1);
    expect(porGrupo.imoveis_enviados).toBe(1);
    expect(await prisma.lead.count({ where: { id: perdida.id } })).toBe(1);

    expect(s.today.dueToday.map((t) => t.title)).toEqual(["Ligar hoje"]);
    expect(s.today.overdue.map((t) => t.title)).toEqual(["Esqueci ontem"]);

    // O último mês do gráfico é o corrente e traz as 4 leads.
    expect(s.metrics.leadsByMonth.at(-1)?.leads).toBe(4);
  });

  it("isolamento: o resumo de um corretor não enxerga o movimento do outro", async () => {
    const ana = await registerBroker(app, "Ana", "ana.dash3@teste.dev");
    const bruno = await registerBroker(app, "Bruno", "bruno.dash3@teste.dev");

    for (let i = 0; i < 3; i++) await criarLead(bruno, { fullName: `Do Bruno ${i}` });
    await prisma.agendaEvent.create({
      data: {
        brokerId: bruno.brokerId,
        type: "tarefa",
        status: "pendente",
        title: "Tarefa do Bruno",
        startAt: new Date(),
      },
    });

    const daAna = await resumo(ana);
    expect(daAna.metrics.leadsThisMonth).toBe(0);
    expect(daAna.today.dueToday).toEqual([]);
    expect(JSON.stringify(daAna)).not.toContain("Bruno");

    expect((await resumo(bruno)).metrics.leadsThisMonth).toBe(3);
  });

  it("exige login", async () => {
    const res = await app.inject({ method: "GET", url: "/api/dashboard" });
    expect(res.statusCode).toBe(401);
  });
});
