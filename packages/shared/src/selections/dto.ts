import { z } from "zod";
import type { PropertyPurpose, PropertyStatus } from "../properties/dto";
import { PROPERTY_PURPOSES } from "../properties/dto";
import type { PublicPropertyDetail } from "../public-page/public-view";
import {
  type SelectionCompatibility,
  type SelectionExpiryDays,
  type SelectionItemOrigin,
  type SelectionResponse,
  type SelectionStatus,
} from "../sharing/dto";

/**
 * Seleção personalizada de imóveis (épica Seleção Personalizada). A seleção é
 * a curadoria do corretor para UMA lead: nasce rascunho, é montada, ativada
 * com prazo e enviada como link exclusivo. O modelo é o mesmo do envio rápido
 * (property_selection); aqui estão os DTOs do fluxo completo.
 */

/** Máximo de imóveis com destaque numa seleção. */
export const SELECTION_MAX_HIGHLIGHTS = 3;

// ---------------------------------------------------------------------------
// Preferências da lead
// ---------------------------------------------------------------------------

const listaCurta = z.array(z.string().trim().min(1).max(80)).max(20);

/**
 * Preferências estruturadas da lead. Tudo opcional: o fluxo nunca bloqueia
 * por perfil incompleto, só orienta. Salvar substitui o conjunto inteiro.
 */
export const upsertLeadPreferenceSchema = z
  .object({
    purpose: z.enum(PROPERTY_PURPOSES).nullish(),
    types: listaCurta.optional(),
    cities: listaCurta.optional(),
    neighborhoods: listaCurta.optional(),
    priceMin: z.number().nonnegative().max(999_999_999).nullish(),
    priceMax: z.number().nonnegative().max(999_999_999).nullish(),
    bedroomsMin: z.number().int().min(0).max(20).nullish(),
    bathroomsMin: z.number().int().min(0).max(20).nullish(),
    parkingMin: z.number().int().min(0).max(20).nullish(),
    areaMin: z.number().int().min(0).max(1_000_000).nullish(),
    areaMax: z.number().int().min(0).max(1_000_000).nullish(),
    furnished: z.boolean().nullish(),
    features: listaCurta.optional(),
    restrictions: z.string().trim().max(1000).nullish(),
    notes: z.string().trim().max(1000).nullish(),
  })
  .refine((v) => v.priceMin == null || v.priceMax == null || v.priceMin <= v.priceMax, {
    message: "O preço mínimo não pode ser maior que o máximo",
    path: ["priceMax"],
  })
  .refine((v) => v.areaMin == null || v.areaMax == null || v.areaMin <= v.areaMax, {
    message: "A metragem mínima não pode ser maior que a máxima",
    path: ["areaMax"],
  });
export type UpsertLeadPreferenceDto = z.infer<typeof upsertLeadPreferenceSchema>;

/** Preferências como a API devolve. */
export interface LeadPreferenceView {
  purpose: PropertyPurpose | null;
  types: string[];
  cities: string[];
  neighborhoods: string[];
  priceMin: number | null;
  priceMax: number | null;
  bedroomsMin: number | null;
  bathroomsMin: number | null;
  parkingMin: number | null;
  areaMin: number | null;
  areaMax: number | null;
  furnished: boolean | null;
  features: string[];
  restrictions: string | null;
  notes: string | null;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Seleção: criação, edição e itens
// ---------------------------------------------------------------------------

/** Cria a seleção em rascunho para uma lead. */
export const createSelectionSchema = z.object({
  leadId: z.string().uuid("Selecione uma lead"),
  /**
   * Fluxo que nasce na carteira: o corretor marca imóveis em /imoveis e envia
   * para uma lead. A seleção nasce rascunho já com esses itens, na ordem em
   * que foram marcados, e cai no montador. Máximo defensivo de 30.
   */
  propertyIds: z.array(z.string().uuid()).max(30, "Máximo de 30 imóveis por seleção").optional(),
});
export type CreateSelectionDto = z.infer<typeof createSelectionSchema>;

/** Edita mensagem e prazo do rascunho. Editar nunca renova prazo de ativa. */
export const updateSelectionSchema = z.object({
  message: z.string().trim().max(1000).nullish(),
  expiresInDays: z
    .union([z.literal(7), z.literal(15), z.literal(30)])
    .nullish(),
});
export type UpdateSelectionDto = z.infer<typeof updateSelectionSchema>;

/** Adiciona um imóvel à seleção. */
export const addSelectionItemSchema = z.object({
  propertyId: z.string().uuid(),
  origin: z.enum(["preferencia", "manual"]).optional(),
});
export type AddSelectionItemDto = z.infer<typeof addSelectionItemSchema>;

/** Ajusta um item: posição, destaque e observação do corretor. */
export const updateSelectionItemSchema = z.object({
  position: z.number().int().min(0).max(500).optional(),
  highlight: z.boolean().optional(),
  brokerNote: z.string().trim().max(500).nullish(),
});
export type UpdateSelectionItemDto = z.infer<typeof updateSelectionItemSchema>;

/** Reordena todos os itens de uma vez (ids na ordem final). */
export const reorderSelectionItemsSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(500),
});
export type ReorderSelectionItemsDto = z.infer<typeof reorderSelectionItemsSchema>;

