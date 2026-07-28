import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AvailabilityWindow, UpsertVisitAvailabilityDto, VisitAvailabilityView } from "@nexlar/shared";
import { Button } from "../../components/ui/Button";
import { Banner } from "../../components/ui/Banner";
import { http } from "../../lib/http";

/**
 * Horários de visita: os dias e faixas em que o corretor aceita receber
 * leads. É o que liga o agendamento em um toque na página da seleção; sem
 * nada marcado, a lead só consegue SOLICITAR visita (fallback honesto).
 */

const DIAS: { weekday: number; label: string }[] = [
  { weekday: 1, label: "Seg" },
  { weekday: 2, label: "Ter" },
  { weekday: 3, label: "Qua" },
  { weekday: 4, label: "Qui" },
  { weekday: 5, label: "Sex" },
  { weekday: 6, label: "Sáb" },
  { weekday: 0, label: "Dom" },
];

const DURACOES = [30, 45, 60, 90] as const;

interface DiaConfig {
  ativo: boolean;
  start: string;
  end: string;
}

export function VisitAvailabilitySection() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["visit-availability"],
    queryFn: () => http.get<VisitAvailabilityView>("/agenda/visit-availability"),
  });

  const [dias, setDias] = useState<Record<number, DiaConfig>>({});
  const [duracao, setDuracao] = useState<(typeof DURACOES)[number]>(60);
  const [antecedencia, setAntecedencia] = useState(12);
  const [salvo, setSalvo] = useState(false);

  // Carrega o formulário do que está salvo, uma vez.
  useEffect(() => {
    if (!query.data) return;
    const base: Record<number, DiaConfig> = {};
    for (const d of DIAS) base[d.weekday] = { ativo: false, start: "09:00", end: "18:00" };
    for (const w of query.data.windows) {
      base[w.weekday] = { ativo: true, start: w.start, end: w.end };
    }
    setDias(base);
    setDuracao((query.data.slotDurationMin as (typeof DURACOES)[number]) ?? 60);
    setAntecedencia(query.data.minNoticeHours);
  }, [query.data]);

  const save = useMutation({
    mutationFn: (dto: UpsertVisitAvailabilityDto) =>
      http.put<VisitAvailabilityView>("/agenda/visit-availability", dto),
    onSuccess: (view) => {
      queryClient.setQueryData(["visit-availability"], view);
      setSalvo(true);
      window.setTimeout(() => setSalvo(false), 2500);
    },
  });

  const submit = () => {
    const windows: AvailabilityWindow[] = DIAS.filter((d) => dias[d.weekday]?.ativo).map((d) => ({
      weekday: d.weekday,
      start: dias[d.weekday].start,
      end: dias[d.weekday].end,
    }));
    save.mutate({ windows, slotDurationMin: duracao, minNoticeHours: antecedencia, maxAdvanceDays: 14 });
  };

  if (query.isPending) {
    return <div className="h-40 animate-pulse rounded-2xl bg-surface-sunken" />;
  }
  if (query.isError) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <Banner variant="danger">Não foi possível carregar os horários de visita.</Banner>
      </section>
    );
  }

  const algumAtivo = DIAS.some((d) => dias[d.weekday]?.ativo);

  return (
    <section className="animate-rise rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <h2 className="text-label uppercase tracking-wide text-text-subtle">Horários de visita</h2>
      <p className="mt-1 text-body-sm text-text-muted">
        Nos dias marcados, a lead agenda a visita sozinha pelo link da seleção, só em horário livre
        da sua agenda. Sem dias marcados, ela apenas solicita e você confirma.
      </p>

      {save.isError && (
        <Banner variant="danger">Não foi possível salvar agora. Tente novamente.</Banner>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {DIAS.map((d) => {
          const cfg = dias[d.weekday] ?? { ativo: false, start: "09:00", end: "18:00" };
          return (
            <div key={d.weekday} className="flex min-h-11 items-center gap-3">
              <button
                type="button"
                aria-pressed={cfg.ativo}
                onClick={() => setDias({ ...dias, [d.weekday]: { ...cfg, ativo: !cfg.ativo } })}
                className={`w-14 shrink-0 rounded-lg px-2 py-1.5 text-body-sm font-semibold transition-colors duration-fast ${
                  cfg.ativo ? "bg-primary text-primary-on" : "bg-surface-sunken text-text-subtle"
                }`}
              >
                {d.label}
              </button>
              {cfg.ativo ? (
                <div className="flex items-center gap-2 text-body-sm text-text">
                  <input
                    type="time"
                    value={cfg.start}
                    aria-label={`Início ${d.label}`}
                    onChange={(e) => setDias({ ...dias, [d.weekday]: { ...cfg, start: e.target.value } })}
                    className="rounded-lg border border-border bg-surface px-2 py-1.5 tabular-nums focus:border-accent focus:outline-none"
                  />
                  até
                  <input
                    type="time"
                    value={cfg.end}
                    aria-label={`Fim ${d.label}`}
                    onChange={(e) => setDias({ ...dias, [d.weekday]: { ...cfg, end: e.target.value } })}
                    className="rounded-lg border border-border bg-surface px-2 py-1.5 tabular-nums focus:border-accent focus:outline-none"
                  />
                </div>
              ) : (
                <span className="text-body-sm text-text-subtle">Sem visitas</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
        <div>
          <span className="text-label text-text">Duração da visita</span>
          <div className="mt-1.5 grid grid-cols-4 gap-1 rounded-xl bg-surface-sunken p-1">
            {DURACOES.map((min) => (
              <button
                key={min}
                type="button"
                aria-pressed={duracao === min}
                onClick={() => setDuracao(min)}
                className={`rounded-lg px-2 py-1.5 text-caption font-semibold transition-colors duration-fast ${
                  duracao === min ? "bg-surface text-text shadow-sm" : "text-text-subtle"
                }`}
              >
                {min} min
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="text-label text-text">Antecedência mínima</span>
          <div className="mt-1.5 grid grid-cols-4 gap-1 rounded-xl bg-surface-sunken p-1">
            {[2, 6, 12, 24].map((h) => (
              <button
                key={h}
                type="button"
                aria-pressed={antecedencia === h}
                onClick={() => setAntecedencia(h)}
                className={`rounded-lg px-2 py-1.5 text-caption font-semibold transition-colors duration-fast ${
                  antecedencia === h ? "bg-surface text-text shadow-sm" : "text-text-subtle"
                }`}
              >
                {h} h
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-caption text-text-subtle">
          {algumAtivo
            ? "A lead verá só horários realmente livres da sua agenda."
            : "Nenhum dia marcado: a lead poderá apenas solicitar visita."}
        </p>
        <Button type="button" loading={save.isPending} onClick={submit}>
          {salvo ? "Salvo!" : "Salvar horários"}
        </Button>
      </div>
    </section>
  );
}
