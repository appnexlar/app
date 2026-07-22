import { z } from "zod";

/**
 * DTOs de imóveis. Princípio do produto: o imóvel é um registro PRIVADO na
 * carteira do corretor. A imobiliária é só uma origem possível, nunca a
 * entidade principal. Cadastro em etapas: só categoria, tipo, finalidade,
 * título e origem são exigidos para criar o rascunho; o resto é progressivo.
 */

// --- Enums ------------------------------------------------------------------

export const PROPERTY_PURPOSES = ["venda", "locacao", "venda_locacao", "temporada"] as const;
export const PROPERTY_CATEGORIES = [
  "residencial",
  "comercial",
  "industrial",
  "terreno",
  "rural",
  "empreendimento",
] as const;
export const PROPERTY_STATUSES = [
  "rascunho",
  "disponivel",
  "temporariamente_indisponivel",
  "reservado",
  "em_negociacao",
  "vendido",
  "alugado",
  "arquivado",
] as const;
export const PROPERTY_ORIGINS = [
  "captacao_propria",
  "proprietario_particular",
  "imobiliaria",
  "corretor_parceiro",
  "construtora",
  "indicacao",
  "banco_leilao",
  "outro",
] as const;
export const ADDRESS_DISPLAY_MODES = [
  "completo",
  "aproximado",
  "sem_numero",
  "bairro_cidade",
] as const;
export const PROPERTY_CONTACT_ROLES = [
  "proprietario",
  "corretor_captador",
  "corretor_parceiro",
  "imobiliaria_responsavel",
  "construtora",
  "administradora_locacao",
  "responsavel_chaves",
  "contato_agendamento",
  "outro",
] as const;
export const MEDIA_KINDS = ["foto", "video", "planta", "documento", "link_externo"] as const;
export const MEDIA_ORIGINS = [
  "corretor",
  "imobiliaria",
  "proprietario",
  "parceiro",
  "link_externo",
  "outro",
] as const;
export const MEDIA_STATUSES = ["enviando", "processando", "pronto", "falhou", "removido"] as const;
export const PHOTO_ROOMS = [
  "fachada",
  "sala",
  "cozinha",
  "quarto",
  "banheiro",
  "area_externa",
  "garagem",
  "condominio",
  "planta",
  "vista",
  "outro",
] as const;

export type PropertyPurpose = (typeof PROPERTY_PURPOSES)[number];
export type PropertyCategory = (typeof PROPERTY_CATEGORIES)[number];
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];
export type PropertyOrigin = (typeof PROPERTY_ORIGINS)[number];
export type AddressDisplayMode = (typeof ADDRESS_DISPLAY_MODES)[number];
export type PropertyContactRole = (typeof PROPERTY_CONTACT_ROLES)[number];
export type MediaKind = (typeof MEDIA_KINDS)[number];
export type MediaOrigin = (typeof MEDIA_ORIGINS)[number];
export type MediaStatus = (typeof MEDIA_STATUSES)[number];
export type PhotoRoom = (typeof PHOTO_ROOMS)[number];

// --- Tipos por categoria ----------------------------------------------------

/** Tipos válidos por categoria. O formulário começa pela categoria. */
export const CATEGORY_TYPES: Record<PropertyCategory, readonly string[]> = {
  residencial: [
    "casa",
    "apartamento",
    "casa_condominio",
    "cobertura",
    "studio",
    "kitnet",
    "sobrado",
    "flat",
    "loft",
    "duplex",
    "triplex",
    "chacara_residencial",
  ],
  comercial: [
    "sala_comercial",
    "loja",
    "ponto_comercial",
    "escritorio",
    "predio_comercial",
    "clinica_consultorio",
    "hotel_pousada",
  ],
  industrial: ["galpao", "armazem", "fabrica", "centro_distribuicao", "area_industrial"],
  terreno: [
    "terreno_residencial",
    "terreno_comercial",
    "terreno_industrial",
    "lote_condominio",
    "area_incorporacao",
  ],
  rural: ["fazenda", "sitio", "chacara", "area_rural"],
  empreendimento: ["lancamento", "unidade_construcao", "unidade_pronta", "loteamento"],
};

// --- Detalhes específicos por categoria -------------------------------------

const num = z.number().nonnegative().optional();
const bool = z.boolean().optional();
const shortText = z.string().trim().max(300).optional();

