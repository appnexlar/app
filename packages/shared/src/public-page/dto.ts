/**
 * Página Pública do Corretor — contratos compartilhados.
 *
 * Fonte única dos tipos da vitrine (/corretor/:slug): estados, requisitos de
 * publicação, slug e o schema de edição. A API valida contra isto e o front
 * consome os mesmos tipos, então o contrato não desencontra.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Estados da página
// ---------------------------------------------------------------------------

/**
 * Em português, como os enums do resto da casa. Só `ativa` responde na rota
 * pública. `restrita` é decisão administrativa (script), o front nunca a
 * cria nem a desfaz.
 */
export const PUBLIC_PAGE_STATUSES = [
  "rascunho",
  "incompleta",
  "ativa",
  "pausada",
  "restrita",
] as const;

export type PublicPageStatus = (typeof PUBLIC_PAGE_STATUSES)[number];

// ---------------------------------------------------------------------------
// Slug: o endereço público nextlar.app/corretor/{slug}
// ---------------------------------------------------------------------------

export const SLUG_MIN = 3;
export const SLUG_MAX = 40;

/**
 * Palavras que nunca podem virar slug. Como o endereço vive sob o prefixo
 * /corretor/, o risco de colidir com rota do app é pequeno; a lista protege
 * contra slugs que enganam ("admin", "suporte") ou que a Nextlar pode querer
 * usar um dia. Minúsculas, já normalizadas.
 */
export const RESERVED_SLUGS: readonly string[] = [
  "admin",
  "api",
  "app",
  "ajuda",
  "blog",
  "cadastro",
  "clientes",
  "configuracoes",
  "contato",
  "corretor",
  "dashboard",
  "equipe",
  "imoveis",
  "imovel",
  "leads",
  "login",
  "nexlar",
  "oficial",
  "pagina",
  "perfil",
  "privacidade",
  "public",
  "publico",
  "sobre",
  "suporte",
  "termos",
  "teste",
  "www",
];

const RESERVED_SLUG_SET = new Set<string>(RESERVED_SLUGS);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUG_SET.has(slug);
}

/**
 * Normaliza o que o corretor digitou para o formato canônico do slug:
 * minúsculas, sem acento, espaços viram hífen, só [a-z0-9-], sem hífens
 * duplicados nem nas pontas. "Rafaela  Núñes!" -> "rafaela-nunes".
 */
export function normalizeSlug(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Valida um slug JÁ normalizado. A normalização é responsabilidade de quem
 * recebe a digitação (serviço/tela); o schema é o juiz final do formato.
 */
export const slugSchema = z
  .string()
  .min(SLUG_MIN, `O endereço precisa de pelo menos ${SLUG_MIN} caracteres.`)
  .max(SLUG_MAX, `O endereço pode ter no máximo ${SLUG_MAX} caracteres.`)
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
    "Use só letras minúsculas, números e hífens, sem hífen nas pontas.",
  )
  .refine((s) => !isReservedSlug(s), "Este endereço é reservado pela Nextlar.");

/** Resposta da checagem de disponibilidade, sempre decidida pelo backend. */
export interface SlugAvailability {
  /** O slug canônico avaliado (depois da normalização). */
  slug: string;
  available: boolean;
  /** Presente quando indisponível, para a tela explicar o porquê. */
  reason?: "invalido" | "reservado" | "em_uso";
  message?: string;
}

// ---------------------------------------------------------------------------
// Edição do perfil público
// ---------------------------------------------------------------------------

/** Texto opcional e limpável: string apara espaços, null limpa o campo. */
const texto = (max: number) => z.string().trim().min(1).max(max).nullable().optional();

/** Telefone/WhatsApp público: só dígitos com DDI/DDD, 10 a 15 dígitos. */
const telefonePublico = z
  .string()
  .trim()
  .regex(/^\d{10,15}$/, "Informe DDD e número, só dígitos (ex.: 11999998888).")
  .nullable()
  .optional();

const listaCurta = (maxItem: number, maxItens: number) =>
  z.array(z.string().trim().min(1).max(maxItem)).max(maxItens).optional();

export const updatePublicPageSchema = z.object({
  professionalName: texto(80),
  headline: texto(120),
  bio: texto(2000),
  mainCity: texto(80),
  regions: listaCurta(60, 12),
  focus: z.enum(["venda", "locacao", "ambos"]).nullable().optional(),
  propertyTypes: listaCurta(40, 12),
  languages: listaCurta(30, 8),
  publicWhatsapp: telefonePublico,
  publicPhone: telefonePublico,
  publicEmail: z.string().trim().email("E-mail inválido.").max(160).nullable().optional(),
  website: z.string().trim().url("Informe a URL completa, com https://.").max(200).nullable().optional(),
  /** Aceita @usuario ou URL do perfil; a tela mostra como preferir. */
  instagram: texto(100),
  serviceHours: texto(120),
  /**
   * Slug desejado. O serviço normaliza antes de validar, então a tela pode
   * mandar o que o corretor digitou.
   */
  slug: z.string().trim().min(1).max(120).nullable().optional(),
  /**
   * Aceite dos termos de publicação. Só liga: uma vez aceito, não se
   * "desaceita" por PATCH (a prova é histórica).
   */
  acceptPublicationTerms: z.literal(true).optional(),
});

export type UpdatePublicPageDto = z.infer<typeof updatePublicPageSchema>;

// ---------------------------------------------------------------------------
// Requisitos mínimos de publicação
// ---------------------------------------------------------------------------

/** Chaves estáveis; a tela usa para navegar até o campo/etapa pendente. */
export type PublicPageRequirementKey =
  | "nome_profissional"
  | "foto"
  | "contato"
  | "regiao"
  | "creci"
  | "endereco_publico"
  | "imovel_elegivel"
  | "termos_publicacao";

export interface PublicPageRequirement {
  key: PublicPageRequirementKey;
  completed: boolean;
  title: string;
  /** O porquê da pendência, em linguagem de gente. */
  description?: string;
  /** Rota do front onde a pendência se resolve. */
  actionUrl?: string;
}

export interface PublicPageRequirements {
  canPublish: boolean;
  items: PublicPageRequirement[];
  completed: number;
  total: number;
}

// ---------------------------------------------------------------------------
// A página como o corretor a vê (área autenticada)
// ---------------------------------------------------------------------------

/** Dados do CRECI que a vitrine usa. O status vem do backend, sempre. */
export interface PublicPageCreci {
  number: string | null;
  uf: string | null;
  /** Só true quando creci_status = aprovado. O front nunca decide o selo. */
  verified: boolean;
  informed: boolean;
}

export interface MyPublicPage {
  slug: string | null;
  status: PublicPageStatus;
  professionalName: string | null;
  headline: string | null;
  bio: string | null;
  mainCity: string | null;
  regions: string[];
  focus: "venda" | "locacao" | "ambos" | null;
  propertyTypes: string[];
  languages: string[];
  publicWhatsapp: string | null;
  publicPhone: string | null;
  publicEmail: string | null;
  website: string | null;
  instagram: string | null;
  serviceHours: string | null;
  agencyLogoUrl: string | null;
  /** Reusos da conta (fonte: broker), somente leitura aqui. */
  photoUrl: string | null;
  agencyName: string | null;
  creci: PublicPageCreci;
  publicationTermsAcceptedAt: string | null;
  publishedAt: string | null;
  pausedAt: string | null;
}

/** Resposta do GET: a página + a régua de publicação, sempre juntas. */
export interface MyPublicPageState {
  page: MyPublicPage;
  requirements: PublicPageRequirements;
}
