import { Injectable } from "@nestjs/common";
import type {
  DashboardSummary,
  DashboardTask,
  FunnelGroup,
  MonthCount,
} from "@nexlar/shared";
import { FUNNEL_GROUP_BY_STATUS } from "@nexlar/shared";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Agregação do Dashboard (J10). Tudo é calculado aqui, no servidor, a partir
 * dos dados do próprio corretor: o front só apresenta o número que recebe.
 *
 * O broker vem sempre do token. Nenhuma consulta deste arquivo pode existir
 * sem `brokerId` no filtro, ou o corretor passa a ver o movimento alheio.
 */

/** Lead parada há mais de uma semana já merece um empurrão. */
const DIAS_PARA_ESTAGNAR = 7;
/** Quantos meses o gráfico de evolução mostra, incluindo o corrente. */
const MESES_NO_GRAFICO = 6;

/** Etapas que não contam como atendimento vivo. */
const ENCERRADAS = ["convertida_em_cliente", "perdida", "reativar_futuro"] as const;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(brokerId: string): Promise<DashboardSummary> {
    const agora = new Date();
    const p = periodos(agora);

    // Uma ida ao banco por pergunta, todas em paralelo: são consultas curtas e
    // independentes, e somadas custam menos que uma agregação gigante.
    const [
      tarefasDoDia,
      atrasadas,
      leadsNovas,
      leadsAtivas,
      leadsComTarefaAberta,
      leadsRecentementeAtivas,
      documentosPendentes,
      simulacoesPendentes,
      leadsMesAtual,
      leadsMesPassado,
      visitasSemana,
      visitasSemanaPassada,
      visitasMes,
      visitasMesPassado,
      negociacoesAbertas,
      negociacoesMesPassado,
      leadsDoGrafico,
      totalLeads,
      leadsQueVisitaram,
      leadsQueNegociaram,
      convertidas,
    ] = await Promise.all([
      this.tarefas(brokerId, p.inicioDoDia, p.fimDoDia),
      this.tarefas(brokerId, null, p.inicioDoDia),
      this.prisma.lead.count({ where: { brokerId, status: "novo" } }),
      this.prisma.lead.findMany({
        where: { brokerId, status: { notIn: [...ENCERRADAS] } },
        select: { id: true, status: true, updatedAt: true },
      }),
      this.prisma.agendaEvent.findMany({
        where: { brokerId, type: "tarefa", status: "pendente", leadId: { not: null } },
        select: { leadId: true },
        distinct: ["leadId"],
      }),
      this.prisma.leadActivity.findMany({
        where: { brokerId, createdAt: { gte: p.limiteEstagnacao } },
        select: { leadId: true },
        distinct: ["leadId"],
      }),
      this.prisma.document.count({ where: { brokerId, status: "pendente" } }),
      this.prisma.simulation.count({ where: { brokerId, status: "pendente" } }),
      this.prisma.lead.count({ where: { brokerId, createdAt: { gte: p.inicioDoMes } } }),
      this.prisma.lead.count({
        where: { brokerId, createdAt: { gte: p.inicioMesPassado, lt: p.inicioDoMes } },
      }),
      this.prisma.visit.count({ where: { brokerId, scheduledAt: { gte: p.inicioDaSemana } } }),
      this.prisma.visit.count({
        where: { brokerId, scheduledAt: { gte: p.inicioSemanaPassada, lt: p.inicioDaSemana } },
      }),
      this.prisma.visit.count({ where: { brokerId, scheduledAt: { gte: p.inicioDoMes } } }),
      this.prisma.visit.count({
        where: { brokerId, scheduledAt: { gte: p.inicioMesPassado, lt: p.inicioDoMes } },
      }),
      this.prisma.lead.count({
        where: { brokerId, status: { in: ["imovel_prioritario", "aguardando_decisao"] } },
      }),
      this.prisma.lead.count({
        where: {
          brokerId,
          status: { in: ["imovel_prioritario", "aguardando_decisao"] },
          updatedAt: { gte: p.inicioMesPassado, lt: p.inicioDoMes },
        },
      }),
      this.prisma.lead.findMany({
        where: { brokerId, createdAt: { gte: p.inicioDoGrafico } },
        select: { createdAt: true },
      }),
      this.prisma.lead.count({ where: { brokerId } }),
      this.prisma.visit.findMany({ where: { brokerId }, select: { leadId: true }, distinct: ["leadId"] }),
      this.prisma.lead.count({
        where: {
          brokerId,
          status: { in: ["imovel_prioritario", "aguardando_decisao", "convertida_em_cliente"] },
        },
      }),
      this.prisma.conversion.findMany({
        where: { brokerId },
        select: { convertedAt: true, lead: { select: { createdAt: true } } },
      }),
    ]);

    // Sem próxima ação: lead viva que não tem nenhuma tarefa pendente.
    const comTarefa = new Set(leadsComTarefaAberta.map((t) => t.leadId));
    const semProximaAcao = leadsAtivas.filter((l) => !comTarefa.has(l.id)).length;

    // Parada: nenhuma atividade registrada na última semana. O updatedAt não
    // serve sozinho, porque mudanças de sistema também o tocam.
    const ativasRecentes = new Set(leadsRecentementeAtivas.map((a) => a.leadId));
    const paradas = leadsAtivas.filter(
      (l) => !ativasRecentes.has(l.id) && l.updatedAt < p.limiteEstagnacao,
    ).length;

    return {
      today: { dueToday: tarefasDoDia, overdue: atrasadas },
      alerts: {
        newLeadsAwaitingContact: leadsNovas,
        leadsWithoutFollowUp: semProximaAcao,
        stalledLeads: paradas,
        pendingDocuments: documentosPendentes,
        pendingSimulations: simulacoesPendentes,
      },
      metrics: {
        leadsThisMonth: leadsMesAtual,
        leadsLastMonth: leadsMesPassado,
        visitsThisWeek: visitasSemana,
        visitsLastWeek: visitasSemanaPassada,
        visitsThisMonth: visitasMes,
        visitsLastMonth: visitasMesPassado,
        openNegotiations: negociacoesAbertas,
        negotiationsLastMonth: negociacoesMesPassado,
        leadsByMonth: porMes(leadsDoGrafico.map((l) => l.createdAt), agora),
        activeByStage: porEtapa(leadsAtivas),
      },
      conversions: {
        leadToVisit: fracao(leadsQueVisitaram.length, totalLeads),
        visitToNegotiation: fracao(leadsQueNegociaram, leadsQueVisitaram.length),
        avgDaysToClose: mediaDeDias(convertidas),
      },
    };
  }

  /**
   * Tarefas da agenda com lead vinculada, na janela pedida. `de` nulo significa
   * "tudo que venceu antes", que é o caso das atrasadas.
   */
  private async tarefas(
    brokerId: string,
    de: Date | null,
    ate: Date,
  ): Promise<DashboardTask[]> {
    const eventos = await this.prisma.agendaEvent.findMany({
      where: {
        brokerId,
        type: "tarefa",
        status: "pendente",
        startAt: de ? { gte: de, lt: ate } : { lt: ate },
      },
      select: { id: true, title: true, startAt: true, lead: { select: { fullName: true } } },
      orderBy: { startAt: "asc" },
      take: 20,
    });

    return eventos.map((e) => ({
      id: e.id,
      title: e.title,
      // Tarefa solta (sem lead) ainda é trabalho do dia: entra sem dono.
      leadName: e.lead?.fullName ?? "Sem lead vinculada",
      dueAt: e.startAt.toISOString(),
    }));
  }
}

