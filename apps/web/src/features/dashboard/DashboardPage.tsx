import { useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type {
  DashboardAlerts,
  DashboardSummary,
  DashboardTask,
  FunnelStageCount,
  MonthCount,
} from "@nexlar/shared";
import { Button } from "../../components/ui/Button";
import { Banner } from "../../components/ui/Banner";
import { useAuth } from "../auth/AuthContext";
import { useShell } from "../shell/ShellContext";
import { fetchDashboard, type PreviewMode } from "./api";
import { ALERT_DEFS, FUNNEL_LABELS } from "./constants";
import { formatTime } from "./format";

const longDateFmt = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

export function DashboardPage() {
  const { broker } = useAuth();
  const firstName = broker?.fullName.trim().split(/\s+/)[0] ?? "";

  // Prévia temporária: alterna entre corretor novo e dados de exemplo enquanto
  // o endpoint real não existe. Removível junto com o mock.
  const [preview, setPreview] = useState<PreviewMode>("vazio");

  const query = useQuery({
    queryKey: ["dashboard", preview],
    queryFn: () => fetchDashboard(preview),
  });

  const summary = query.data;
  const isEmpty = summary ? isNewBroker(summary) : false;
  const overdueCount = summary?.today.overdue.length ?? 0;

  return (
    <div className="pb-4">
      {/* Hero: painel navy com o gradiente da marca e o resumo do dia. */}
      <section
        className="animate-rise relative overflow-hidden rounded-2xl bg-primary p-5 text-text-on-brand shadow-md sm:p-8"
        style={{ animationDelay: "0ms" }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(130% 120% at 12% 0%, var(--brand-navy-700) 0%, var(--primary) 48%, var(--primary-active) 100%)",
          }}
        />
        <div
          className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full opacity-25"
          aria-hidden="true"
          style={{
            background: "radial-gradient(circle, var(--accent) 0%, transparent 68%)",
          }}
        />
        <div className="relative">
          <p className="text-caption font-semibold uppercase tracking-wide text-[var(--brand-navy-200)] first-letter:uppercase sm:text-body-sm">
            {longDateFmt.format(new Date())}
          </p>
          <h1 className="mt-1 text-h1 text-text-on-brand sm:mt-1.5 sm:text-display">
            Olá, {firstName}
          </h1>
          {summary && !isEmpty ? (
            <div className="mt-3.5 flex flex-wrap gap-1.5 sm:mt-5 sm:gap-2">
              {overdueCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--danger)] px-3 py-1 text-caption font-semibold text-white shadow-sm sm:px-3.5 sm:py-1.5 sm:text-body-sm">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" />
                    <path d="M12 8v4.5l2.6 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  {overdueCount === 1 ? "1 atrasada" : `${overdueCount} atrasadas`}
                </span>
              )}
              <HeroChip
                value={summary.today.dueToday.length + summary.today.overdue.length}
                label="tarefas hoje"
              />
              <HeroChip value={summary.metrics.leadsThisMonth} label="leads no mês" />
              <HeroChip value={summary.metrics.openNegotiations} label="negociações" />
            </div>
          ) : (
            <p className="mt-3 max-w-md text-body text-[var(--brand-navy-100)]">
              Seu dia organizado num só lugar: tarefas, alertas e o funil dos seus
              atendimentos.
            </p>
          )}
        </div>
      </section>

      {summary && !isEmpty && <SmartFocus summary={summary} />}

      {query.isLoading && <DashboardSkeleton />}

      {query.isError && (
        <div className="mt-8 flex flex-col gap-4">
          <Banner variant="danger">Não foi possível carregar seu resumo agora.</Banner>
          <div>
            <Button variant="ghost" type="button" onClick={() => query.refetch()}>
              Tentar de novo
            </Button>
          </div>
        </div>
      )}

      {summary && (isEmpty ? <EmptyDashboard /> : <DashboardContent summary={summary} />)}

      <div className="mt-10">
        <PreviewSwitch mode={preview} onChange={setPreview} />
      </div>
    </div>
  );
}

