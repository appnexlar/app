import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiError } from "../../lib/http";
import { bookPublicVisit, fetchPublicVisitSlots, sendPublicVisitRequest } from "./publicApi";

/**
 * Folha de agendamento da lead. Dois caminhos, um só componente:
 * - agenda configurada: dias e horários REAIS, escolha em dois toques;
 * - sem configuração: solicitação honesta ("o corretor confirma o horário").
 * Nunca mostramos horário inventado.
 */

const WHATSAPP = "#25D366";

export function VisitBookingSheet({
  token,
  itemId,
  propertyTitle,
  onClose,
  onDone,
}: {
  token: string;
  itemId: string;
  propertyTitle: string;
  onClose: () => void;
  /** Chamada após agendar ou solicitar, para a página recarregar o estado. */
  onDone: (message: string) => void;
}) {
  const [dia, setDia] = useState<string | null>(null);
  const [hora, setHora] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const slots = useQuery({
    queryKey: ["selecao-publica", token, "slots", itemId],
    queryFn: () => fetchPublicVisitSlots(token, itemId),
    staleTime: 15_000,
  });

  const agendar = useMutation({
    mutationFn: (escolha: { date: string; time: string }) => bookPublicVisit(token, itemId, escolha),
    onSuccess: (visita) => onDone(`Visita confirmada para ${visita.scheduledAtLabel}!`),
    onError: (e) => {
      setErro(e instanceof ApiError ? e.message : "Não foi possível agendar. Tente novamente.");
      setHora(null);
      void slots.refetch();
    },
  });
  const solicitar = useMutation({
    mutationFn: () => sendPublicVisitRequest(token, itemId),
    onSuccess: () => onDone("Visita solicitada! O corretor entra em contato para combinar o horário."),
  });

  const dados = slots.data;
  const diaAtivo = dados?.days.find((d) => d.date === dia) ?? dados?.days[0] ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Agendar visita"
        className="animate-rise relative flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-2xl bg-surface p-5 shadow-lg sm:rounded-2xl"
      >
        <h2 className="text-h3 text-text">Agendar visita</h2>
        <p className="mt-0.5 truncate text-body-sm text-text-muted">{propertyTitle}</p>

        {erro && (
          <p className="mt-3 rounded-xl bg-[var(--danger-soft)] px-3 py-2 text-body-sm font-semibold text-[var(--danger-fg)]">
            {erro}
          </p>
        )}

        {slots.isPending ? (
          <div className="mt-4 flex flex-col gap-3" aria-busy="true">
            <div className="h-10 animate-pulse rounded-xl bg-surface-sunken" />
            <div className="h-24 animate-pulse rounded-xl bg-surface-sunken" />
          </div>
        ) : slots.isError ? (
          <p className="mt-4 text-body-sm text-text-muted">
            Não foi possível carregar os horários.{" "}
            <button type="button" className="font-semibold text-accent" onClick={() => slots.refetch()}>
              Tentar novamente
            </button>
          </p>
        ) : !dados?.configured || dados.days.length === 0 ? (
          // Fallback honesto: sem janelas (ou tudo ocupado), solicita e pronto.
          <div className="mt-4">
            <p className="text-body-sm text-text-muted">
              {dados?.configured
                ? "Os próximos horários estão ocupados. Solicite a visita e o corretor encontra um encaixe com você."
                : "Solicite a visita e o corretor entrará em contato para confirmar o melhor horário."}
            </p>
            <button
              type="button"
              disabled={solicitar.isPending}
              onClick={() => solicitar.mutate()}
              className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl text-body font-bold text-white"
              style={{ backgroundColor: WHATSAPP }}
            >
              {solicitar.isPending ? "Enviando..." : "Solicitar visita"}
            </button>
          </div>
        ) : (
          <>
            {/* Dias com horário livre, roláveis na horizontal. */}
            <div className="scrollbar-none -mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1">
              {dados.days.map((d) => {
                const ativo = d.date === (diaAtivo?.date ?? null);
                return (
                  <button
                    key={d.date}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => {
                      setDia(d.date);
                      setHora(null);
                    }}
                    className={`shrink-0 rounded-xl border px-3.5 py-2 text-body-sm font-semibold transition-colors duration-fast ${
                      ativo ? "border-primary bg-primary text-primary-on" : "border-border bg-surface text-text"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>

            {/* Horários do dia escolhido. */}
            <div className="mt-3 grid max-h-56 grid-cols-3 gap-2 overflow-y-auto">
              {(diaAtivo?.slots ?? []).map((h) => (
                <button
                  key={h}
                  type="button"
                  aria-pressed={hora === h}
                  onClick={() => setHora(h)}
                  className={`min-h-11 rounded-xl border text-body-sm font-bold tabular-nums transition-colors duration-fast ${
                    hora === h ? "border-accent bg-accent text-accent-on" : "border-border bg-surface text-text"
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>

            <p className="mt-3 text-caption text-text-subtle">
              Visita de {dados.durationMin} minutos, no horário de Brasília.
            </p>

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="min-h-12 flex-1 rounded-xl bg-surface-sunken text-body-sm font-bold text-text"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!diaAtivo || !hora || agendar.isPending}
                onClick={() => {
                  if (diaAtivo && hora) agendar.mutate({ date: diaAtivo.date, time: hora });
                }}
                className="min-h-12 flex-1 rounded-xl text-body-sm font-bold text-white disabled:opacity-50"
                style={{ backgroundColor: WHATSAPP }}
              >
                {agendar.isPending ? "Agendando..." : "Confirmar visita"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
