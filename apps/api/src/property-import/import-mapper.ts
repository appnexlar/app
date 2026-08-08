import {
  CATEGORY_DETAILS_SCHEMAS,
  DETAIL_FIELDS,
  type CreatePropertyDto,
  type ImportedField,
  type ImportSummaryCounts,
  type PropertyCategory,
  type PropertyPurpose,
  type UpdatePropertyDto,
} from "@nexlar/shared";
import type { CanonicalExtraction, Extracted } from "./extraction";

/**
 * Do canônico extraído para o modelo real da Nexlar: os DTOs que o serviço de
 * imóveis já valida (nada entra no banco por fora), mais a lista campo a campo
 * que o corretor vê no resumo. Valores que o sistema precisou chutar para o
 * rascunho nascer (origem, finalidade ausente, categoria deduzida fraca) saem
 * marcados como "revisar", nunca como "encontrado".
 */

export interface MappedImport {
  createDto: CreatePropertyDto;
  updateDto: UpdatePropertyDto;
  fields: ImportedField[];
  summary: ImportSummaryCounts;
  photosFound: number;
  /** Quantos campos vieram de verdade da página (base do corte "sem dados"). */
  foundCount: number;
}

const PURPOSE_LABELS: Record<PropertyPurpose, string> = {
  venda: "Venda",
  locacao: "Locação",
  venda_locacao: "Venda e locação",
  temporada: "Temporada",
};

const CATEGORY_LABELS: Record<PropertyCategory, string> = {
  residencial: "Residencial",
  comercial: "Comercial",
  industrial: "Industrial",
  terreno: "Terreno",
  rural: "Rural",
  empreendimento: "Empreendimento",
};

/** Rótulos de tipo para o resumo (os slugs perdem os acentos). */
const TYPE_LABELS: Record<string, string> = {
  casa: "Casa",
  apartamento: "Apartamento",
  casa_condominio: "Casa de condomínio",
  cobertura: "Cobertura",
  studio: "Studio",
  kitnet: "Kitnet",
  sobrado: "Sobrado",
  flat: "Flat",
  loft: "Loft",
  duplex: "Duplex",
  triplex: "Triplex",
  chacara_residencial: "Chácara",
  fazenda: "Fazenda",
  sitio: "Sítio",
  chacara: "Chácara",
  area_rural: "Área rural",
  galpao: "Galpão",
  armazem: "Armazém",
  fabrica: "Fábrica",
  centro_distribuicao: "Centro de distribuição",
  area_industrial: "Área industrial",
  sala_comercial: "Sala comercial",
  loja: "Loja",
  ponto_comercial: "Ponto comercial",
  escritorio: "Escritório",
  predio_comercial: "Prédio comercial",
  clinica_consultorio: "Clínica ou consultório",
  hotel_pousada: "Hotel ou pousada",
  terreno_residencial: "Terreno",
  terreno_comercial: "Terreno comercial",
  terreno_industrial: "Terreno industrial",
  lote_condominio: "Lote em condomínio",
  area_incorporacao: "Área de incorporação",
  lancamento: "Lançamento",
  unidade_construcao: "Unidade em construção",
  unidade_pronta: "Unidade pronta",
  loteamento: "Loteamento",
};

const moneyBR = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numberBR = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

