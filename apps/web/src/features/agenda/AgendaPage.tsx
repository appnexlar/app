import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import type { DateSelectArg, EventClickArg, DatesSetArg } from "@fullcalendar/core";
import ptBrLocale from "@fullcalendar/core/locales/pt-br";
import type { AgendaEventSummary, AgendaEventType, AgendaListQuery } from "@nexlar/shared";
import { Banner } from "../../components/ui/Banner";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import {
  deleteAgendaEvent,
  fetchAgenda,
  fetchAgendaSummary,
  updateAgendaEvent,
} from "./api";
import { EventFormModal } from "./EventFormModal";
import { VisitAvailabilitySection } from "./VisitAvailabilitySection";
import { usePageAction } from "../shell/ShellContext";
import {
  STATUS_LABELS,
  TYPE_LABELS,
  TYPE_STYLE,
  formatTime,
  toDateInput,
  toTimeInput,
} from "./labels";
import "./agenda-calendar.css";

type FormType = "tarefa" | "compromisso";

interface FormState {
  type: FormType;
  event?: AgendaEventSummary | null;
  prefill?: { title?: string; date?: string; startTime?: string; endTime?: string; allDay?: boolean };
}

const CLOSED = new Set(["concluida", "cancelada", "realizada", "nao_compareceu"]);

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 640px)").matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return mobile;
}

