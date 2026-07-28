import type {
  LeadPreferenceView,
  SelectionCompatibility,
  SelectionStatus,
} from "@nexlar/shared";

/** Rótulos e tons da seleção personalizada. Estado sempre em texto, não só cor. */

export const SELECTION_STATUS_LABELS: Record<SelectionStatus, string> = {
  rascunho: "Rascunho",
  ativa: "Ativa",
  expirada: "Expirada",
  revogada: "Revogada",
  arquivada: "Arquivada",
};

export const SELECTION_STATUS_TONE_CLASS: Record<SelectionStatus, string> = {
  rascunho: "bg-surface-sunken text-text-subtle",
  ativa: "bg-[var(--success-soft)] text-[var(--success-fg)]",
  expirada: "bg-[var(--danger-soft)] text-[var(--danger-fg)]",
  revogada: "bg-[var(--danger-soft)] text-[var(--danger-fg)]",
  arquivada: "bg-surface-sunken text-text-subtle",
};

export const COMPATIBILITY_LABELS: Record<SelectionCompatibility, string> = {
  alta: "Alta compatibilidade",
  media: "Compatibilidade média",
  baixa: "Compatibilidade baixa",
  fora_do_perfil: "Fora do perfil",
};

export const COMPATIBILITY_TONE_CLASS: Record<SelectionCompatibility, string> = {
  alta: "bg-[var(--success-soft)] text-[var(--success-fg)]",
  media: "bg-accent-soft text-accent",
  baixa: "bg-surface-sunken text-text-subtle",
  fora_do_perfil: "bg-[var(--danger-soft)] text-[var(--danger-fg)]",
};

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const PURPOSE_LABELS: Record<string, string> = {
  venda: "Compra",
  locacao: "Locação",
  venda_locacao: "Compra ou locação",
  temporada: "Temporada",
};

/**
 * Preferências resumidas em pílulas curtas ("Compra", "Até R$ 500 mil",
 * "Moema", "2+ quartos"). É o que o corretor lê de relance antes de escolher.
 */
export function preferencePills(pref: LeadPreferenceView | null): string[] {
  if (!pref) return [];
  const pills: string[] = [];
  if (pref.purpose) pills.push(PURPOSE_LABELS[pref.purpose] ?? pref.purpose);
  if (pref.types.length > 0) pills.push(pref.types.join(", "));
  if (pref.priceMax != null) pills.push(`Até ${BRL.format(pref.priceMax)}`);
  else if (pref.priceMin != null) pills.push(`A partir de ${BRL.format(pref.priceMin)}`);
  if (pref.cities.length > 0) pills.push(pref.cities.join(", "));
  if (pref.neighborhoods.length > 0) pills.push(pref.neighborhoods.join(", "));
  if (pref.bedroomsMin != null) pills.push(`${pref.bedroomsMin}+ quartos`);
  if (pref.bathroomsMin != null) pills.push(`${pref.bathroomsMin}+ banheiros`);
  if (pref.parkingMin != null) pills.push(`${pref.parkingMin}+ vagas`);
  if (pref.areaMin != null || pref.areaMax != null) {
    const faixa = [pref.areaMin != null ? `${pref.areaMin}` : null, pref.areaMax != null ? `${pref.areaMax}` : null]
      .filter(Boolean)
      .join(" a ");
    pills.push(`${faixa} m²`);
  }
  if (pref.furnished === true) pills.push("Mobiliado");
  if (pref.features.length > 0) pills.push(pref.features.join(", "));
  return pills;
}

/** O perfil tem o mínimo para a pesquisa ajudar? (faixa de preço OU lugar) */
export function preferencesUseful(pref: LeadPreferenceView | null): boolean {
  if (!pref) return false;
  return (
    pref.priceMax != null ||
    pref.priceMin != null ||
    pref.cities.length > 0 ||
    pref.neighborhoods.length > 0 ||
    pref.bedroomsMin != null ||
    pref.types.length > 0
  );
}
