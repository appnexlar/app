import { z } from "zod";
import type { DuplicateCandidate } from "./dto";

/**
 * Importação de imóvel por URL (docs/10). Princípio: cole o link, a Nextlar
 * lê o anúncio e o imóvel nasce como RASCUNHO pré-preenchido; quem confirma,
 * corrige e publica é sempre o corretor, no wizard. Nada fica disponível sem
 * revisão humana.
 */

// --- Entrada -----------------------------------------------------------------

export const importPropertySchema = z.object({
  url: z
    .string()
    .trim()
    .min(8, "Cole o link do anúncio")
    .max(2000, "Link longo demais")
    .url("Isso não parece um link válido"),
  /** Importa mesmo quando o link já existe na carteira (decisão do corretor). */
  force: z.boolean().optional(),
});
export type ImportPropertyDto = z.infer<typeof importPropertySchema>;

// --- Leitura campo a campo ---------------------------------------------------

/**
 * Estado de cada campo na revisão. "revisar" cobre tanto heurística fraca
 * (categoria deduzida, área sem rótulo) quanto valor que o sistema teve que
 * chutar para o rascunho nascer (origem, finalidade ausente).
 */
export const IMPORT_FIELD_STATES = ["encontrado", "revisar", "nao_encontrado"] as const;
export type ImportFieldState = (typeof IMPORT_FIELD_STATES)[number];

/**
 * De onde o valor saiu, da fonte mais forte para a mais fraca. "ficha" é o
 * dado estruturado (JSON-LD); "texto" é o que estava escrito na tela, lido
 * quando a ficha não trouxe o campo.
 */
export const IMPORT_FIELD_SOURCES = ["ficha", "og", "titulo", "descricao", "texto", "url"] as const;
export type ImportFieldSource = (typeof IMPORT_FIELD_SOURCES)[number];

export interface ImportedField {
  /** Chave no modelo do imóvel (ex.: "salePrice", "details.bedrooms"). */
  key: string;
  /** Rótulo em português mostrado ao corretor. */
  label: string;
  state: ImportFieldState;
  /** Valor já formatado para leitura (ex.: "R$ 518.000,00", "4"). */
  value: string | null;
  source: ImportFieldSource | null;
  /** Trecho da página que sustenta o valor, quando houver. */
  evidence?: string | null;
}

// --- Resultado ---------------------------------------------------------------

export interface ImportSummaryCounts {
  found: number;
  review: number;
  missing: number;
}

/**
 * Resposta do POST /properties/imports. Dois desfechos:
 *  - "criado": o rascunho nasceu e a revisão acontece no wizard;
 *  - "duplicado": o link já existe na carteira; nada foi criado e o corretor
 *    decide entre abrir o existente ou importar mesmo assim (force).
 */
export interface PropertyImportResult {
  outcome: "criado" | "duplicado";
  importId: string;
  propertyId: string | null;
  propertyCode: number | null;
  summary: ImportSummaryCounts;
  fields: ImportedField[];
  /** Fotos encontradas no anúncio. Nesta versão são contadas, não importadas. */
  photosFound: number;
  duplicates: DuplicateCandidate[];
}
