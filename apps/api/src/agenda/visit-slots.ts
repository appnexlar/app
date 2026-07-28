import type { AvailabilityWindow, PublicVisitDay } from "@nexlar/shared";

/**
 * Cálculo puro dos horários livres para visita.
 *
 * Fuso fixo America/Sao_Paulo (UTC-3, sem horário de verão desde 2019): o
 * produto atende corretor solo no Brasil, e o offset fixo evita a classe
 * inteira de bugs de conversão. Quando houver corretor em outro fuso, este é
 * o único arquivo a aprender timezone de verdade.
 *
 * Um slot entra se: cabe inteiro na janela do dia, respeita a antecedência
 * mínima e não encosta em nenhum intervalo ocupado (agenda + visitas).
 */

const OFFSET = "-03:00";
const DIA_MS = 86_400_000;

export interface BusyInterval {
  start: Date;
  end: Date;
}

export interface SlotConfig {
  windows: AvailabilityWindow[];
  slotDurationMin: number;
  minNoticeHours: number;
  maxAdvanceDays: number;
}

/** "2026-08-01" + "10:00" (horário de São Paulo) -> Date UTC. */
export function spDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00${OFFSET}`);
}

/** A data "YYYY-MM-DD" e o dia da semana de um instante, vistos de São Paulo. */
function spCalendar(instant: Date): { date: string; weekday: number } {
  const deslocado = new Date(instant.getTime() - 3 * 3_600_000);
  return { date: deslocado.toISOString().slice(0, 10), weekday: deslocado.getUTCDay() };
}

const rotuloDia = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "America/Sao_Paulo",
});

export function computeVisitDays(
  config: SlotConfig,
  now: Date,
  busy: BusyInterval[],
): PublicVisitDay[] {
  if (config.windows.length === 0) return [];

  const minStart = new Date(now.getTime() + config.minNoticeHours * 3_600_000);
  const duracaoMs = config.slotDurationMin * 60_000;
  const days: PublicVisitDay[] = [];

  for (let i = 0; i < config.maxAdvanceDays; i++) {
    const instante = new Date(now.getTime() + i * DIA_MS);
    const { date, weekday } = spCalendar(instante);
    const janelas = config.windows.filter((w) => w.weekday === weekday);
    if (janelas.length === 0) continue;

    const slots: string[] = [];
    for (const janela of janelas) {
      const inicioJanela = spDateTime(date, janela.start);
      const fimJanela = spDateTime(date, janela.end);
      for (
        let inicio = inicioJanela.getTime();
        inicio + duracaoMs <= fimJanela.getTime();
        inicio += duracaoMs
      ) {
        const slotInicio = new Date(inicio);
        const slotFim = new Date(inicio + duracaoMs);
        if (slotInicio < minStart) continue;
        const ocupado = busy.some((b) => slotInicio < b.end && slotFim > b.start);
        if (ocupado) continue;
        slots.push(horaSp(slotInicio));
      }
    }
    // Janelas sobrepostas podem repetir horário: deduplica e ordena.
    const unicos = [...new Set(slots)].sort();
    if (unicos.length > 0) {
      days.push({ date, label: rotuloDia.format(spDateTime(date, "12:00")), slots: unicos });
    }
  }
  return days;
}

/** "HH:MM" de um instante, visto de São Paulo. */
export function horaSp(instant: Date): string {
  const deslocado = new Date(instant.getTime() - 3 * 3_600_000);
  return deslocado.toISOString().slice(11, 16);
}
