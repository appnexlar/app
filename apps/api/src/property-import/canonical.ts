import type { ImportFieldSource, PropertyCategory, PropertyPurpose } from "@nexlar/shared";

/**
 * A forma canônica da importação e os normalizadores brasileiros.
 *
 * Mora num arquivo só, e separado, porque as duas fases da leitura precisam
 * dele: a estruturada (`extraction.ts`, que lê JSON-LD e Open Graph) e a de
 * texto (`page-text.ts`, que lê o que está escrito na tela). Se os tipos
 * ficassem numa das duas, a outra importaria de volta e viraria ciclo.
 */

export interface Extracted<T> {
  value: T;
  source: ImportFieldSource;
  evidence?: string;
}

export interface CanonicalExtraction {
  title?: Extracted<string>;
  description?: Extracted<string>;
  purpose?: Extracted<PropertyPurpose>;
  categoryType?: Extracted<{ category: PropertyCategory; type: string }>;
  price?: Extracted<number>;
  /** Custos que andam junto do preço e pesam na decisão de quem aluga. */
  condoFee?: Extracted<number>;
  iptu?: Extracted<number>;
  street?: Extracted<string>;
  addressNumber?: Extracted<string>;
  neighborhood?: Extracted<string>;
  city?: Extracted<string>;
  state?: Extracted<string>;
  zip?: Extracted<string>;
  bedrooms?: Extracted<number>;
  suites?: Extracted<number>;
  bathrooms?: Extracted<number>;
  halfBaths?: Extracted<number>;
  livingRooms?: Extracted<number>;
  parkingSpots?: Extracted<number>;
  totalArea?: Extracted<number>;
  builtArea?: Extracted<number>;
  privateArea?: Extracted<number>;
  usableArea?: Extracted<number>;
  lotArea?: Extracted<number>;
  /** Área sem rótulo ("186 m²" solto): vale menos, o mapper marca "revisar". */
  genericArea?: Extracted<number>;
  externalCode?: Extracted<string>;
  /** Características de sim ou não que a página lista em chips ("Piscina"). */
  amenities: Record<string, Extracted<boolean>>;
  photos: string[];
}

/** Chaves numéricas do canônico, para as fases preencherem sem casting solto. */
export type NumericKey =
  | "price"
  | "condoFee"
  | "iptu"
  | "bedrooms"
  | "suites"
  | "bathrooms"
  | "halfBaths"
  | "livingRooms"
  | "parkingSpots"
  | "totalArea"
  | "builtArea"
  | "privateArea"
  | "usableArea"
  | "lotArea"
  | "genericArea";

export function setNumber(
  out: CanonicalExtraction,
  key: NumericKey,
  extracted: Extracted<number>,
): void {
  if (out[key]) return;
  out[key] = extracted;
}

// --- Dinheiro, área e UF -----------------------------------------------------

/**
 * Dinheiro em qualquer grafia brasileira ou de ficha: "R$ 518.000,00",
 * "518000", "490000.0", "518.000". Devolve reais com centavos (nunca
 * centavos inteiros: o banco guarda Decimal em reais).
 */
export function parseMoneyBR(raw: string): number | null {
  const s = raw.replace(/[R$\s ]/g, "");
  if (!s || /[^\d.,]/.test(s)) return null;
  let normalized: string;
  if (s.includes(",") && s.includes(".")) {
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    normalized = s.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // Só pontos, agrupados de 3 em 3: são milhares ("518.000").
    normalized = s.replace(/\./g, "");
  } else {
    normalized = s;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0 || value > 999_999_999_999) return null;
  return Math.round(value * 100) / 100;
}

/** Área: mesma leitura numérica do dinheiro, com teto sanitário próprio. */
export function parseAreaBR(raw: string): number | null {
  const value = parseMoneyBR(raw);
  if (value == null || value <= 0 || value > 10_000_000) return null;
  return value;
}

/** Contagem de cômodos: inteiro pequeno, senão é ano, telefone ou preço. */
export function parseCount(raw: string): number | null {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0 || value > 60) return null;
  return value;
}

const UF_SET = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]);

const UF_BY_NAME: Record<string, string> = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE",
  "distrito federal": "DF", "espirito santo": "ES", goias: "GO", maranhao: "MA",
  "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG", para: "PA",
  paraiba: "PB", parana: "PR", pernambuco: "PE", piaui: "PI", "rio de janeiro": "RJ",
  "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO", roraima: "RR",
  "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
};

export function normalizeUF(raw: string): string | null {
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();
  if (UF_SET.has(upper)) return upper;
  return UF_BY_NAME[deaccent(trimmed.toLowerCase())] ?? null;
}

// --- Texto -------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  aacute: "á", agrave: "à", atilde: "ã", acirc: "â", auml: "ä",
  eacute: "é", egrave: "è", ecirc: "ê",
  iacute: "í", icirc: "î",
  oacute: "ó", ograve: "ò", otilde: "õ", ocirc: "ô",
  uacute: "ú", ucirc: "û", uuml: "ü", ccedil: "ç",
  Aacute: "Á", Agrave: "À", Atilde: "Ã", Acirc: "Â",
  Eacute: "É", Ecirc: "Ê", Iacute: "Í",
  Oacute: "Ó", Otilde: "Õ", Ocirc: "Ô", Uacute: "Ú", Ccedil: "Ç",
  sup2: "²", sup3: "³", ordm: "º", ordf: "ª", deg: "°", middot: "·",
  ndash: "–", mdash: "—", bull: "•", hellip: "…", laquo: "«", raquo: "»",
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeFromCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => safeFromCode(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (full, name: string) => NAMED_ENTITIES[name] ?? full);
}

function safeFromCode(code: number): string {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return "";
  return String.fromCodePoint(code);
}

export function clean(text: string): string {
  return decodeEntities(text).replace(/\s+/g, " ").trim();
}

export function deaccent(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "");
}

/** Trecho curto em volta do que casou, para o corretor conferir de onde veio. */
export function snippet(text: string, pattern: RegExp): string | undefined {
  const flat = deaccent(text.toLowerCase());
  const m = new RegExp(pattern.source, pattern.flags.replace("g", "")).exec(flat);
  if (!m) return text.slice(0, 100);
  const start = Math.max(0, m.index - 30);
  return text.slice(start, Math.min(text.length, m.index + m[0].length + 30)).trim();
}