// --- Estado de sucesso ------------------------------------------------------

function DashboardContent({ summary }: { summary: DashboardSummary }) {
  const { today, alerts, metrics, conversions } = summary;
  const tasks = [
    ...today.overdue.map((t) => ({ task: t, overdue: true })),
    ...today.dueToday.map((t) => ({ task: t, overdue: false })),
  ];
  const visibleAlerts = ALERT_DEFS.filter((def) => alerts[def.key] > 0);
  const maxStage = Math.max(1, ...metrics.activeByStage.map((s) => s.count));
  const totalActive = metrics.activeByStage.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="mt-9 flex flex-col gap-10">
      {/* Este mês em primeiro: os números do negócio abrem a página. */}
      <Section title="Este mês" caption="comparado ao período anterior" delay={60}>
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          <div className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
            <KpiCell
              label="Leads no mês"
              value={metrics.leadsThisMonth}
              previous={metrics.leadsLastMonth}
              compare="mês passado"
            />
            <KpiCell
              label="Visitas na semana"
              value={metrics.visitsThisWeek}
              previous={metrics.visitsLastWeek}
              compare="semana passada"
            />
            <KpiCell
              label="Visitas no mês"
              value={metrics.visitsThisMonth}
              previous={metrics.visitsLastMonth}
              compare="mês passado"
            />
            <KpiCell
              label="Negociações abertas"
              value={metrics.openNegotiations}
              previous={metrics.negotiationsLastMonth}
              compare="mês passado"
            />
          </div>
          <div className="border-t border-border p-5 sm:p-6">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-h3 text-text">Leads novos por mês</h3>
              <span className="hidden text-body-sm text-text-subtle sm:block">
                últimos {metrics.leadsByMonth.length} meses
              </span>
            </div>
            <LeadsChart series={metrics.leadsByMonth} />
          </div>
        </div>
      </Section>

      {/* Hoje e Radar lado a lado no desktop; empilhados no mobile. */}
      <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-8">
        <Section id="hoje" title="Hoje" caption="suas tarefas do dia" delay={120}>
          {tasks.length > 0 ? (
            <GroupCard>
              {tasks.map(({ task, overdue }) => (
                <TaskRow key={task.id} task={task} overdue={overdue} />
              ))}
            </GroupCard>
          ) : (
            <GroupCard>
              <p className="px-5 py-6 text-body-sm text-text-muted">
                Nenhuma tarefa para hoje. Bom momento para dar o próximo passo com um
                lead ativo.
              </p>
            </GroupCard>
          )}
        </Section>

        {visibleAlerts.length > 0 && (
          <Section title="Radar" caption="o que precisa de atenção" delay={180}>
            <GroupCard>
              {visibleAlerts.map((def) => (
                <AlertRow
                  key={def.key}
                  count={alerts[def.key]}
                  label={def.label}
                  to={def.to}
                  attention={def.tone === "attention"}
                  icon={ALERT_ICONS[def.key]}
                />
              ))}
            </GroupCard>
          </Section>
        )}
      </div>

      {/* Funil: retrato atual da carteira ativa. */}
      <Section title="Funil" caption="leads ativos por etapa" delay={240}>
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-body-sm text-text-muted">Onde estão seus atendimentos</span>
            <span className="text-body-sm tabular-nums text-text-subtle">
              {totalActive} no total
            </span>
          </div>
          <div className="mt-5 flex flex-col gap-3.5">
            {metrics.activeByStage.map((stage, i) => (
              <FunnelBar key={stage.group} stage={stage} max={maxStage} index={i} />
            ))}
          </div>
        </div>
      </Section>

      {/* Conversões: um bloco só, três medidas. */}
      <Section title="Conversões" delay={300}>
        <div className="grid overflow-hidden rounded-2xl border border-border bg-surface shadow-sm sm:grid-cols-3 sm:divide-x sm:divide-border">
          <RingCell fraction={conversions.leadToVisit} label="Lead → visita" />
          <div className="border-t border-border sm:border-t-0">
            <RingCell fraction={conversions.visitToNegotiation} label="Visita → negociação" />
          </div>
          <div className="flex items-center gap-4 border-t border-border p-5 sm:border-t-0">
            <div className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl bg-highlight-strong">
              <svg className="h-6 w-6 text-highlight-fg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.8" />
                <path d="M12 8v4.2l2.8 1.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <div className="text-h2 font-extrabold tabular-nums text-text">
                {conversions.avgDaysToClose === null ? "–" : `${conversions.avgDaysToClose} dias`}
              </div>
              <div className="mt-0.5 text-body-sm text-text-muted">Tempo médio até fechar</div>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}