/**
 * Campos específicos, guardados em details (Json). Cada categoria valida só o
 * seu grupo: não existe quarto em terreno nem doca em apartamento.
 */
const residentialDetails = z.object({
  bedrooms: num,
  suites: num,
  bathrooms: num,
  halfBaths: num,
  livingRooms: num,
  parkingSpots: num,
  totalArea: num,
  builtArea: num,
  privateArea: num,
  usableArea: num,
  lotArea: num,
  floors: num,
  unitFloor: num,
  buildingFloors: num,
  elevator: bool,
  balcony: bool,
  serviceArea: bool,
  serviceRoom: bool,
  office: bool,
  furnished: bool,
  acceptsPets: bool,
  yearBuilt: num,
  solarPosition: shortText,
  pool: bool,
  barbecue: bool,
  garden: bool,
  gatedCommunity: bool,
});

const commercialDetails = z.object({
  rooms: num,
  bathrooms: num,
  parkingSpots: num,
  usableArea: num,
  totalArea: num,
  reception: bool,
  pantry: bool,
  kitchen: bool,
  storage: bool,
  elevator: bool,
  accessibility: bool,
  storefront: bool,
  facade: shortText,
  airConditioning: bool,
  floorType: shortText,
  allowedActivity: shortText,
  zoning: shortText,
  footTraffic: shortText,
  signageAllowed: bool,
});

const industrialDetails = z.object({
  totalArea: num,
  builtArea: num,
  factoryArea: num,
  adminArea: num,
  storageArea: num,
  ceilingHeight: num,
  docks: num,
  floorCapacity: num,
  maneuverYard: bool,
  loadingArea: bool,
  powerSupply: shortText,
  zoning: shortText,
  truckAccess: bool,
  security: shortText,
  internalOffices: num,
});

const landDetails = z.object({
  totalArea: num,
  front: num,
  back: num,
  rightSide: num,
  leftSide: num,
  topography: shortText,
  zoning: shortText,
  infrastructure: shortText,
  paved: bool,
  water: bool,
  power: bool,
  sewage: bool,
  inCondo: bool,
  buildingAllowed: bool,
  landNotes: shortText,
});

const ruralDetails = z.object({
  totalArea: num,
  areaUnit: shortText,
  productiveArea: num,
  preservedArea: num,
  improvements: shortText,
  waterResources: shortText,
  power: bool,
  accessType: shortText,
  accessRoad: shortText,
  documentation: shortText,
  currentActivity: shortText,
  structures: shortText,
  ruralNotes: shortText,
});

export const CATEGORY_DETAILS_SCHEMAS: Record<PropertyCategory, z.ZodTypeAny> = {
  residencial: residentialDetails,
  comercial: commercialDetails,
  industrial: industrialDetails,
  terreno: landDetails,
  rural: ruralDetails,
  // Empreendimento usa os campos residenciais (unidades) por ora.
  empreendimento: residentialDetails,
};

export type PropertyDetails = z.infer<typeof residentialDetails> &
  z.infer<typeof commercialDetails> &
  z.infer<typeof industrialDetails> &
  z.infer<typeof landDetails> &
  z.infer<typeof ruralDetails>;

// --- Origem: dados condicionais (internos, nunca exibidos à lead) ----------

export const originDetailsSchema = z.object({
  // Captação própria / proprietário particular
  ownerName: shortText,
  ownerWhatsapp: shortText,
  ownerEmail: shortText,
  hasAuthorization: bool,
  authorizationType: shortText,
  authorizationDate: shortText,
  authorizationValidity: shortText,
  keysHolder: shortText,
  visitInstructions: shortText,
  // Imobiliária
  agencyName: shortText,
  agencyPropertyCode: shortText,
  agencyContactName: shortText,
  agencyContactPhone: shortText,
  agencyContactEmail: shortText,
  agencyVisitNotes: shortText,
  // Corretor parceiro
  partnerName: shortText,
  partnerCreci: shortText,
  partnerWhatsapp: shortText,
  partnerEmail: shortText,
  partnerAgency: shortText,
  partnershipNotes: shortText,
  // Construtora
  builderName: shortText,
  developmentName: shortText,
  block: shortText,
  tower: shortText,
  unit: shortText,
  commercialContact: shortText,
  unitCode: shortText,
  // Genérico
  originNotes: shortText,
});
export type OriginDetails = z.infer<typeof originDetailsSchema>;

// --- Schemas de criação e atualização ---------------------------------------

