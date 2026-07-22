import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FUNNEL_GROUPS, FUNNEL_GROUP_BY_STATUS } from "@nexlar/shared";
import type { FunnelGroup, LeadSummary } from "@nexlar/shared";
import { Banner } from "../../components/ui/Banner";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { useShell } from "../shell/ShellContext";
import { fetchLeads } from "../leads/api";
import { fetchClients } from "../clients/api";
import {
  STATUS_LABELS,
  STATUS_TONE,
  displayDateTime,
  whatsappLink,
} from "../leads/labels";
import type { StatusTone } from "../leads/labels";
import { StageDialog } from "./StageDialog";
import { FUNNEL_LABELS } from "./labels";

/** Cor do texto do status no card, por tom. */
const TONE_TEXT: Record<StatusTone, string> = {
  novo: "text-[var(--highlight-fg)]",
  ativo: "text-accent",
  ganho: "text-[var(--success-fg)]",
  encerrado: "text-text-subtle",
};

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** Lead do pipeline sem contato há 7+ dias está parada e merece alerta. */
function stalledDays(lead: LeadSummary): number | null {
  const group = FUNNEL_GROUP_BY_STATUS[lead.status];
  if (group === "clientes" || group === "encerradas") return null;
  const days = daysSince(lead.lastContactAt ?? lead.createdAt);
  return days >= 7 ? days : null;
}

function isOverdue(lead: LeadSummary): boolean {
  return lead.nextActionAt != null && new Date(lead.nextActionAt).getTime() < Date.now();
}

/**
 * Dentro da raia, quem precisa de atenção vem primeiro: ação atrasada, depois
 * paradas, depois as demais (mais recentes antes). O corretor não caça lead.
 */
function attentionSort(a: LeadSummary, b: LeadSummary): number {
  const score = (l: LeadSummary) => (isOverdue(l) ? 0 : stalledDays(l) != null ? 1 : 2);
  const diff = score(a) - score(b);
  if (diff !== 0) return diff;
  const at = a.lastContactAt ?? a.createdAt;
  const bt = b.lastContactAt ?? b.createdAt;
  return bt.localeCompare(at);
}

/**
 * Funil de leads (J4): uma raia horizontal por etapa, empilhadas na vertical.
 * O mesmo layout serve mobile e desktop e escala para dezenas de leads: a
 * raia rola na horizontal e a contagem diz o total. O funil anda sozinho com
 * os eventos comerciais; mudar etapa na mão é pelo card (seletor com regras).
 */