export function mapExtraction(
  canonical: CanonicalExtraction,
  ctx: { url: string; domain: string },
): MappedImport {
  const fields: ImportedField[] = [];

  // --- Identificação (etapa 1 do wizard) -----------------------------------
  const title = canonical.title?.value.slice(0, 160);
  const titleOk = !!title && title.length >= 3;
  if (titleOk) {
    push(fields, "title", "Título", canonical.title, title);
  } else {
    fields.push({
      key: "title",
      label: "Título",
      state: "revisar",
      value: "Não encontramos: demos um título provisório",
      source: null,
    });
  }

  const purpose: PropertyPurpose = canonical.purpose?.value ?? "venda";
  push(
    fields,
    "purpose",
    "Finalidade",
    canonical.purpose,
    PURPOSE_LABELS[purpose],
    canonical.purpose ? undefined : "revisar",
  );

  const category: PropertyCategory = canonical.categoryType?.value.category ?? "residencial";
  const type = canonical.categoryType?.value.type ?? "casa";
  push(
    fields,
    "type",
    "Categoria e tipo",
    canonical.categoryType,
    `${CATEGORY_LABELS[category]} · ${TYPE_LABELS[type] ?? type}`,
    canonical.categoryType ? undefined : "revisar",
  );

  // A origem é relação comercial, não dado do anúncio: sempre é o corretor
  // quem diz como o imóvel chegou até ele.
  fields.push({
    key: "origin",
    label: "Origem",
    state: "revisar",
    value: "Confirme como o imóvel chegou até você",
    source: null,
  });

  const createDto: CreatePropertyDto = {
    title: titleOk ? (title as string) : `Imóvel importado de ${ctx.domain}`,
    purpose,
    category,
    type,
    origin: "outro",
    externalCode: canonical.externalCode?.value,
    externalLink: ctx.url.length <= 500 ? ctx.url : undefined,
  };

  // --- Valores ---------------------------------------------------------------
  const updateDto: UpdatePropertyDto = {};
  const priceLabel = purpose === "venda" || purpose === "venda_locacao" ? "Preço de venda" : "Valor da locação";
  if (canonical.price) {
    if (purpose === "locacao" || purpose === "temporada") updateDto.rentPrice = canonical.price.value;
    else updateDto.salePrice = canonical.price.value;
    push(fields, "price", priceLabel, canonical.price, moneyBR.format(canonical.price.value));
  } else {
    missing(fields, "price", priceLabel);
  }

  // --- Endereço --------------------------------------------------------------
  mapText(fields, updateDto, "street", "Rua", canonical.street, 200);
  mapText(fields, updateDto, "addressNumber", "Número", canonical.addressNumber, 20);
  mapText(fields, updateDto, "neighborhood", "Bairro", canonical.neighborhood, 120);
  mapText(fields, updateDto, "city", "Cidade", canonical.city, 120);
  if (canonical.state) {
    updateDto.state = canonical.state.value;
    push(fields, "state", "UF", canonical.state, canonical.state.value);
  }
  if (canonical.zip) {
    updateDto.zip = canonical.zip.value;
    push(fields, "zip", "CEP", canonical.zip, canonical.zip.value);
  }
  if (!canonical.city) missing(fields, "city", "Cidade");
  if (!canonical.neighborhood) missing(fields, "neighborhood", "Bairro");

  // --- Características (details, validadas pela categoria) -------------------
  const allowedKeys = new Set(DETAIL_FIELDS[category].map((f) => f.key));
  const details: Record<string, number> = {};
  const numeric: Array<{
    key: string;
    label: string;
    extracted?: Extracted<number>;
    relevant: boolean;
  }> = [
    { key: "bedrooms", label: "Quartos", extracted: canonical.bedrooms, relevant: category === "residencial" },
    { key: "suites", label: "Suítes", extracted: canonical.suites, relevant: false },
    { key: "bathrooms", label: "Banheiros", extracted: canonical.bathrooms, relevant: category === "residencial" },
    { key: "parkingSpots", label: "Vagas", extracted: canonical.parkingSpots, relevant: category === "residencial" },
    { key: "totalArea", label: "Área total", extracted: canonical.totalArea, relevant: false },
    { key: "builtArea", label: "Área construída", extracted: canonical.builtArea, relevant: false },
    { key: "privateArea", label: "Área privativa", extracted: canonical.privateArea, relevant: false },
    { key: "usableArea", label: "Área útil", extracted: canonical.usableArea, relevant: false },
    { key: "lotArea", label: "Área do terreno", extracted: canonical.lotArea, relevant: false },
  ];

  let anyArea = false;
  for (const { key, label, extracted, relevant } of numeric) {
    const isArea = key.endsWith("Area");
    if (extracted && allowedKeys.has(key)) {
      details[key] = extracted.value;
      if (isArea) anyArea = true;
      push(fields, `details.${key}`, label, extracted, isArea ? `${numberBR.format(extracted.value)} m²` : String(extracted.value));
    } else if (relevant) {
      missing(fields, `details.${key}`, label);
    }
  }
  // Área sem rótulo: entra como área total, mas marcada para o corretor conferir.
  if (!anyArea && canonical.genericArea && allowedKeys.has("totalArea")) {
    details.totalArea = canonical.genericArea.value;
    anyArea = true;
    push(
      fields,
      "details.totalArea",
      "Área total",
      canonical.genericArea,
      `${numberBR.format(canonical.genericArea.value)} m²`,
      "revisar",
    );
  }
  if (!anyArea) missing(fields, "details.area", "Área");

  if (Object.keys(details).length > 0) {
    const parsed = CATEGORY_DETAILS_SCHEMAS[category].safeParse(details);
    if (parsed.success) updateDto.details = parsed.data as Record<string, unknown>;
  }

  // --- Descrição, código e fotos --------------------------------------------
  if (canonical.description) {
    updateDto.description = canonical.description.value.slice(0, 8000);
    push(
      fields,
      "description",
      "Descrição",
      canonical.description,
      `${canonical.description.value.slice(0, 80)}…`,
    );
  } else {
    missing(fields, "description", "Descrição");
  }

  if (canonical.externalCode) {
    push(fields, "externalCode", "Código do anúncio", canonical.externalCode, canonical.externalCode.value);
  }

  const photosFound = canonical.photos.length;
  if (photosFound > 0) {
    fields.push({
      key: "photos",
      label: "Fotos do anúncio",
      state: "revisar",
      value: `${photosFound} encontrada${photosFound > 1 ? "s" : ""} · a importação de fotos chega na próxima versão`,
      source: "ficha",
    });
  } else {
    missing(fields, "photos", "Fotos");
  }

  const summary: ImportSummaryCounts = {
    found: fields.filter((f) => f.state === "encontrado").length,
    review: fields.filter((f) => f.state === "revisar").length,
    missing: fields.filter((f) => f.state === "nao_encontrado").length,
  };

  return { createDto, updateDto, fields, summary, photosFound, foundCount: summary.found };
}

