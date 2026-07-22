/** Formatadores em português do Brasil. */

const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}

export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}

/** Fração de 0 a 1 em percentual inteiro (ex.: 0.42 -> "42%"). */
export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}