export function AgendaPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const calendarRef = useRef<FullCalendar>(null);

  const views = useMemo(
    () =>
      isMobile
        ? [
            { key: "timeGridDay", label: "Dia" },
            { key: "dayGridMonth", label: "Mês" },
            { key: "listWeek", label: "Lista" },
          ]
        : [
            { key: "timeGridDay", label: "Dia" },
            { key: "timeGridWeek", label: "Semana" },
            { key: "dayGridMonth", label: "Mês" },
            { key: "listWeek", label: "Lista" },
          ],
    [isMobile],
  );

  const [view, setView] = useState(isMobile ? "listWeek" : "timeGridWeek");
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [periodTitle, setPeriodTitle] = useState("");
  const [filters, setFilters] = useState<AgendaListQuery>({});
  const [chooserOpen, setChooserOpen] = useState(false);
  const [formState, setFormState] = useState<FormState | null>(null);
  const [actionEvent, setActionEvent] = useState<AgendaEventSummary | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [googleOpen, setGoogleOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AgendaEventSummary | null>(null);
  usePageAction("Novo compromisso", () => setChooserOpen(true));

  // Quando o tamanho muda, garante uma view coerente (semana não existe no mobile).
  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    if (isMobile && view === "timeGridWeek") changeView("listWeek");
  }, [isMobile]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeFilterCount =
    (filters.type ? 1 : 0) +
    (filters.status ? 1 : 0) +
    (filters.source ? 1 : 0) +
    (filters.overdue ? 1 : 0) +
    (filters.done ? 1 : 0);

  const eventsQuery = useQuery({
    queryKey: ["agenda", range, filters],
    queryFn: () => fetchAgenda({ ...filters, from: range?.from, to: range?.to }),
    enabled: range != null,
  });

  const summaryQuery = useQuery({ queryKey: ["agenda-summary"], queryFn: fetchAgendaSummary });

  const queryClient = useQueryClient();
  const completeMutation = useMutation({
    mutationFn: (id: string) => updateAgendaEvent(id, { status: "concluida" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-summary"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setActionEvent(null);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAgendaEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-summary"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setDeleteTarget(null);
      setActionEvent(null);
    },
  });

  function changeView(key: string) {
    setView(key);
    calendarRef.current?.getApi().changeView(key);
  }

  function handleDatesSet(arg: DatesSetArg) {
    setRange({ from: arg.start.toISOString(), to: arg.end.toISOString() });
    setPeriodTitle(arg.view.title);
    setView(arg.view.type);
  }

  function handleSelect(sel: DateSelectArg) {
    const date = toDateInput(sel.start.toISOString());
    const allDay = sel.allDay;
    const startTime = allDay ? undefined : toTimeInput(sel.start.toISOString());
    const endTime = allDay ? undefined : toTimeInput(sel.end.toISOString());
    setChooserOpen(true);
    pendingPrefill.current = { date, startTime, endTime, allDay };
    calendarRef.current?.getApi().unselect();
  }

  const pendingPrefill = useRef<FormState["prefill"] | undefined>(undefined);

  function chooseType(type: FormType) {
    setChooserOpen(false);
    setFormState({ type, prefill: pendingPrefill.current });
    pendingPrefill.current = undefined;
  }

  function handleEventClick(arg: EventClickArg) {
    const ev = arg.event.extendedProps.ev as AgendaEventSummary;
    setActionEvent(ev);
  }

  const fcEvents = useMemo(
    () =>
      (eventsQuery.data ?? []).map((ev) => ({
        id: ev.id,
        title: ev.title,
        start: ev.startAt,
        end: ev.endAt ?? undefined,
        allDay: ev.allDay,
        extendedProps: { ev },
      })),
    [eventsQuery.data],
  );

  function applyQuick(next: AgendaListQuery, targetView?: string) {
    setFilters(next);
    if (targetView) changeView(targetView);
  }

  const noResults = eventsQuery.data?.length === 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      {/* Integração Google (preparada, conecta na próxima fatia). O "Novo
          compromisso" saiu daqui e subiu para junto do título, no mesmo lugar
          em que toda seção guarda a sua ação de criar. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setGoogleOpen(true)}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1 text-caption font-medium text-text-muted transition-colors hover:bg-surface-sunken"
        >
          <span className="h-2 w-2 rounded-full bg-[var(--text-subtle)]" aria-hidden="true" />
          Google Calendar: não conectado
        </button>
      </div>

      {/* Resumo operacional: indicadores clicáveis */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <SummaryCard
          label="Tarefas atrasadas"
          value={summaryQuery.data?.overdueTasks ?? 0}
          tone="danger"
          active={Boolean(filters.overdue)}
          onClick={() => applyQuick({ overdue: true }, "listWeek")}
        />
        <SummaryCard
          label="Tarefas de hoje"
          value={summaryQuery.data?.todayTasks ?? 0}
          tone="accent"
          active={filters.type === "tarefa"}
          onClick={() => {
            applyQuick({ type: "tarefa" }, "timeGridDay");
            calendarRef.current?.getApi().today();
          }}
        />
        <SummaryCard
          label="Visitas de hoje"
          value={summaryQuery.data?.todayVisits ?? 0}
          tone="success"
          active={filters.type === "visita"}
          onClick={() => {
            applyQuick({ type: "visita" }, "timeGridDay");
            calendarRef.current?.getApi().today();
          }}
        />
        <SummaryCard
          label="Visitas a confirmar"
          value={summaryQuery.data?.pendingVisitRequests ?? 0}
          tone="primary"
          active={filters.status === "aguardando_confirmacao"}
          onClick={() => applyQuick({ type: "visita", status: "aguardando_confirmacao" }, "listWeek")}
        />
      </div>

      {/* Navegação + views + filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <NavIconButton dir="prev" onClick={() => calendarRef.current?.getApi().prev()} />
          <Button
            type="button"
            variant="ghost"
            className="!px-3.5"
            onClick={() => calendarRef.current?.getApi().today()}
          >
            Hoje
          </Button>
          <NavIconButton dir="next" onClick={() => calendarRef.current?.getApi().next()} />
          <span className="ml-1.5 text-body font-semibold lowercase first-letter:uppercase text-text">
            {periodTitle}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
            {views.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => changeView(v.key)}
                className={
                  "rounded-md px-3 py-1.5 text-body-sm font-medium transition-colors " +
                  (view === v.key
                    ? "bg-accent text-accent-on"
                    : "text-text-muted hover:bg-surface-sunken")
                }
              >
                {v.label}
              </button>
            ))}
          </div>
          <Button type="button" variant="ghost" className="!px-3.5" onClick={() => setFiltersOpen(true)}>
            Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </Button>
        </div>
      </div>

      {/* Calendário */}
      {eventsQuery.isError ? (
        <div className="flex flex-col gap-3">
          <Banner variant="danger">
            Não foi possível carregar a agenda. Verifique a conexão e tente novamente.
          </Banner>
          <Button
            type="button"
            variant="ghost"
            className="self-start"
            onClick={() => eventsQuery.refetch()}
          >
            Tentar novamente
          </Button>
        </div>
      ) : (
        <>
          {noResults && activeFilterCount === 0 && (
            <EmptyHint
              onNewTask={() => setFormState({ type: "tarefa" })}
              onConnectGoogle={() => setGoogleOpen(true)}
            />
          )}
          {noResults && activeFilterCount > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-body-sm text-text-muted">
              Nenhum evento com os filtros atuais.
              <button
                type="button"
                onClick={() => setFilters({})}
                className="font-semibold text-accent hover:underline"
              >
                Limpar filtros
              </button>
            </div>
          )}
          <div className="agenda-calendar rounded-2xl border border-border bg-surface p-2 shadow-sm sm:p-3">
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
              initialView={view}
              locale={ptBrLocale}
              headerToolbar={false}
              height="auto"
              nowIndicator
              selectable
              selectMirror
              editable={false}
              slotMinTime="06:00:00"
              slotMaxTime="22:00:00"
              scrollTime="07:30:00"
              allDaySlot
              allDayText="Dia"
              firstDay={0}
              dayMaxEvents={3}
              events={fcEvents}
              datesSet={handleDatesSet}
              select={handleSelect}
              eventClick={handleEventClick}
              eventContent={renderEvent}
              noEventsContent="Nada por aqui neste período."
            />
          </div>
        </>
      )}

      {/* Horários em que a lead pode agendar visita sozinha (seleções). */}
      <VisitAvailabilitySection />

      {/* "O que deseja criar?" */}
      {chooserOpen && (
        <CreateChooser
          onClose={() => {
            setChooserOpen(false);
            pendingPrefill.current = undefined;
          }}
          onChoose={chooseType}
        />
      )}

      {/* Formulário de tarefa/compromisso */}
      {formState && (
        <EventFormModal
          type={formState.type}
          event={formState.event}
          prefill={formState.prefill}
          onClose={() => setFormState(null)}
        />
      )}

      {/* Ações do evento */}
      {actionEvent && (
        <EventActionSheet
          event={actionEvent}
          completing={completeMutation.isPending}
          onClose={() => setActionEvent(null)}
          onComplete={() => completeMutation.mutate(actionEvent.id)}
          onEdit={() => {
            const type = actionEvent.type === "tarefa" ? "tarefa" : "compromisso";
            setFormState({ type, event: actionEvent });
            setActionEvent(null);
          }}
          onDuplicate={() => {
            setFormState({
              type: actionEvent.type === "tarefa" ? "tarefa" : "compromisso",
              prefill: {
                title: actionEvent.title,
                date: toDateInput(actionEvent.startAt),
                startTime: actionEvent.allDay ? undefined : toTimeInput(actionEvent.startAt),
                endTime: actionEvent.endAt ? toTimeInput(actionEvent.endAt) : undefined,
                allDay: actionEvent.allDay,
              },
            });
            setActionEvent(null);
          }}
          onOpenLead={() => navigate(`/leads/${actionEvent.leadId}`)}
          onDelete={() => setDeleteTarget(actionEvent)}
        />
      )}

      {/* Filtros */}
      {filtersOpen && (
        <FiltersModal
          filters={filters}
          onApply={(f) => {
            setFilters(f);
            setFiltersOpen(false);
          }}
          onClear={() => {
            setFilters({});
            setFiltersOpen(false);
          }}
          onClose={() => setFiltersOpen(false)}
        />
      )}

      {/* Google (inerte nesta fatia) */}
      {googleOpen && <GoogleModal onClose={() => setGoogleOpen(false)} />}

      {/* Exclusão com confirmação */}
      <ConfirmDialog
        open={deleteTarget != null}
        title="Excluir da agenda"
        description={
          deleteTarget
            ? `"${deleteTarget.title}" será removido da sua agenda. Esta ação não pode ser desfeita.`
            : ""
        }
        confirmLabel="Excluir"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

/** Conteúdo compacto do evento: ponto do tipo + horário + título + lead. */
function renderEvent(arg: { event: { extendedProps: Record<string, unknown> } }) {
  const ev = arg.event.extendedProps.ev as AgendaEventSummary;
  const style = TYPE_STYLE[ev.type];
  const closed = CLOSED.has(ev.status);
  return (
    <div className={"flex min-w-0 items-center gap-1.5 px-1.5 py-1 " + (closed ? "opacity-55" : "")}>
      <span className={`h-2 w-2 flex-none rounded-full ${style.dot}`} aria-hidden="true" />
      {!ev.allDay && (
        <span className="flex-none text-caption font-semibold tabular-nums text-text-muted">
          {formatTime(ev.startAt)}
        </span>
      )}
      <span
        className={
          "truncate text-caption font-medium text-text " + (closed ? "line-through" : "")
        }
      >
        {ev.title}
      </span>
      {ev.leadName && (
        <span className="truncate text-caption text-text-subtle">· {ev.leadName}</span>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: "danger" | "accent" | "success" | "primary";
  active: boolean;
  onClick: () => void;
}) {
  const toneText =
    tone === "danger"
      ? "text-[var(--danger-fg)]"
      : tone === "success"
        ? "text-[var(--success-fg)]"
        : tone === "primary"
          ? "text-[var(--primary)]"
          : "text-[var(--accent-active)]";
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex flex-col items-start gap-0.5 rounded-xl border bg-surface px-3.5 py-3 text-left transition-colors hover:bg-surface-sunken " +
        (active ? "border-accent ring-1 ring-accent" : "border-border")
      }
    >
      <span className={`text-h2 font-bold tabular-nums ${toneText}`}>{value}</span>
      <span className="text-caption font-medium text-text-muted">{label}</span>
    </button>
  );
}

function NavIconButton({ dir, onClick }: { dir: "prev" | "next"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === "prev" ? "Período anterior" : "Próximo período"}
      className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-text-muted transition-colors hover:bg-surface-sunken hover:text-text"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d={dir === "prev" ? "M15 18l-6-6 6-6" : "M9 6l6 6-6 6"}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function CreateChooser({
  onClose,
  onChoose,
}: {
  onClose: () => void;
  onChoose: (type: FormType) => void;
}) {
  const items: { type: FormType | null; label: string; desc: string; soon?: boolean }[] = [
    { type: "tarefa", label: "Tarefa", desc: "Um retorno, contato ou lembrete." },
    { type: "compromisso", label: "Compromisso geral", desc: "Reunião ou evento seu." },
    { type: null, label: "Visita", desc: "Ligada a lead e imóvel.", soon: true },
    { type: null, label: "Bloqueio de horário", desc: "Período indisponível.", soon: true },
  ];
  return (
    <Modal open onClose={onClose} title="O que deseja criar?">
      <div className="flex flex-col gap-2.5">
        {items.map((it) => (
          <button
            key={it.label}
            type="button"
            disabled={it.soon}
            onClick={() => it.type && onChoose(it.type)}
            className={
              "flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3.5 text-left transition-colors " +
              (it.soon ? "cursor-not-allowed opacity-55" : "hover:bg-surface-sunken")
            }
          >
            <span className="flex flex-col">
              <span className="text-body font-semibold text-text">{it.label}</span>
              <span className="text-caption text-text-muted">{it.desc}</span>
            </span>
            {it.soon && (
              <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-caption text-text-subtle">
                em breve
              </span>
            )}
          </button>
        ))}
      </div>
    </Modal>
  );
}

