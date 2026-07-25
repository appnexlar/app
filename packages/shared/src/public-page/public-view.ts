/**
 * A vitrine como o VISITANTE a vê. Este contrato é público de verdade: tudo
 * aqui vai para qualquer pessoa na internet, então nada de id interno, e-mail
 * de login, telefone privado ou motivo administrativo. Quem monta é a API;
 * o front só desenha.
 */

import { z } from "zod";

/** Card de imóvel na vitrine. O identificador público é o código (#123). */
export interface PublicPropertyCard {
  /** Código público sequencial, o mesmo que o corretor usa no dia a dia. */
  code: number;
  title: string;
  type: string;
  purpose: "venda" | "locacao" | "venda_locacao" | "temporada";
  /** Preço formatado ou "Valor sob consulta". */
  priceLabel: string;
  /** Bairro e cidade. Nunca rua nem número na listagem. */
  locationLine: string | null;
  /** Foto de capa servida pela rota pública, ou nulo. */
  coverUrl: string | null;
  /** Atributos-resumo; ausentes quando o cadastro não tem. */
  bedrooms: number | null;
  bathrooms: number | null;
  parkingSpots: number | null;
  /** Área em m² (construída quando existe, senão total). */
  area: number | null;
  /** True quando o corretor pôs no bloco de destaques. */
  highlighted: boolean;
}

export interface PublicBrokerPageView {
  slug: string;
  name: string;
  headline: string | null;
  bio: string | null;
  photoUrl: string | null;
  /** Selo. Número e UF só vêm quando verificado, mesma regra das Seleções. */
  verified: boolean;
  creci: string | null;
  creciUf: string | null;
  agencyName: string | null;
  agencyLogoUrl: string | null;
  mainCity: string | null;
  regions: string[];
  focus: "venda" | "locacao" | "ambos" | null;
  propertyTypes: string[];
  languages: string[];
  /** Contatos públicos, só dígitos; o front monta wa.me e tel:. */
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  serviceHours: string | null;
  /** Destaques primeiro (na ordem do corretor), depois os demais publicados. */
  properties: PublicPropertyCard[];
  totalProperties: number;
}

/**
 * Resposta da rota pública. Quando a página não está no ar, o motivo interno
 * (pausada, restrita, inexistente) NUNCA sai: para o visitante é tudo a mesma
 * página indisponível.
 */
export interface PublicBrokerPageResponse {
  available: boolean;
  page: PublicBrokerPageView | null;
}

// ---------------------------------------------------------------------------
// Listagem pública com busca, filtros e ordenação (§17-§20 da épica)
// ---------------------------------------------------------------------------

export const PUBLIC_SORTS = [
  "destaque",
  "recentes",
  "menor_preco",
  "maior_preco",
  "maior_area",
] as const;
export type PublicSort = (typeof PUBLIC_SORTS)[number];

/** Página de resultados curta: vitrine não é portal, é seleção. */
export const PUBLIC_PAGE_SIZE = 12;

/**
 * Query da listagem pública. Tudo opcional, tudo validado e com teto:
 * é a entrada mais exposta do sistema, então nada passa sem limite.
 */
export const publicListingQuerySchema = z.object({
  /** Busca textual: título, tipo, bairro, cidade, condomínio ou código. */
  q: z.string().trim().min(2).max(80).optional(),
  purpose: z.enum(["venda", "locacao", "venda_locacao", "temporada"]).optional(),
  type: z.string().trim().min(1).max(40).optional(),
  neighborhood: z.string().trim().min(1).max(60).optional(),
  minPrice: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
  maxPrice: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
  bedrooms: z.coerce.number().int().min(1).max(20).optional(),
  bathrooms: z.coerce.number().int().min(1).max(20).optional(),
  parking: z.coerce.number().int().min(1).max(20).optional(),
  minArea: z.coerce.number().int().min(1).max(100_000).optional(),
  sort: z.enum(PUBLIC_SORTS).default("destaque"),
  page: z.coerce.number().int().min(1).max(200).default(1),
});