export function FunnelPage() {
  const navigate = useNavigate();
  const { openNewLead } = useShell();
  const query = useQuery({ queryKey: ["leads"], queryFn: fetchLeads });
  // Convertidas não vêm em /leads: a contagem de clientes vem da área Clientes.
  const clientsQuery = useQuery({ queryKey: ["clients", {}], queryFn: () => fetchClients({}) });

  const [actionLead, setActionLead] = useState<LeadSummary | null>(null);
  const [stageLead, setStageLead] = useState<LeadSummary | null>(null);

  const leads = query.data ?? [];
  const byGroup = useMemo(() => {
    const map: Record<FunnelGroup, LeadSummary[]> = {
      novos: [],
      atendimento: [],
      imoveis_enviados: [],
      visitas: [],
      clientes: [],
      encerradas: [],
    };
    for (const lead of leads) map[FUNNEL_GROUP_BY_STATUS[lead.status]].push(lead);
    for (const group of FUNNEL_GROUPS) map[group].sort(attentionSort);
    return map;
  }, [leads]);

  if (query.isPending) return <FunnelSkeleton />;

  if (query.isError) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <Banner variant="danger">
          Não foi possível carregar o funil. Verifique a conexão e tente novamente.
        </Banner>
        <Button type="button" variant="ghost" className="self-start" onClick={() => query.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  // Vazio de verdade: sem lead E sem cliente. Com clientes, o quadro aparece
  // (raias vazias orientam) junto do atalho para a área Clientes.
  if (leads.length === 0 && (clientsQuery.data?.length ?? 0) === 0) {
    return (
      <section className="animate-rise mx-auto mt-4 flex max-w-xl flex-col items-center rounded-2xl border border-border bg-surface px-6 py-12 text-center shadow-sm">
        <h2 className="text-h2 text-text">Seu funil aparece aqui</h2>
        <p className="mt-2 max-w-sm text-body text-text-muted">
          Cadastre sua primeira lead para acompanhar cada etapa da jornada, do primeiro contato à
          conversão.
        </p>
        <Button type="button" variant="accent" className="mt-6" onClick={openNewLead}>
          Cadastrar lead
        </Button>
      </section>
    );
  }

  const closedCount = byGroup.encerradas.length;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-3">
      {FUNNEL_GROUPS.filter((g) => g !== "clientes").map((group) => (
        <StageLane
          key={group}
          group={group}
          leads={byGroup[group]}
          onOpenLead={(lead) => setActionLead(lead)}
        />
      ))}

      {/* Cliente é outra fase, outra área: o funil mostra só o resumo e leva
          para /clientes, em vez de repetir a lista aqui. */}
      <Link
        to="/clientes"
        className="flex items-center gap-2.5 rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-sm transition-colors hover:bg-surface-sunken/60"
      >
        <h2 className="text-body font-bold text-text">{FUNNEL_LABELS.clientes}</h2>
        <span
          className={
            "flex h-6 min-w-[24px] items-center justify-center rounded-full px-1.5 text-caption font-bold tabular-nums " +
            ((clientsQuery.data?.length ?? 0) > 0
              ? "bg-[var(--success)] text-white"
              : "bg-surface-sunken text-text-subtle")
          }
        >
          {clientsQuery.data?.length ?? 0}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-body-sm text-text-muted">
          Abrir área Clientes
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </Link>

      {closedCount > 0 && (
        <Link
          to="/leads"
          className="inline-flex items-center gap-1.5 self-start px-1 py-1 text-body-sm text-text-muted transition-colors hover:text-text"
        >
          {closedCount === 1 ? "1 lead encerrada" : `${closedCount} leads encerradas`} (perdidas ou
          a reativar)
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      )}

      {actionLead && (
        <LeadActionSheet
          lead={actionLead}
          onClose={() => setActionLead(null)}
          onOpenFicha={() => navigate(`/leads/${actionLead.id}`)}
          onChangeStage={() => {
            setStageLead(actionLead);
            setActionLead(null);
          }}
        />
      )}

      {stageLead && <StageDialog lead={stageLead} onClose={() => setStageLead(null)} />}
    </div>
  );
}

/** Quantas linhas cada etapa mostra antes do "Mostrar todas". */
const VISIBLE_ROWS = 5;