// --- Blocos reutilizáveis ---------------------------------------------------

function Section({
  title,
  caption,
  children,
  className = "",
  delay = 0,
  id,
}: {
  title: string;
  caption?: string;
  children: ReactNode;
  className?: string;
  delay?: number;
  id?: string;
}) {
  return (
    <section id={id} className={`animate-rise scroll-mt-20 ${className}`} style={{ animationDelay: `${delay}ms` }}>
      <div className="mb-3.5 flex items-baseline gap-2.5">
        <h2 className="text-h3 text-text">{title}</h2>
        {caption && <span className="text-body-sm text-text-subtle">{caption}</span>}
      </div>
      {children}
    </section>
  );
}

/** Cartão agrupado: uma moldura, linhas divididas. Base das listas da Home. */
function GroupCard({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      {children}
    </div>
  );
}

function HeroChip({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-full bg-[rgba(255,255,255,0.12)] px-3 py-1 text-caption text-[var(--brand-navy-100)] sm:px-3.5 sm:py-1.5 sm:text-body-sm">
      <span className="font-extrabold tabular-nums text-text-on-brand">{value}</span>
      {label}
    </span>
  );
}

/**
 * Foco de agora: a camada assistente da Home. Lê o resumo e aponta a próxima
 * ação mais importante do corretor, na ordem: tarefa atrasada, alerta que
 * precisa de atenção, próxima tarefa do dia. É o embrião do agente da Nexlar:
 * hoje a regra é determinística; amanhã a API entrega a sugestão pronta.
 */
