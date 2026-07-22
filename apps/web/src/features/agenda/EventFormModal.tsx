import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AgendaEventSummary, CreateAgendaEventDto, UpdateAgendaEventDto } from "@nexlar/shared";
import { TASK_KINDS } from "@nexlar/shared";
import { Banner } from "../../components/ui/Banner";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { TextField } from "../../components/ui/TextField";
import { ApiError } from "../../lib/http";
import { fetchLeads } from "../leads/api";
import { conflictsFrom, createAgendaEvent, updateAgendaEvent } from "./api";
import { TASK_KIND_LABELS, formatDateTime, toDateInput, toIso, toTimeInput } from "./labels";

type FormType = "tarefa" | "compromisso";

interface Prefill {
  title?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
}

interface Props {
  type: FormType;
  event?: AgendaEventSummary | null;
  prefill?: Prefill;
  /** Trava a lead vinculada (ex.: criar tarefa a partir da ficha do cliente). */
  lockedLead?: { id: string; fullName: string };
  onClose: () => void;
}

const REMINDER_OPTIONS = [
  { value: "", label: "Sem lembrete" },
  { value: "0", label: "Na hora" },
  { value: "15", label: "15 minutos antes" },
  { value: "30", label: "30 minutos antes" },
  { value: "60", label: "1 hora antes" },
  { value: "1440", label: "1 dia antes" },
];

/** Data/hora de hoje arredondada para a próxima hora cheia, como padrão. */
function defaultDateTime(): { date: string; time: string } {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  return { date: toDateInput(now.toISOString()), time: toTimeInput(now.toISOString()) };
}