// ---------------------------------------------------------------------------
// Pesquisa de candidatos
// ---------------------------------------------------------------------------

/** Filtros da pesquisa de imóveis para a seleção. Todos opcionais. */
export const selectionCandidatesQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  purpose: z.enum(PROPERTY_PURPOSES).optional(),
  city: z.string().trim().max(80).optional(),
  neighborhood: z.string().trim().max(80).optional(),
  type: z.string().trim().max(80).optional(),
  priceMin: z.coerce.number().nonnegative().optional(),
  priceMax: z.coerce.number().nonnegative().optional(),
  bedroomsMin: z.coerce.number().int().min(0).max(20).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});
export type SelectionCandidatesQuery = z.infer<typeof selectionCandidatesQuerySchema>;

/** O que já aconteceu entre esta lead e este imóvel em seleções anteriores. */
export interface CandidateHistory {
  sentAt: string | null;
  response: SelectionResponse;
  visitRequestedAt: string | null;
  /** Motivo do descarte, quando a lead disse "não combina". */
  responseReason: string | null;
}

/** Um imóvel candidato à seleção, com contexto para o corretor decidir. */
export interface SelectionCandidate {
  propertyId: string;
  code: number;
  title: string;
  type: string;
  status: PropertyStatus;
  purpose: PropertyPurpose;
  city: string | null;
  neighborhood: string | null;
  coverUrl: string | null;
  price: number | null;
  priceLabel: string;
  bedrooms: number | null;
  bathrooms: number | null;
  parkingSpots: number | null;
  area: number | null;
  compatibility: SelectionCompatibility | null;
  compatibilityReasons: string[];
  compatibilityWarnings: string[];
  /** Já está nesta seleção. */
  inSelection: boolean;
  /** Última interação da lead com este imóvel em qualquer seleção anterior. */
  history: CandidateHistory | null;
}