function SmartFocus({ summary }: { summary: DashboardSummary }) {
  const focus = buildFocus(summary);
  if (!focus) return null;
  return (
    <a
      href={focus.to}
      className="animate-rise mt-4 flex items-center gap-3.5 rounded-2xl border border-highlight-border bg-highlight-soft p-4 shadow-xs transition-colors duration-fast hover:bg-highlight-strong focus-visible:shadow-focus sm:px-5"
      style={{ animationDelay: "40ms" }}
    >
      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-accent text-accent-on">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2.5l1.9 5.4a2 2 0 001.2 1.2l5.4 1.9-5.4 1.9a2 2 0 00-1.2 1.2L12 19.5l-1.9-5.4a2 2 0 00-1.2-1.2L3.5 11l5.4-1.9a2 2 0 001.2-1.2L12 2.5z" />
          <path d="M19.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-caption font-semibold uppercase tracking-wide text-highlight-fg">
          Foco de agora
        </span>
        <span className="block truncate text-body font-semibold text-text">{focus.title}</span>
        <span className="block text-body-sm text-text-muted">{focus.detail}</span>
      </span>
      <svg
        className="h-4 w-4 flex-none text-text-subtle"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}

/** Regra do foco: atrasada > alerta de atenção > próxima tarefa do dia. */
function buildFocus(
  summary: DashboardSummary,
): { title: string; detail: string; to: string } | null {
  const overdueTask = summary.today.overdue[0];
  if (overdueTask) {
    return {
      title: overdueTask.title,
      detail: `${overdueTask.leadName} · tarefa atrasada, resolva primeiro`,
      to: "#hoje",
    };
  }
  const alertDef = ALERT_DEFS.find(
    (def) => def.tone === "attention" && summary.alerts[def.key] > 0,
  );
  if (alertDef) {
    const count = summary.alerts[alertDef.key];
    return {
      title: `${count} ${alertDef.label.toLowerCase()}`,
      detail: "Leads esfriam rápido: um contato hoje mantém a conversa viva",
      to: alertDef.to,
    };
  }
  const nextTask = summary.today.dueToday[0];
  if (nextTask) {
    return {
      title: nextTask.title,
      detail: `${nextTask.leadName} · próxima tarefa de hoje, às ${formatTime(nextTask.dueAt)}`,
      to: "#hoje",
    };
  }
  return null;
}

const ALERT_ICONS: Record<keyof DashboardAlerts, ReactNode> = {
  newLeadsAwaitingContact: (
    <>
      <path d="M15 18c0-2.5-2-4.5-4.5-4.5S6 15.5 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="10.5" cy="8.5" r="2.8" stroke="currentColor" strokeWidth="1.8" />
      <path d="M17 7h4M19 5v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  leadsWithoutFollowUp: (
    <>
      <path d="M18 9A6 6 0 106 9c0 5-2 6-2 6h16s-2-1-2-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.3 19a2 2 0 003.4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  stalledLeads: (
    <>
      <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 8v4.2l2.8 1.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  pendingDocuments: (
    <>
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M14 3v5h5M9.5 13h5M9.5 16.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  pendingSimulations: (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 7.5h7M8.5 12h2.5M8.5 16h2.5M13.5 12h2M13.5 16h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
};

/**
 * Linha do Radar: ícone, rótulo, contagem e seta. Lista agrupada em vez de
 * grade de cards: escaneável, densa e igual de boa no mobile e no desktop.
 */
function AlertRow({
  count,
  label,
  to,
  attention,
  icon,
}: {
  count: number;
  label: string;
  to: string;
  attention: boolean;
  icon: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3.5 px-4 py-3.5 transition-colors duration-fast hover:bg-surface-sunken focus-visible:bg-surface-sunken sm:px-5"
    >
      <span
        className={
          "flex h-11 w-11 flex-none items-center justify-center rounded-xl " +
          (attention ? "bg-highlight-strong text-highlight-fg" : "bg-surface-sunken text-text-muted")
        }
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          {icon}
        </svg>
      </span>
      <span className="min-w-0 flex-1 text-body font-semibold text-text">{label}</span>
      <span
        className={
          "grid h-7 min-w-7 flex-none place-items-center rounded-full px-2 text-body-sm font-bold tabular-nums " +
          (attention ? "bg-primary text-primary-on" : "bg-surface-sunken text-text-muted")
        }
      >
        {count}
      </span>
      <svg
        className="h-4 w-4 flex-none text-text-subtle transition-transform duration-base ease-standard group-hover:translate-x-0.5"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

/** Célula de indicador com variação contra o período anterior. */
function KpiCell({
  label,
  value,
  previous,
  compare,
}: {
  label: string;
  value: number;
  previous: number;
  compare: string;
}) {
  return (
    <div className="bg-surface p-4 sm:p-5">
      <div className="truncate text-caption text-text-muted sm:text-body-sm">{label}</div>
      <div className="mt-0.5 text-h1 font-extrabold tabular-nums text-text sm:mt-1 sm:text-display">
        {value}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <TrendChip value={value} previous={previous} />
        <span className="hidden text-caption text-text-subtle sm:inline">vs {compare}</span>
      </div>
    </div>
  );
}

/** ▲ verde subiu, ▼ vermelho caiu, • neutro estável. Sempre com texto. */
function TrendChip({ value, previous }: { value: number; previous: number }) {
  if (value === previous) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2 py-0.5 text-caption font-bold text-text-muted">
        estável
      </span>
    );
  }
  const up = value > previous;
  const pct =
    previous > 0 ? `${Math.round((Math.abs(value - previous) / previous) * 100)}%` : `+${value}`;
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-bold tabular-nums " +
        (up
          ? "bg-[var(--success-soft)] text-[var(--success-fg)]"
          : "bg-danger-soft text-danger-fg")
      }
    >
      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {up ? (
          <path d="M12 19V5m0 0l-6 6m6-6l6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M12 5v14m0 0l-6-6m6 6l6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
      {pct}
    </span>
  );
}

const chartMonthFmt = new Intl.DateTimeFormat("pt-BR", { month: "short" });

/** Gráfico de barras dos leads por mês; o mês corrente ganha destaque navy. */
function LeadsChart({ series }: { series: MonthCount[] }) {
  const max = Math.max(1, ...series.map((m) => m.leads));
  return (
    <div className="mt-5">
      <div className="flex h-24 items-end gap-2 sm:h-32 sm:gap-3">
        {series.map((m, i) => {
          const current = i === series.length - 1;
          const pct = Math.max(4, Math.round((m.leads / max) * 100));
          return (
            <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              <span
                className={
                  "text-caption font-bold tabular-nums " +
                  (current ? "text-text" : "text-text-subtle")
                }
              >
                {m.leads}
              </span>
              <div
                className="animate-rise w-full max-w-12 rounded-t-md"
                style={{
                  height: `${pct}%`,
                  animationDelay: `${120 + i * 60}ms`,
                  background: current
                    ? "linear-gradient(180deg, var(--brand-navy-500), var(--brand-navy-800))"
                    : "var(--brand-navy-200)",
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2 border-t border-border pt-2 sm:gap-3">
        {series.map((m, i) => {
          const [year, month] = m.month.split("-").map(Number);
          const label = chartMonthFmt.format(new Date(year, month - 1, 1)).replace(".", "");
          const current = i === series.length - 1;
          return (
            <span
              key={m.month}
              className={
                "flex-1 text-center text-caption " +
                (current ? "font-bold text-text" : "text-text-subtle")
              }
            >
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function FunnelBar({
  stage,
  max,
  index,
}: {
  stage: FunnelStageCount;
  max: number;
  index: number;
}) {
  const pct = Math.round((stage.count / max) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 flex-none truncate text-body-sm text-text-muted sm:w-32">
        {FUNNEL_LABELS[stage.group]}
      </span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
        <div
          className="animate-rise h-full rounded-full"
          style={{
            width: `${pct}%`,
            animationDelay: `${240 + index * 70}ms`,
            background:
              "linear-gradient(90deg, var(--brand-navy-500), var(--brand-navy-700))",
          }}
        />
      </div>
      <span className="w-7 flex-none text-right text-body-sm font-bold tabular-nums text-text">
        {stage.count}
      </span>
    </div>
  );
}

function RingCell({ fraction, label }: { fraction: number; label: string }) {
  const pct = Math.round(fraction * 100);
  return (
    <div className="flex items-center gap-4 p-5">
      <div
        className="relative h-14 w-14 flex-none rounded-full"
        style={{
          background: `conic-gradient(var(--highlight) ${pct}%, var(--surface-sunken) 0)`,
        }}
        role="img"
        aria-label={`${pct}%`}
      >
        <div className="absolute inset-[5px] flex items-center justify-center rounded-full bg-surface">
          <span className="text-caption font-bold tabular-nums text-text">{pct}%</span>
        </div>
      </div>
      <div className="text-body-sm font-semibold text-text">{label}</div>
    </div>
  );
}

/** Linha de tarefa: atrasada é vermelha de verdade; as demais, horário em azul. */
function TaskRow({ task, overdue = false }: { task: DashboardTask; overdue?: boolean }) {
  return (
    <div
      className={
        "flex items-center gap-3.5 px-4 py-3.5 sm:px-5 " +
        (overdue ? "bg-danger-soft" : "")
      }
    >
      <span
        className={
          "grid w-[4.25rem] flex-none place-items-center rounded-lg px-2 py-1.5 text-caption font-bold tabular-nums " +
          (overdue ? "bg-danger text-white" : "bg-highlight-strong text-highlight-fg")
        }
      >
        {overdue ? "Atrasada" : formatTime(task.dueAt)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-body font-semibold text-text">{task.title}</p>
        <p className={"truncate text-body-sm " + (overdue ? "text-danger-fg" : "text-text-muted")}>
          {task.leadName}
        </p>
      </div>
    </div>
  );
}

// --- Estado vazio (corretor novo) -------------------------------------------

function EmptyDashboard() {
  const { openNewLead } = useShell();
  return (
    <section
      className="animate-rise relative mt-9 overflow-hidden rounded-2xl border border-border bg-surface px-6 py-14 text-center shadow-sm"
      style={{ animationDelay: "80ms" }}
    >
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-56 w-[28rem] -translate-x-1/2 opacity-70"
        aria-hidden="true"
        style={{
          background: "radial-gradient(closest-side, var(--accent-soft) 0%, transparent 100%)",
        }}
      />
      <div className="relative flex flex-col items-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft shadow-xs">
          <svg className="h-8 w-8 text-accent" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M16 19c0-2.8-2.2-5-5-5s-5 2.2-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="11" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M18 8h4M20 6v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </div>
        <h2 className="mt-6 text-h2 text-text">Tudo começa por um lead</h2>
        <p className="mt-2 max-w-sm text-body text-text-muted">
          Cadastre seu primeiro cliente para acompanhar cada atendimento até o
          fechamento. Assim que seus leads e tarefas existirem, seu resumo do dia
          aparece aqui.
        </p>
        <Button variant="accent" type="button" className="mt-7" onClick={openNewLead}>
          Cadastrar lead
        </Button>
        <p className="mt-3 text-caption text-text-subtle">
          Só o nome e o WhatsApp são obrigatórios.
        </p>
      </div>
    </section>
  );
}

// --- Estado de carregando ---------------------------------------------------

function DashboardSkeleton() {
  return (
    <div className="mt-9 flex animate-pulse flex-col gap-10" aria-hidden="true">
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-8">
        <div className="flex flex-col gap-3">
          <div className="h-6 w-20 rounded bg-surface-sunken" />
          <div className="h-52 rounded-2xl bg-surface-sunken" />
        </div>
        <div className="flex flex-col gap-3">
          <div className="h-6 w-24 rounded bg-surface-sunken" />
          <div className="h-52 rounded-2xl bg-surface-sunken" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="h-6 w-24 rounded bg-surface-sunken" />
        <div className="h-28 rounded-2xl bg-surface-sunken" />
        <div className="h-56 rounded-2xl bg-surface-sunken" />
      </div>
    </div>
  );
}

// --- Prévia temporária (removível com o mock) -------------------------------

function PreviewSwitch({
  mode,
  onChange,
}: {
  mode: PreviewMode;
  onChange: (mode: PreviewMode) => void;
}) {
  const options: { value: PreviewMode; label: string }[] = [
    { value: "vazio", label: "Corretor novo" },
    { value: "cheio", label: "Com dados de exemplo" },
  ];
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border-strong bg-surface-sunken px-3 py-2">
      <span className="text-caption font-semibold uppercase tracking-wide text-text-subtle">
        Prévia temporária
      </span>
      <div className="inline-flex rounded-full bg-surface p-1 shadow-xs">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={mode === opt.value}
            className={
              "rounded-full px-3.5 py-1 text-caption font-semibold transition-colors duration-fast " +
              (mode === opt.value
                ? "bg-primary text-primary-on shadow-xs"
                : "text-text-muted hover:text-text")
            }
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Utilidades -------------------------------------------------------------

function isNewBroker(s: DashboardSummary): boolean {
  const noAlerts = Object.values(s.alerts).every((v) => v === 0);
  const noStages = s.metrics.activeByStage.every((st) => st.count === 0);
  return (
    s.today.dueToday.length === 0 &&
    s.today.overdue.length === 0 &&
    noAlerts &&
    noStages &&
    s.metrics.leadsThisMonth === 0 &&
    s.metrics.visitsThisMonth === 0 &&
    s.metrics.openNegotiations === 0
  );
}