export type PublicListingQuery = z.infer<typeof publicListingQuerySchema>;

export interface PublicListingResponse {
  available: boolean;
  items: PublicPropertyCard[];
  total: number;
  page: number;
  pageSize: number;
  /** Opções reais para os filtros, derivadas do que está publicado. */
  facets: {
    types: string[];
    neighborhoods: string[];
  };
}

// ---------------------------------------------------------------------------
// Detalhe público do imóvel (§22)
// ---------------------------------------------------------------------------

export interface PublicPropertyPhoto {
  /** URL da rota pública validada por posse. */
  url: string;
  caption: string | null;
}

/** Vídeo do imóvel, servido pela mesma rota pública validada das fotos. */
export interface PublicPropertyVideo {
  url: string;
  caption: string | null;
}

/** Tour virtual, vídeo em portal ou qualquer link que o corretor anexou. */
export interface PublicPropertyLink {
  url: string;
  caption: string | null;
}

/**
 * Um bloco da ficha técnica. Os rótulos vêm de DETAIL_FIELDS, a mesma tabela
 * que monta o formulário de cadastro: o que o corretor preencheu é o que o
 * visitante lê, com as mesmas palavras.
 */
export interface PublicSpecGroup {
  title: string;
  /**
   * `pares` rende uma tabela rótulo/valor ("Área total: 112 m²").
   * `itens` rende uma lista do que o imóvel tem, sem valor: repetir "Sim"
   * em sete linhas é ruído, e o que importa ali é a presença.
   */
  kind: "pares" | "itens";
  items: { label: string; value: string }[];
}

/** Condições de locação, quando o anúncio é de aluguel. */
export interface PublicRentTerms {
  guaranteeTypes: string | null;
  minTermMonths: number | null;
  otherFees: string | null;
  /** Já formatada em pt-BR, porque data crua não diz nada ao visitante. */
  availableFromLabel: string | null;
  notes: string | null;
}

/**
 * O imóvel aberto para o visitante. Mesma regra de sempre: só o que pode ser
 * público. Nunca notas internas, origem, comissão ou rua exata quando o
 * addressDisplay não permite.
 */
export interface PublicPropertyDetail {
  code: number;
  title: string;
  type: string;
  purpose: "venda" | "locacao" | "venda_locacao" | "temporada";
  priceLabel: string;
  /** Custos recorrentes, quando informados (formatados). */
  condoFeeLabel: string | null;
  iptuLabel: string | null;
  description: string | null;
  /** Linha de localização já respeitando o addressDisplay do imóvel. */
  locationLine: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parkingSpots: number | null;
  area: number | null;
  features: string[];
  acceptsFinancing: boolean | null;
  acceptsFgts: boolean | null;
  acceptsTrade: boolean | null;
  priceNegotiable: boolean | null;
  furnished: boolean | null;
  /** Residencial, comercial, terreno...: muda o vocabulário da ficha. */
  category: string;
  /** Nome do condomínio ou edifício, quando o endereço pode ser detalhado. */
  condoName: string | null;
  /** Ponto de referência, pela mesma regra do condomínio. */
  reference: string | null;
  /** Ficha técnica completa, agrupada, com tudo que o corretor preencheu. */
  specs: PublicSpecGroup[];
  /** Só vem quando o anúncio envolve locação. */
  rentTerms: PublicRentTerms | null;
  photos: PublicPropertyPhoto[];
  videos: PublicPropertyVideo[];
  links: PublicPropertyLink[];
  highlighted: boolean;
}

export interface PublicPropertyDetailResponse {
  available: boolean;
  property: PublicPropertyDetail | null;
  /** O corretor da vitrine, para o rodapé de contato do detalhe. */
  broker: {
    slug: string;
    name: string;
    photoUrl: string | null;
    verified: boolean;
    whatsapp: string | null;
  } | null;
}