const optionalTrimmed = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal("")).transform((v) => (v ? v : undefined));

const money = z.number().nonnegative().optional();

/** Etapa 1: o mínimo para nascer o rascunho. */
export const createPropertySchema = z
  .object({
    title: z.string().trim().min(3, "Informe um título").max(160),
    purpose: z.enum(PROPERTY_PURPOSES, { errorMap: () => ({ message: "Informe a finalidade" }) }),
    category: z.enum(PROPERTY_CATEGORIES, {
      errorMap: () => ({ message: "Informe a categoria" }),
    }),
    type: z.string().min(1, "Informe o tipo"),
    origin: z.enum(PROPERTY_ORIGINS, {
      errorMap: () => ({ message: "Informe como o imóvel chegou até você" }),
    }),
    externalCode: optionalTrimmed(80),
    externalLink: optionalTrimmed(500),
  })
  .refine((data) => CATEGORY_TYPES[data.category].includes(data.type), {
    path: ["type"],
    message: "Tipo não pertence à categoria escolhida",
  });
export type CreatePropertyDto = z.infer<typeof createPropertySchema>;

/** Atualização progressiva: qualquer etapa salva um pedaço. */
export const updatePropertySchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  purpose: z.enum(PROPERTY_PURPOSES).optional(),
  category: z.enum(PROPERTY_CATEGORIES).optional(),
  type: z.string().optional(),
  description: optionalTrimmed(8000),
  internalNotes: optionalTrimmed(4000),
  externalCode: optionalTrimmed(80),
  externalLink: optionalTrimmed(500),
  origin: z.enum(PROPERTY_ORIGINS).optional(),
  originDetails: originDetailsSchema.optional(),
  // Localização
  zip: optionalTrimmed(12),
  street: optionalTrimmed(200),
  addressNumber: optionalTrimmed(20),
  complement: optionalTrimmed(80),
  neighborhood: optionalTrimmed(120),
  city: optionalTrimmed(120),
  state: optionalTrimmed(2),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  reference: optionalTrimmed(300),
  condoName: optionalTrimmed(160),
  addressDisplay: z.enum(ADDRESS_DISPLAY_MODES).optional(),
  // Valores
  salePrice: money,
  acceptsFinancing: bool,
  acceptsFgts: bool,
  acceptsTrade: bool,
  priceNegotiable: bool,
  commissionNotes: optionalTrimmed(1000),
  rentPrice: money,
  condoFee: money,
  iptu: money,
  otherFees: optionalTrimmed(500),
  guaranteeTypes: optionalTrimmed(300),
  minTermMonths: z.number().int().positive().optional(),
  furnished: bool,
  availableFrom: optionalTrimmed(10),
  rentNotes: optionalTrimmed(2000),
  // Específicos + comodidades
  details: z.record(z.unknown()).optional(),
  features: z.array(z.string().trim().min(1).max(60)).max(60).optional(),
});
export type UpdatePropertyDto = z.infer<typeof updatePropertySchema>;

export const changeStatusSchema = z.object({
  status: z.enum(PROPERTY_STATUSES),
});
export type ChangeStatusDto = z.infer<typeof changeStatusSchema>;

export const confirmAvailabilitySchema = z.object({
  confirmedBy: optionalTrimmed(160),
  nextReviewAt: optionalTrimmed(10),
  note: optionalTrimmed(500),
});
export type ConfirmAvailabilityDto = z.infer<typeof confirmAvailabilitySchema>;

export const propertyContactSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(160),
  roles: z.array(z.enum(PROPERTY_CONTACT_ROLES)).min(1, "Escolha ao menos um papel"),
  phone: optionalTrimmed(20),
  whatsapp: optionalTrimmed(20),
  email: optionalTrimmed(160),
  creci: optionalTrimmed(30),
  agencyName: optionalTrimmed(160),
  notes: optionalTrimmed(1000),
});
export type PropertyContactDto = z.infer<typeof propertyContactSchema>;

export const externalMediaSchema = z.object({
  kind: z.enum(["link_externo"]),
  externalUrl: z.string().trim().url("Informe um link válido").max(600),
  caption: optionalTrimmed(200),
  origin: z.enum(MEDIA_ORIGINS).default("link_externo"),
});
export type ExternalMediaDto = z.infer<typeof externalMediaSchema>;

