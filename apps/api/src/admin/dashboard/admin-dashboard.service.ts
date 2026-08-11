import { Injectable } from "@nestjs/common";
import type {
  AdminAlert,
  AdminDashboardPeriod,
  AdminDashboardQuery,
  AdminDashboardSummary,
} from "@nexlar/shared";
import { DIAS_PARA_VERIFICACAO_PARADA } from "@nexlar/shared";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthenticatedAdmin } from "../rbac/current-admin.decorator";

/**
 * Agregados do Dashboard administrativo (docs/10, Fase 2).
 *
 * Duas regras mandam neste arquivo:
 *
 * 1. Só sai número da plataforma e dado de conta de corretor. Nenhuma consulta
 *    aqui pode selecionar nome, telefone ou documento de lead ou cliente: o
 *    Admin cuida de contas, não de carteiras (finalidade, LGPD).
 * 2. Bloco sem permissão não é calculado. Não basta o front esconder; se o
 *    perfil não alcança contas, a consulta nem vai ao banco.
 */

/** Quantas contas recém-cadastradas o painel mostra. */
const RECENTES = 5;

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(
    actor: AuthenticatedAdmin,
    query: AdminDashboardQuery,
  ): Promise<AdminDashboardSummary> {
    const janela = janelaDoPeriodo(query.periodo, new Date());

    // Perfil sem alcance sobre contas (financeiro, hoje) recebe o esqueleto
    // vazio: a tela explica, e nenhum agregado sai do banco.
    if (!actor.permissions.includes("admin.users.view")) {
      return {
        periodo: query.periodo,
        contas: null,
        movimento: null,
        uso: null,
        alertas: [],
        recentes: [],
      };
    }

    const limiteVerificacao = new Date(
      janela.fim.getTime() - DIAS_PARA_VERIFICACAO_PARADA * 86_400_000,
    );

    // Consultas curtas e independentes, todas de uma vez: somadas custam
    // menos que uma agregação única, e o painel abre em uma ida ao banco.
    const [
      total,
      ativas,
      pendentesVerificacao,
      suspensas,
      bloqueadas,
      desativadas,
      novasContas,
      novasContasAnterior,
      contasAtivas,
      contasAtivasAnterior,
      confirmaramEmail,
      leads,
      clientes,
      imoveis,
      selecoes,
      visitas,
      verificacaoParada,
      recentes,
    ] = await Promise.all([
      this.prisma.broker.count(),
      this.prisma.broker.count({ where: { status: "ativo" } }),
      this.prisma.broker.count({ where: { status: "ativo", emailVerifiedAt: null } }),
      this.prisma.broker.count({ where: { status: "suspenso" } }),
      this.prisma.broker.count({ where: { status: "bloqueado" } }),
      this.prisma.broker.count({ where: { status: "desativado" } }),
      this.prisma.broker.count({ where: { createdAt: janela.atual } }),
      this.prisma.broker.count({ where: { createdAt: janela.anterior } }),
      this.prisma.broker.count({ where: { lastLoginAt: janela.atual } }),
      this.prisma.broker.count({ where: { lastLoginAt: janela.anterior } }),
      this.prisma.broker.count({
        where: { createdAt: janela.atual, emailVerifiedAt: { not: null } },
      }),
      this.prisma.lead.count({ where: { createdAt: janela.atual } }),
      this.prisma.conversion.count({ where: { createdAt: janela.atual } }),
      this.prisma.property.count({ where: { createdAt: janela.atual } }),
      this.prisma.propertySelection.count({ where: { createdAt: janela.atual } }),
      this.prisma.visit.count({ where: { createdAt: janela.atual } }),
      this.prisma.broker.count({
        where: {
          status: "ativo",
          emailVerifiedAt: null,
          createdAt: { lt: limiteVerificacao },
        },
      }),
      this.prisma.broker.findMany({
        orderBy: { createdAt: "desc" },
        take: RECENTES,
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          agencyName: true,
          status: true,
          emailVerifiedAt: true,
          createdAt: true,
          lastLoginAt: true,
        },
      }),
    ]);

    // Alerta com contagem zero não entra na lista: a tela mostra o que pede
    // ação, e uma fila vazia não pede nada.
    const alertas: AdminAlert[] = [
      { kind: "contas_suspensas" as const, count: suspensas },
      { kind: "verificacao_parada" as const, count: verificacaoParada },
    ].filter((a) => a.count > 0);

    return {
      periodo: query.periodo,
      contas: { total, ativas, pendentesVerificacao, suspensas, bloqueadas, desativadas },
      movimento: {
        novasContas,
        novasContasAnterior,
        contasAtivas,
        contasAtivasAnterior,
        confirmaramEmail,
      },
      uso: { leads, clientes, imoveis, selecoes, visitas },
      alertas,
      recentes: recentes.map((b) => ({
        id: b.id,
        fullName: b.fullName,
        email: b.email,
        phone: b.phone,
        agencyName: b.agencyName,
        status: b.status,
        emailVerified: b.emailVerifiedAt !== null,
        createdAt: b.createdAt.toISOString(),
        lastLoginAt: b.lastLoginAt?.toISOString() ?? null,
      })),
    };
  }
}

/**
 * A janela do período e a janela anterior de MESMA duração, prontas para
 * entrar num filtro do Prisma.
 *
 * O período anterior é a duração imediatamente antes do início, nunca o "dia
 * anterior inteiro": comparar um dia em curso com um dia completo faria toda
 * manhã parecer uma queda.
 */
function janelaDoPeriodo(periodo: AdminDashboardPeriod, agora: Date) {
  const fim = agora;
  const inicio =
    periodo === "hoje"
      ? new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
      : new Date(agora.getTime() - diasDoPeriodo(periodo) * 86_400_000);

  const duracao = fim.getTime() - inicio.getTime();
  const inicioAnterior = new Date(inicio.getTime() - duracao);

  return {
    inicio,
    fim,
    atual: { gte: inicio, lte: fim },
    anterior: { gte: inicioAnterior, lt: inicio },
  };
}

function diasDoPeriodo(periodo: AdminDashboardPeriod): number {
  if (periodo === "7d") return 7;
  if (periodo === "30d") return 30;
  return 90;
}