function EventActionSheet({
  event,
  completing,
  onClose,
  onComplete,
  onEdit,
  onDuplicate,
  onOpenLead,
  onDelete,
}: {
  event: AgendaEventSummary;
  completing: boolean;
  onClose: () => void;
  onComplete: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onOpenLead: () => void;
  onDelete: () => void;
}) {
  const style = TYPE_STYLE[event.type];
  const isTask = event.type === "tarefa";
  const done = CLOSED.has(event.status);
  return (
    <Modal open onClose={onClose} title={event.title}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full ${style.chipBg} px-2.5 py-1 text-caption font-semibold ${style.chipText}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
            {TYPE_LABELS[event.type]}
          </span>
          <span className="text-caption text-text-muted">{STATUS_LABELS[event.status]}</span>
        </div>
        {event.leadName && (
          <p className="text-body-sm text-text-muted">Lead: {event.leadName}</p>
        )}
        {event.location && (
          <p className="text-body-sm text-text-muted">Local: {event.location}</p>
        )}
        {event.description && (
          <p className="text-body-sm text-text-muted">{event.description}</p>
        )}

        <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
          {isTask && !done && (
            <SheetItem label={completing ? "Concluindo..." : "Concluir"} onClick={onComplete} />
          )}
          <SheetItem label="Editar" onClick={onEdit} />
          {isTask ? (
            <SheetItem label="Reagendar" onClick={onEdit} />
          ) : (
            <SheetItem label="Duplicar" onClick={onDuplicate} />
          )}
          {event.leadId && <SheetItem label="Abrir lead" onClick={onOpenLead} />}
          <SheetItem label="Excluir" onClick={onDelete} danger />
        </div>
      </div>
    </Modal>
  );
}

function SheetItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "block w-full px-4 py-3.5 text-left text-body transition-colors hover:bg-surface-sunken " +
        (danger ? "text-[var(--danger-fg)]" : "text-text")
      }
    >
      {label}
    </button>
  );
}

function FiltersModal({
  filters,
  onApply,
  onClear,
  onClose,
}: {
  filters: AgendaListQuery;
  onApply: (f: AgendaListQuery) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<string>(filters.type ?? "");
  const [status, setStatus] = useState<string>(filters.status ?? "");
  const [source, setSource] = useState<string>(filters.source ?? "");
  const [overdue, setOverdue] = useState(Boolean(filters.overdue));
  const [done, setDone] = useState(Boolean(filters.done));

  const typeOptions = [
    { value: "", label: "Todos os tipos" },
    ...(["tarefa", "compromisso", "visita", "bloqueio"] as AgendaEventType[]).map((t) => ({
      value: t,
      label: TYPE_LABELS[t],
    })),
  ];

  return (
    <Modal open onClose={onClose} title="Filtros">
      <div className="flex flex-col gap-4">
        <Select
          label="Tipo"
          value={type}
          onValueChange={setType}
          options={typeOptions}
        />
        <Select
          label="Origem"
          value={source}
          onValueChange={setSource}
          options={[
            { value: "", label: "Todas" },
            { value: "nexlar", label: "Nextlar" },
            { value: "google", label: "Google" },
          ]}
        />
        <Select
          label="Situação"
          value={status}
          onValueChange={setStatus}
          options={[
            { value: "", label: "Todas" },
            ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
          ]}
        />
        <label className="flex items-center gap-3 text-body-sm text-text">
          <input
            type="checkbox"
            checked={overdue}
            onChange={(e) => setOverdue(e.target.checked)}
            className="h-5 w-5 rounded border-border-strong accent-[var(--accent)]"
          />
          Só tarefas atrasadas
        </label>
        <label className="flex items-center gap-3 text-body-sm text-text">
          <input
            type="checkbox"
            checked={done}
            onChange={(e) => setDone(e.target.checked)}
            className="h-5 w-5 rounded border-border-strong accent-[var(--accent)]"
          />
          Mostrar concluídas
        </label>

        <div className="mt-1 flex flex-col gap-2">
          <Button
            type="button"
            variant="accent"
            onClick={() =>
              onApply({
                type: (type || undefined) as AgendaListQuery["type"],
                status: (status || undefined) as AgendaListQuery["status"],
                source: (source || undefined) as AgendaListQuery["source"],
                overdue: overdue || undefined,
                done: done || undefined,
              })
            }
          >
            Aplicar filtros
          </Button>
          <Button type="button" variant="ghost" onClick={onClear}>
            Limpar filtros
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function GoogleModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title="Conecte seu Google Calendar">
      <div className="flex flex-col gap-4">
        <p className="text-body text-text-muted">
          Sincronize visitas e compromissos e evite oferecer horários em que você já está ocupado.
        </p>
        <div className="rounded-xl bg-surface-sunken p-3 text-body-sm text-text-muted">
          A conexão com o Google chega na próxima etapa da agenda. Por enquanto seus eventos vivem
          no Nextlar.
        </div>
        <Button type="button" variant="ghost" onClick={onClose}>
          Entendi
        </Button>
      </div>
    </Modal>
  );
}

function EmptyHint({
  onNewTask,
  onConnectGoogle,
}: {
  onNewTask: () => void;
  onConnectGoogle: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface px-6 py-6 text-center">
      <div>
        <p className="text-body font-semibold text-text">Sua agenda está livre neste período</p>
        <p className="mt-1 text-body-sm text-text-muted">
          Crie uma tarefa, registre um compromisso ou selecione um horário no calendário.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" variant="accent" onClick={onNewTask}>
          Criar tarefa
        </Button>
        <Button type="button" variant="ghost" onClick={onConnectGoogle}>
          Conectar Google Calendar
        </Button>
      </div>
    </div>
  );
}