export const updateMediaSchema = z.object({
  caption: optionalTrimmed(200),
  room: z.enum(PHOTO_ROOMS).optional(),
  isCover: z.boolean().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
  origin: z.enum(MEDIA_ORIGINS).optional(),
  authorized: z.boolean().optional(),
});
export type UpdateMediaDto = z.infer<typeof updateMediaSchema>;

// --- Listagem: busca, filtros, ordenação ------------------------------------

export const PROPERTY_SORTS = [
  "recentes",
  "antigos",
  "menor_valor",
  "maior_valor",
  "atualizacao",
  "titulo",
] as const;
export type PropertySort = (typeof PROPERTY_SORTS)[number];

export const listPropertiesSchema = z.object({
  q: optionalTrimmed(160),
  purpose: z.enum(PROPERTY_PURPOSES).optional(),
  category: z.enum(PROPERTY_CATEGORIES).optional(),
  type: z.string().optional(),
  status: z.enum(PROPERTY_STATUSES).optional(),
  origin: z.enum(PROPERTY_ORIGINS).optional(),
  city: optionalTrimmed(120),
  neighborhood: optionalTrimmed(120),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  bedrooms: z.coerce.number().int().nonnegative().optional(),
  parkingSpots: z.coerce.number().int().nonnegative().optional(),
  availabilityConfirmed: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  sort: z.enum(PROPERTY_SORTS).default("recentes"),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(50).default(12),
});
export type ListPropertiesQuery = z.infer<typeof listPropertiesSchema>;

// --- Respostas da API -------------------------------------------------------

export interface PropertyMediaSummary {
  id: string;
  kind: MediaKind;
  origin: MediaOrigin;
  authorized: boolean;
  status: MediaStatus;
  url: string | null;
  externalUrl: string | null;
  caption: string | null;
  room: PhotoRoom | null;
  isCover: boolean;
  sortOrder: number;
}

export interface PropertyContactSummary {
  id: string;
  name: string;
  roles: PropertyContactRole[];
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  creci: string | null;
  agencyName: string | null;
  notes: string | null;
}

export interface PropertySummary {
  id: string;
  code: number;
  title: string;
  purpose: PropertyPurpose;
  category: PropertyCategory;
  type: string;
  status: PropertyStatus;
  origin: PropertyOrigin;
  city: string | null;
  neighborhood: string | null;
  salePrice: number | null;
  rentPrice: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parkingSpots: number | null;
  mainArea: number | null;
  coverUrl: string | null;
  availabilityConfirmed: boolean;
  updatedAt: string;
  createdAt: string;
}

export interface PropertyDetail extends PropertySummary {
  description: string | null;
  internalNotes: string | null;
  externalCode: string | null;
  externalLink: string | null;
  originDetails: OriginDetails | null;
  zip: string | null;
  street: string | null;
  addressNumber: string | null;
  complement: string | null;
  state: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  reference: string | null;
  condoName: string | null;
  addressDisplay: AddressDisplayMode;
  acceptsFinancing: boolean | null;
  acceptsFgts: boolean | null;
  acceptsTrade: boolean | null;
  priceNegotiable: boolean | null;
  commissionNotes: string | null;
  condoFee: number | null;
  iptu: number | null;
  otherFees: string | null;
  guaranteeTypes: string | null;
  minTermMonths: number | null;
  furnished: boolean | null;
  availableFrom: string | null;
  rentNotes: string | null;
  details: Partial<PropertyDetails> | null;
  features: string[];
  availabilityConfirmedAt: string | null;
  availabilityConfirmedBy: string | null;
  availabilityNextReviewAt: string | null;
  availabilityNote: string | null;
  contacts: PropertyContactSummary[];
  media: PropertyMediaSummary[];
}

export interface PropertyListResponse {
  items: PropertySummary[];
  total: number;
  page: number;
  perPage: number;
}

/**
 * Parceiro conhecido: corretor parceiro que o próprio corretor já cadastrou
 * antes. Reuso dentro da carteira dele, nunca dados de outras contas.
 */
export interface KnownPartner {
  name: string;
  creci: string | null;
  whatsapp: string | null;
  email: string | null;
  agencyName: string | null;
}

/** Possível duplicidade detectada na criação. Nunca bloqueia, só avisa. */
export interface DuplicateCandidate {
  id: string;
  code: number;
  title: string;
  status: PropertyStatus;
  city: string | null;
  neighborhood: string | null;
  matchedBy: "codigo_externo" | "link" | "endereco";
}