export interface SelectionCandidatesResult {
  items: SelectionCandidate[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

/** Um imóvel dentro da seleção, na visão administrativa do corretor. */
export interface SelectionItemView {
  id: string;
  propertyId: string;
  propertyCode: number;
  propertyTitle: string;
  propertyType: string;
  propertyStatus: PropertyStatus;
  city: string | null;
  neighborhood: string | null;
  coverUrl: string | null;
  price: number | null;
  priceLabel: string;
  position: number;
  highlight: boolean;
  brokerNote: string | null;
  origin: SelectionItemOrigin;
  compatibility: SelectionCompatibility | null;
  response: SelectionResponse;
  responseReason: string | null;
  respondedAt: string | null;
  visitRequestedAt: string | null;
}

/** A seleção completa, na visão administrativa do corretor. */
export interface SelectionView {
  id: string;
  /** Número curto da seleção, usado na URL do montador. */
  code: number;
  leadId: string;
  /** Número curto do lead dono da seleção, para montar a URL sem outra busca. */
  leadCode: number;
  leadName: string;
  status: SelectionStatus;
  publicToken: string;
  message: string | null;
  expiresInDays: SelectionExpiryDays | null;
  activatedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  archivedAt: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  lastAccessAt: string | null;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  items: SelectionItemView[];
}

// ---------------------------------------------------------------------------
// Página pública da seleção (/selecao/:token)
// ---------------------------------------------------------------------------

/** Motivos do "não combina comigo". A lead escolhe um, opcionalmente. */
export const SELECTION_DISMISS_REASONS = [
  "preco",
  "localizacao",
  "tamanho",
  "quartos",
  "vagas",
  "estilo",
  "estado",
  "condominio",
  "outro",
] as const;
export type SelectionDismissReason = (typeof SELECTION_DISMISS_REASONS)[number];

/**
 * Resposta da lead sobre um imóvel da seleção. "visualizado" é o desfazer:
 * volta ao estado neutro sem apagar o histórico da timeline.
 */
export const publicSelectionResponseSchema = z.object({
  response: z.enum(["tenho_interesse", "talvez", "sem_interesse", "visualizado"]),
  reason: z.enum(SELECTION_DISMISS_REASONS).nullish(),
  comment: z.string().trim().max(500).nullish(),
});
export type PublicSelectionResponseDto = z.infer<typeof publicSelectionResponseSchema>;

/** O que a lead quer saber a mais. */
export const SELECTION_INFO_KINDS = [
  "mais_informacoes",
  "falar_com_corretor",
  "tenho_duvida",
  "opcoes_semelhantes",
] as const;
export type SelectionInfoKind = (typeof SELECTION_INFO_KINDS)[number];

export const publicSelectionInfoSchema = z.object({
  kind: z.enum(SELECTION_INFO_KINDS),
  message: z.string().trim().max(500).nullish(),
});
export type PublicSelectionInfoDto = z.infer<typeof publicSelectionInfoSchema>;

/** Quem a lead vê do outro lado. Nunca e-mail nem identificador interno. */
export interface PublicSelectionBroker {
  name: string;
  whatsapp: string | null;
  agencyName: string | null;
  verified: boolean;
  creci: string | null;
  creciUf: string | null;
}

/** Card de um imóvel na página da seleção, com o estado da resposta da lead. */
export interface PublicSelectionItemCard {
  itemId: string;
  code: number;
  title: string;
  type: string;
  purpose: PropertyPurpose;
  priceLabel: string;
  locationLine: string | null;
  coverUrl: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parkingSpots: number | null;
  area: number | null;
  highlight: boolean;
  /** Observação do corretor para ESTA lead ("tem a varanda que você pediu"). */
  brokerNote: string | null;
  response: SelectionResponse;
  responseReason: string | null;
  visitRequestedAt: string | null;
  /** Visita marcada em horário real da agenda, quando existe. */
  visit: PublicVisitView | null;
  /** O imóvel saiu de oferta durante a validade: ações ficam bloqueadas. */
  unavailable: boolean;
}

export interface PublicSelectionView {
  /** Só o primeiro nome: minimização de dados numa página aberta por token. */
  leadFirstName: string;
  message: string | null;
  itemCount: number;
  /** "9 de agosto", ou nulo sem prazo (envio rápido legado). */
  expiresAtLabel: string | null;
  broker: PublicSelectionBroker;
  items: PublicSelectionItemCard[];
}

export interface PublicSelectionPageResponse {
  available: boolean;
  /** Sempre genérico: o motivo interno nunca vaza além destas categorias. */
  unavailableReason: "expirado" | "revogado" | "indisponivel" | null;
  /** Na página expirada o corretor continua alcançável. */
  broker: PublicSelectionBroker | null;
  selection: PublicSelectionView | null;
}

/** Detalhe de um imóvel dentro da seleção. */
export interface PublicSelectionItemDetail {
  itemId: string;
  highlight: boolean;
  brokerNote: string | null;
  response: SelectionResponse;
  responseReason: string | null;
  visitRequestedAt: string | null;
  property: PublicPropertyDetail;
}

export interface PublicSelectionItemDetailResponse {
  available: boolean;
  item: PublicSelectionItemDetail | null;
  broker: PublicSelectionBroker | null;
}

// ---------------------------------------------------------------------------
// Agendamento de visita pela lead
// ---------------------------------------------------------------------------

/** Um dia com horários livres, no fuso do corretor (America/Sao_Paulo). */
export interface PublicVisitDay {
  /** "2026-08-01" */
  date: string;
  /** "sáb, 1 de ago" pronto para o chip. */
  label: string;
  /** Horários livres no formato "HH:MM". */
  slots: string[];
}

export interface PublicVisitSlotsResponse {
  available: boolean;
  /** Falso = agenda não configurada: o front usa o fallback de solicitação. */
  configured: boolean;
  durationMin: number;
  days: PublicVisitDay[];
}

/** A lead escolhe dia e hora entre os slots oferecidos. */
export const publicBookVisitSchema = z.object({
  /** "2026-08-01" */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** "10:00" */
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});
export type PublicBookVisitDto = z.infer<typeof publicBookVisitSchema>;

/** Visita agendada, como a página da lead exibe. */
export interface PublicVisitView {
  visitId: string;
  /** "sábado, 1 de agosto às 10:00" */
  scheduledAtLabel: string;
  scheduledAt: string;
}

/** Linha do histórico de seleções na ficha da lead. */
export interface SelectionSummary {
  id: string;
  code: number;
  status: SelectionStatus;
  itemCount: number;
  likedCount: number;
  dismissedCount: number;
  visitRequestedCount: number;
  activatedAt: string | null;
  expiresAt: string | null;
  viewedAt: string | null;
  viewCount: number;
  createdAt: string;
}
