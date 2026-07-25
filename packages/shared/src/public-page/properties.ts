/**
 * Imóveis na vitrine pública: visibilidade, elegibilidade e destaques.
 *
 * A elegibilidade é decidida numa regra só, no backend (§11 da épica). O front
 * nunca recalcula; ele desenha o veredito e os motivos que vêm daqui.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Visibilidade
// ---------------------------------------------------------------------------

/**
 * Cadastrar não publica. O imóvel nasce `privado`; `publico` aparece na
 * vitrine; `oculto` é o que já esteve no ar e saiu, sem perder nada.
 */
export const PROPERTY_PUBLIC_VISIBILITIES = ["privado", "publico", "oculto"] as const;
export type PropertyPublicVisibility = (typeof PROPERTY_PUBLIC_VISIBILITIES)[number];

export const changeVisibilitySchema = z.object({
  visibility: z.enum(PROPERTY_PUBLIC_VISIBILITIES),
});
export type ChangeVisibilityDto = z.infer<typeof changeVisibilitySchema>;

// ---------------------------------------------------------------------------
// Elegibilidade
// ---------------------------------------------------------------------------

/**
 * Por que um imóvel não pode ir para a vitrine. Códigos estáveis: a tela
 * traduz e leva o corretor até onde se resolve.
 */
export type PropertyIneligibilityCode =
  | "rascunho"
  | "arquivado"
  | "vendido"
  | "alugado"
  | "indisponivel"
  | "sem_foto"
  | "sem_localizacao"
  | "sem_tipo";

export interface PropertyIneligibilityReason {
  code: PropertyIneligibilityCode;
  message: string;
  /** Onde o corretor resolve a pendência. */
  actionUrl?: string;
}

export interface PropertyPublicationEligibility {
  eligible: boolean;
  reasons: PropertyIneligibilityReason[];
}

// ---------------------------------------------------------------------------
// O imóvel como o gerenciador o vê
// ---------------------------------------------------------------------------

/** Linha do gerenciador de imóveis públicos, dentro de Minha Página. */
export interface ManagedProperty {
  id: string;
  code: number;
  title: string;
  purpose: "venda" | "locacao" | "venda_locacao" | "temporada";
  type: string;
  status: string;
  city: string | null;
  neighborhood: string | null;
  /** Preço já formatado para exibição, ou "Sob consulta". */
  priceLabel: string;
  coverUrl: string | null;
  visibility: PropertyPublicVisibility;
  /** 1 a 6 quando é destaque; nulo quando não é. */
  highlightOrder: number | null;
  eligibility: PropertyPublicationEligibility;
}

export interface ManagedPropertiesSummary {
  /** Publicados e elegíveis: o que a vitrine mostra hoje. */
  publicados: number;
  /** Prontos para publicar, mas ainda privados ou ocultos. */
  prontos: number;
  /** Com pendência que impede a publicação. */
  comPendencia: number;
  destaques: number;
  maxDestaques: number;
}

export interface ManagedPropertiesResponse {
  items: ManagedProperty[];
  summary: ManagedPropertiesSummary;
}

// ---------------------------------------------------------------------------
// Destaques
// ---------------------------------------------------------------------------

/** Até seis. Mais que isso deixa de ser destaque e vira listagem. */
export const MAX_HIGHLIGHTS = 6;

/**
 * A ordem é a própria lista: posição 1 é o primeiro destaque. Mandar a lista
 * inteira (em vez de mexer item a item) evita estado meio-arrumado no banco.
 */
export const setHighlightsSchema = z.object({
  propertyIds: z.array(z.string().uuid()).max(MAX_HIGHLIGHTS),
});
export type SetHighlightsDto = z.infer<typeof setHighlightsSchema>;