// ---------------------------------------------------------------------------
// Cálculo puro
// ---------------------------------------------------------------------------

/** Todos os recortes de tempo que o resumo usa, calculados uma vez só. */
function periodos(agora: Date) {
  const inicioDoDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const fimDoDia = new Date(inicioDoDia);
  fimDoDia.setDate(fimDoDia.getDate() + 1);

  // Semana começando no domingo, como o calendário brasileiro.
  const inicioDaSemana = new Date(inicioDoDia);
  inicioDaSemana.setDate(inicioDaSemana.getDate() - inicioDaSemana.getDay());
  const inicioSemanaPassada = new Date(inicioDaSemana);
  inicioSemanaPassada.setDate(inicioSemanaPassada.getDate() - 7);

  const inicioDoMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const inicioMesPassado = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
  const inicioDoGrafico = new Date(agora.getFullYear(), agora.getMonth() - (MESES_NO_GRAFICO - 1), 1);

  const limiteEstagnacao = new Date(agora);
  limiteEstagnacao.setDate(limiteEstagnacao.getDate() - DIAS_PARA_ESTAGNAR);

  return {
    inicioDoDia,
    fimDoDia,
    inicioDaSemana,
    inicioSemanaPassada,
    inicioDoMes,
    inicioMesPassado,
    inicioDoGrafico,
    limiteEstagnacao,
  };
}

/** Série do gráfico: sempre com todos os meses, mesmo os de valor zero. */
function porMes(datas: Date[], agora: Date): MonthCount[] {
  const contagem = new Map<string, number>();
  for (let i = MESES_NO_GRAFICO - 1; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    contagem.set(chaveDoMes(d), 0);
  }
  for (const data of datas) {
    const chave = chaveDoMes(data);
    if (contagem.has(chave)) contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  }
  return [...contagem.entries()].map(([month, leads]) => ({ month, leads }));
}

function chaveDoMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Leads vivas por coluna do funil, sempre com as quatro colunas do quadro. */
function porEtapa(leads: { status: string }[]): { group: FunnelGroup; count: number }[] {
  const colunas: FunnelGroup[] = ["novos", "atendimento", "imoveis_enviados", "visitas"];
  const contagem = new Map<FunnelGroup, number>(colunas.map((c) => [c, 0]));
  for (const lead of leads) {
    const grupo = FUNNEL_GROUP_BY_STATUS[lead.status as keyof typeof FUNNEL_GROUP_BY_STATUS];
    if (grupo && contagem.has(grupo)) contagem.set(grupo, (contagem.get(grupo) ?? 0) + 1);
  }
  return colunas.map((group) => ({ group, count: contagem.get(group) ?? 0 }));
}

/** Fração de 0 a 1. Sem base não existe taxa: devolve 0, nunca divide por zero. */
function fracao(parte: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((parte / total) * 100) / 100;
}

/** Média de dias entre o cadastro da lead e a conversão. */
function mediaDeDias(conversoes: { convertedAt: Date; lead: { createdAt: Date } | null }[]): number | null {
  const dias = conversoes
    .filter((c) => c.lead)
    .map((c) => (c.convertedAt.getTime() - (c.lead as { createdAt: Date }).createdAt.getTime()) / 86_400_000)
    .filter((d) => Number.isFinite(d) && d >= 0);
  if (dias.length === 0) return null;
  return Math.round(dias.reduce((a, b) => a + b, 0) / dias.length);
}