export function EventFormModal({ type, event, prefill, lockedLead, onClose }: Props) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(event);
  const fallback = defaultDateTime();

  const [title, setTitle] = useState(event?.title ?? prefill?.title ?? "");
  const [taskKind, setTaskKind] = useState<string>(event?.taskKind ?? "");
  const [leadId, setLeadId] = useState<string>(event?.leadId ?? lockedLead?.id ?? "");
  const [date, setDate] = useState(
    event ? toDateInput(event.startAt) : (prefill?.date ?? fallback.date),
  );
  const [allDay, setAllDay] = useState(
    event ? event.allDay : type === "tarefa" ? (prefill?.allDay ?? true) : false,
  );
  const [startTime, setStartTime] = useState(
    event && !event.allDay ? toTimeInput(event.startAt) : (prefill?.startTime ?? fallback.time),
  );
  const [endTime, setEndTime] = useState(
    event?.endAt
      ? toTimeInput(event.endAt)
      : (prefill?.endTime ?? toTimeInput(new Date(`${fallback.date}T${fallback.time}:00`).toISOString())),
  );
  const [location, setLocation] = useState(event?.location ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [reminder, setReminder] = useState<string>(
    event?.reminderMinutes != null ? String(event.reminderMinutes) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<AgendaEventSummary[] | null>(null);

  const leadsQuery = useQuery({
    queryKey: ["leads"],
    queryFn: fetchLeads,
    enabled: type === "tarefa" && !lockedLead,
  });

  const leadOptions = useMemo(
    () => [
      { value: "", label: "Sem lead vinculada" },
      ...(leadsQuery.data ?? []).map((l) => ({ value: l.id, label: l.fullName })),
    ],
    [leadsQuery.data],
  );

  const mutation = useMutation({
    mutationFn: (force: boolean) => {
      if (isEdit && event) {
        const dto: UpdateAgendaEventDto = buildUpdate(force);
        return updateAgendaEvent(event.id, dto);
      }
      const dto: CreateAgendaEventDto = buildCreate(force);
      return createAgendaEvent(dto);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-summary"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["client"] });
      onClose();
    },
    onError: (err) => {
      const conflict = conflictsFrom(err);
      if (conflict) {
        setConflicts(conflict);
        return;
      }
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar. Tente novamente.");
    },
  });

  function buildCreate(force: boolean): CreateAgendaEventDto {
    if (type === "tarefa") {
      return {
        type: "tarefa",
        title: title.trim(),
        taskKind: taskKind ? (taskKind as CreateAgendaEventDto["taskKind"]) : undefined,
        leadId: leadId || undefined,
        startAt: toIso(date, allDay ? undefined : startTime),
        allDay,
        description: description.trim() || undefined,
        reminderMinutes: reminder ? Number(reminder) : undefined,
        force,
      };
    }
    return {
      type: "compromisso",
      title: title.trim(),
      startAt: toIso(date, startTime),
      endAt: toIso(date, endTime),
      allDay: false,
      location: location.trim() || undefined,
      description: description.trim() || undefined,
      reminderMinutes: reminder ? Number(reminder) : undefined,
      force,
    };
  }

  function buildUpdate(force: boolean): UpdateAgendaEventDto {
    if (type === "tarefa") {
      return {
        title: title.trim(),
        taskKind: taskKind ? (taskKind as UpdateAgendaEventDto["taskKind"]) : null,
        leadId: leadId || null,
        startAt: toIso(date, allDay ? undefined : startTime),
        allDay,
        endAt: allDay ? null : undefined,
        description: description.trim() || undefined,
        reminderMinutes: reminder ? Number(reminder) : null,
        force,
      };
    }
    return {
      title: title.trim(),
      startAt: toIso(date, startTime),
      endAt: toIso(date, endTime),
      allDay: false,
      location: location.trim() || undefined,
      description: description.trim() || undefined,
      reminderMinutes: reminder ? Number(reminder) : null,
      force,
    };
  }

  function validate(): string | null {
    if (!title.trim()) return "Informe o título.";
    if (!date) return "Informe a data.";
    if (type === "compromisso") {
      if (!startTime || !endTime) return "Informe o horário inicial e final.";
      if (endTime <= startTime) return "O horário final precisa ser depois do inicial.";
    }
    if (type === "tarefa" && !allDay && !startTime) return "Informe o horário ou marque dia inteiro.";
    return null;
  }

  function submit(force: boolean) {
    setError(null);
    setConflicts(null);
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    mutation.mutate(force);
  }

  const heading = isEdit
    ? type === "tarefa"
      ? "Editar tarefa"
      : "Editar compromisso"
    : type === "tarefa"
      ? "Nova tarefa"
      : "Novo compromisso";

  return (
    <Modal open onClose={onClose} title={heading}>
      <form
        className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1"
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
      >
        {error && <Banner variant="danger">{error}</Banner>}

        {conflicts && (
          <div className="flex flex-col gap-2 rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] p-3">
            <p className="text-body-sm font-semibold text-[var(--danger-fg)]">
              Este horário parece estar ocupado
            </p>
            <ul className="flex flex-col gap-1 text-caption text-text-muted">
              {conflicts.map((c) => (
                <li key={c.id}>
                  {c.title} · {formatDateTime(c.startAt)}
                </li>
              ))}
            </ul>
            <p className="text-caption text-text-muted">
              Escolha outro horário ou confirme que deseja continuar.
            </p>
          </div>
        )}

        <TextField
          label="Título"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={type === "tarefa" ? "Ex.: Retornar contato" : "Ex.: Reunião com parceiro"}
          autoFocus
        />

        {type === "tarefa" && (
          <>
            <Select
              label="Tipo de tarefa"
              value={taskKind}
              onChange={(e) => setTaskKind(e.target.value)}
              placeholder="Selecione (opcional)"
              options={TASK_KINDS.map((k) => ({ value: k, label: TASK_KIND_LABELS[k] }))}
            />
            {lockedLead ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-label text-text">Lead vinculada</span>
                <div className="flex min-h-[var(--tap-target-min)] items-center rounded-md border border-border bg-surface-sunken px-3.5 text-body text-text">
                  {lockedLead.fullName}
                </div>
              </div>
            ) : (
              <Select
                label="Lead vinculada"
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
                options={leadOptions}
              />
            )}
          </>
        )}

        <TextField
          label="Data"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        {type === "tarefa" && (
          <Checkbox
            label="Dia inteiro (sem horário)"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
          />
        )}

        {(type === "compromisso" || !allDay) && (
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label={type === "compromisso" ? "Início" : "Horário"}
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
            {type === "compromisso" && (
              <TextField
                label="Fim"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            )}
          </div>
        )}

        {type === "compromisso" && (
          <TextField
            label="Local"
            optionalLabel="opcional"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Ex.: Escritório, endereço"
          />
        )}

        <TextField
          label="Observação"
          optionalLabel="opcional"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <Select
          label="Lembrete"
          value={reminder}
          onChange={(e) => setReminder(e.target.value)}
          options={REMINDER_OPTIONS}
        />

        <div className="flex items-start gap-2 rounded-xl bg-surface-sunken p-3">
          <Checkbox label="Sincronizar com Google Calendar" checked={false} disabled onChange={() => {}} />
          <span className="mt-0.5 text-caption text-text-subtle">em breve</span>
        </div>

        <div className="mt-1 flex flex-col gap-2">
          {conflicts ? (
            <Button
              type="button"
              variant="danger"
              loading={mutation.isPending}
              onClick={() => submit(true)}
            >
              Salvar mesmo assim
            </Button>
          ) : (
            <Button type="submit" variant="accent" loading={mutation.isPending}>
              {isEdit ? "Salvar alterações" : "Salvar"}
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