/** Etapa como tabela: cabeçalho com contagem + linhas compactas de leads. */
function StageLane({
  group,
  leads,
  onOpenLead,
}: {
  group: (typeof FUNNEL_GROUPS)[number];
  leads: LeadSummary[];
  onOpenLead: (lead: LeadSummary) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const attention = leads.filter((l) => isOverdue(l) || stalledDays(l) != null).length;
  const visible = expanded ? leads : leads.slice(0, VISIBLE_ROWS);
  const hidden = leads.length - visible.length;

  return (
    <section
      aria-label={FUNNEL_LABELS[group]}
      className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
    >
      <header className="flex items-center gap-2.5 border-b border-border/70 px-4 py-3">
        <h2 className="text-body font-bold text-text">{FUNNEL_LABELS[group]}</h2>
        <span
          className={
            "flex h-6 min-w-[24px] items-center justify-center rounded-full px-1.5 text-caption font-bold tabular-nums " +
            (leads.length > 0
              ? "bg-accent text-accent-on"
              : "bg-surface-sunken text-text-subtle")
          }
        >
          {leads.length}
        </span>
        {attention > 0 && (
          <span className="ml-auto text-caption font-semibold text-[var(--danger-fg)]">
            {attention} {attention === 1 ? "precisa" : "precisam"} de atenção
          </span>
        )}
      </header>

      {leads.length === 0 ? (
        <p className="px-4 py-3 text-body-sm text-text-subtle">
          {group === "clientes" ? "Nenhum cliente ainda." : "Nenhuma lead nesta etapa."}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-border/70">
            {visible.map((lead) => (
              <LeadRow key={lead.id} lead={lead} onOpen={() => onOpenLead(lead)} />
            ))}
          </ul>
          {(hidden > 0 || expanded) && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="block w-full border-t border-border/70 px-4 py-2.5 text-center text-body-sm font-semibold text-accent transition-colors hover:bg-surface-sunken"
            >
              {expanded ? "Mostrar menos" : `Mostrar todas (${leads.length})`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/** Linha da lead: nome e situação à esquerda, alerta e contato à direita. */
function LeadRow({ lead, onOpen }: { lead: LeadSummary; onOpen: () => void }) {
  const stalled = stalledDays(lead);
  const overdue = isOverdue(lead);
  const alert =
    overdue && lead.nextActionAt
      ? { label: `Ação atrasada · ${displayDateTime(lead.nextActionAt)}`, tone: "danger" as const }
      : stalled != null
        ? { label: `Parada há ${stalled} ${stalled === 1 ? "dia" : "dias"}`, tone: "danger" as const }
        : lead.nextActionAt
          ? { label: `Próxima ação · ${displayDateTime(lead.nextActionAt)}`, tone: "muted" as const }
          : null;

  return (
    <li className="relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-sunken/60">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Abrir ações de ${lead.fullName}`}
        className="absolute inset-0 focus-visible:shadow-focus"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-sm font-semibold text-text">{lead.fullName}</p>
        <p className="mt-0.5 truncate text-caption">
          <span className={`font-semibold ${TONE_TEXT[STATUS_TONE[lead.status]]}`}>
            {STATUS_LABELS[lead.status]}
          </span>
          {alert && (
            <span
              className={
                alert.tone === "danger"
                  ? "font-semibold text-[var(--danger-fg)]"
                  : "text-text-muted"
              }
            >
              {" · "}
              {alert.label}
            </span>
          )}
        </p>
      </div>
      <a
        href={whatsappLink(lead.whatsapp)}
        target="_blank"
        rel="noreferrer"
        aria-label={`Conversar com ${lead.fullName} no WhatsApp`}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--success-soft)] text-[var(--success-fg)] transition-transform hover:scale-105"
      >
        <WhatsAppGlyph className="h-[18px] w-[18px]" />
      </a>
      <svg
        className="h-4 w-4 shrink-0 text-text-subtle"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </li>
  );
}

function LeadActionSheet({
  lead,
  onClose,
  onOpenFicha,
  onChangeStage,
}: {
  lead: LeadSummary;
  onClose: () => void;
  onOpenFicha: () => void;
  onChangeStage: () => void;
}) {
  return (
    <Modal open onClose={onClose} title={lead.fullName}>
      <div className="flex flex-col gap-3">
        <p className={`text-body-sm font-semibold ${TONE_TEXT[STATUS_TONE[lead.status]]}`}>
          {STATUS_LABELS[lead.status]}
        </p>
        <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
          <SheetItem label="Abrir ficha da lead" onClick={onOpenFicha} />
          <a
            href={whatsappLink(lead.whatsapp)}
            target="_blank"
            rel="noreferrer"
            className="block px-4 py-3.5 text-body text-text transition-colors hover:bg-surface-sunken"
          >
            Conversar no WhatsApp
          </a>
          <SheetItem label="Alterar etapa" onClick={onChangeStage} />
        </div>
      </div>
    </Modal>
  );
}

function SheetItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full px-4 py-3.5 text-left text-body text-text transition-colors hover:bg-surface-sunken"
    >
      {label}
    </button>
  );
}

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.611-.916-2.206-.242-.58-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12.05 21.785h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885" />
    </svg>
  );
}

function FunnelSkeleton() {
  return (
    <div role="status" aria-label="Carregando funil" className="mx-auto flex max-w-5xl flex-col gap-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-36 animate-pulse rounded-2xl bg-surface-sunken" />
      ))}
    </div>
  );
}