// --- Auxiliares --------------------------------------------------------------

function push(
  fields: ImportedField[],
  key: string,
  label: string,
  extracted: Extracted<unknown> | undefined,
  display?: string,
  forceState?: "revisar",
): void {
  if (!extracted && !forceState) {
    if (display === undefined) missing(fields, key, label);
    return;
  }
  fields.push({
    key,
    label,
    state: forceState ?? "encontrado",
    value: display ?? (extracted ? String(extracted.value) : null),
    source: extracted?.source ?? null,
    evidence: extracted?.evidence ?? null,
  });
}

function missing(fields: ImportedField[], key: string, label: string): void {
  fields.push({ key, label, state: "nao_encontrado", value: null, source: null });
}

function mapText(
  fields: ImportedField[],
  updateDto: UpdatePropertyDto,
  key: "street" | "addressNumber" | "neighborhood" | "city",
  label: string,
  extracted: Extracted<string> | undefined,
  max: number,
): void {
  // Ausência de rua/número não vira item da lista: muito site esconde o
  // endereço exato de propósito. Cidade e bairro ausentes são tratados
  // pelo chamador, porque esses fazem falta de verdade.
  if (!extracted) return;
  const value = extracted.value.slice(0, max);
  updateDto[key] = value;
  push(fields, key, label, extracted, value);
}
