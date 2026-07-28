import { SELECTION_RESPONSES, type LeadShareSummary, type SelectionResponse, type SelectionStatus } from "@nexlar/shared";

/** Estado do link do compartilhamento (sempre mostrado por texto, não só cor). */
export const SHARE_STATUS_LABELS: Record<SelectionStatus, string> = {
  rascunho: "Rascunho",
  ativa: "Ativo",
  expirada: "Expirado",
  revogada: "Revogado",
  arquivada: "Arquivado",
};

/** Resposta da lead sobre o imóvel. */
export const SHARE_RESPONSE_LABELS: Record<SelectionResponse, string> = {
  nao_visualizado: "Não visualizado",
  visualizado: "Visualizado",
  tenho_interesse: "Tenho interesse",
  talvez: "Talvez",
  sem_interesse: "Não tenho interesse",
  quero_visitar: "Quero visitar",
};

/** Tom visual (usa os tokens do design). */
export const SHARE_RESPONSE_TONE: Record<SelectionResponse, "neutral" | "accent" | "success" | "danger"> = {
  nao_visualizado: "neutral",
  visualizado: "neutral",
  tenho_interesse: "success",
  talvez: "accent",
  sem_interesse: "danger",
  quero_visitar: "success",
};

/** Opções do menu "Registrar resposta manualmente" (sem "não visualizado"). */
export const RESPONSE_OPTIONS = SELECTION_RESPONSES.filter((r) => r !== "nao_visualizado");

/** O imóvel deste envio saiu de oferta (vendido, alugado ou indisponível)? */
export function sharePropertyUnavailable(share: LeadShareSummary): boolean {
  return (
    share.propertyStatus === "vendido" ||
    share.propertyStatus === "alugado" ||
    share.propertyStatus === "arquivado" ||
    share.propertyStatus === "temporariamente_indisponivel" ||
    share.propertyStatus === "rascunho"
  );
}

/**
 * Estado único do envio, combinando imóvel + link + resposta + visita, sempre
 * em texto. Prioridade: imóvel indisponível > revogado/expirado > visita >
 * resposta > estado do link.
 */
export function shareDisplayStatus(share: LeadShareSummary): {
  label: string;
  tone: "neutral" | "accent" | "success" | "danger";
} {
  if (share.propertyStatus === "vendido") return { label: "Imóvel vendido", tone: "neutral" };
  if (share.propertyStatus === "alugado") return { label: "Imóvel alugado", tone: "neutral" };
  if (
    share.propertyStatus === "arquivado" ||
    share.propertyStatus === "temporariamente_indisponivel" ||
    share.propertyStatus === "rascunho"
  ) {
    return { label: "Imóvel indisponível", tone: "neutral" };
  }
  if (share.status === "revogada") return { label: "Link revogado", tone: "danger" };
  if (share.status === "expirada") return { label: "Link expirado", tone: "danger" };
  if (share.status === "arquivada") return { label: "Arquivado", tone: "neutral" };
  if (share.status === "rascunho") return { label: "Rascunho, não enviado", tone: "neutral" };
  if (share.visitRequestedAt) return { label: "Visita solicitada", tone: "success" };
  if (share.response !== "nao_visualizado") {
    return { label: SHARE_RESPONSE_LABELS[share.response], tone: SHARE_RESPONSE_TONE[share.response] };
  }
  // Visualização não é mais estado do link: sai de viewCount.
  if (share.viewCount > 0) return { label: "Visualizado", tone: "neutral" };
  return { label: "Enviado, não visualizado", tone: "neutral" };
}
