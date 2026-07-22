import { z } from "zod";
import type { AddressDisplayMode, PropertyPurpose, PropertyStatus } from "../properties/dto";

/**
 * Compartilhamento de imóvel com uma lead. Modelo unificado: um envio é uma
 * property_selection e cada imóvel é um selection_item. Enviar um único imóvel
 * é uma seleção com um item (ver docs/02 2.13).
 */

export const SELECTION_STATUSES = ["criada", "enviada", "visualizada", "revogada", "expirada"] as const;
export type SelectionStatus = (typeof SELECTION_STATUSES)[number];

export const SELECTION_RESPONSES = [
  "nao_visualizado",
  "visualizado",
  "tenho_interesse",
  "talvez",
  "sem_interesse",
  "quero_visitar",
] as const;
export type SelectionResponse = (typeof SELECTION_RESPONSES)[number];

/** Corpo do envio: escolhe a lead e, opcionalmente, uma mensagem personalizada. */
export const createShareSchema = z.object({
  leadId: z.string().uuid("Selecione uma lead"),
  message: z.string().trim().max(1000).optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
});
export type CreateShareDto = z.infer<typeof createShareSchema>;

/** Registrar manualmente a resposta da lead sobre um imóvel enviado. */
export const setResponseSchema = z.object({ response: z.enum(SELECTION_RESPONSES) });
export type SetResponseDto = z.infer<typeof setResponseSchema>;

/** Marcar/desmarcar um imóvel como prioritário para a lead. */
export const setPrioritySchema = z.object({ isPriority: z.boolean() });
export type SetPriorityDto = z.infer<typeof setPrioritySchema>;

/** Um envio deste imóvel para uma lead (linha de "Leads que receberam"). */
export interface PropertyShareSummary {
  id: string;
  leadId: string;
  leadName: string;
  leadWhatsapp: string;
  publicToken: string;
  status: SelectionStatus;
  response: SelectionResponse;
  message: string | null;
  viewCount: number;
  resendCount: number;
  createdAt: string;
  sentAt: string | null;
  viewedAt: string | null;
  lastAccessAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
}

/** Um imóvel enviado para a lead (seção "Imóveis enviados" da ficha da lead). */
export interface LeadShareSummary {
  /** id do compartilhamento (property_selection). */
  id: string;
  publicToken: string;
  propertyId: string;
  propertyCode: number;
  propertyTitle: string;
  propertyType: string;
  city: string | null;
  neighborhood: string | null;
  coverUrl: string | null;
  price: number | null;
  priceLabel: string;
  status: SelectionStatus;
  response: SelectionResponse;
  isPriority: boolean;
  visitRequestedAt: string | null;
  viewCount: number;
  message: string | null;
  createdAt: string;
  sentAt: string | null;
  /** Status atual do imóvel: o corretor vê na ficha da lead se ele foi vendido/ficou indisponível. */
  propertyStatus: PropertyStatus;
}

/**
 * Motivo de o link não mostrar mais o imóvel. "revogado"/"expirado" são do
 * link; "vendido"/"alugado"/"indisponivel" refletem o status atual do imóvel.
 */
export type ShareUnavailableReason = "revogado" | "expirado" | "vendido" | "alugado" | "indisponivel";

/** Página pública do imóvel compartilhado: só dados autorizados. */
export interface PublicSharedProperty {
  available: boolean;
  unavailableReason: ShareUnavailableReason | null;
  /** Título do imóvel para a página de indisponível conseguir nomeá-lo. */
  propertyTitle: string | null;
  property: {
    title: string;
    purpose: PropertyPurpose;
    type: string;
    price: number | null;
    priceLabel: string;
    locationLine: string | null;
    addressDisplay: AddressDisplayMode;
    description: string | null;
    features: string[];
    photos: { url: string; caption: string | null }[];
  } | null;
  broker: { name: string; whatsapp: string | null; agencyName: string | null } | null;
}
