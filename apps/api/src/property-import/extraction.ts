import type { ImportFieldSource, PropertyCategory, PropertyPurpose } from "@nexlar/shared";
import {
  clean,
  deaccent,
  decodeEntities,
  normalizeUF,
  parseAreaBR,
  parseCount,
  parseMoneyBR,
  setNumber,
  snippet,
  type CanonicalExtraction,
  type Extracted,
} from "./canonical";
import { extractGalleryPhotos, extractPageText, scanPageText } from "./page-text";

/**
 * Extração da página do anúncio em duas fases.
 *
 * A primeira, aqui, lê o que o site declarou para o Google: JSON-LD, Open
 * Graph e os títulos e descrições empacotados. É a leitura mais confiável, e
 * por isso vem antes. A segunda (`page-text.ts`) lê o texto visível e só
 * preenche o que ficou em branco.
 *
 * Regra de prioridade da épica: ficha (JSON-LD) > og > título > descrição >
 * texto > URL. Cada valor sai com a fonte e uma evidência curta, para a
 * revisão do corretor e para a auditoria.
 */

export type { CanonicalExtraction, Extracted };
export { normalizeUF, parseAreaBR, parseMoneyBR };

type JsonNode = Record<string, unknown>;

// --- Entrada principal -------------------------------------------------------

export function extractFromHtml(html: string, pageUrl: string): CanonicalExtraction {
  const nodes = parseJsonLd(html);
  const metas = parseMetaTags(html);
  const out: CanonicalExtraction = { amenities: {}, photos: [] };

  // Nós de anúncio: nunca o nó da imobiliária (o endereço dele é da agência).
  const listingNodes = nodes.filter((n) => isListingNode(n));
  const actionNodes = nodes.filter((n) => hasType(n, "BuyAction", "RentAction", "LeaseAction"));
  const actionObjects = actionNodes
    .map((n) => n.object)
    .filter((o): o is JsonNode => isRecord(o));

  // Textos candidatos, na ordem de prioridade das fontes.
  const titleTexts: { text: string; source: ImportFieldSource }[] = [];
  for (const n of [...listingNodes, ...actionObjects]) {
    if (typeof n.name === "string") titleTexts.push({ text: clean(n.name), source: "ficha" });
  }
  if (metas.og["og:title"]) titleTexts.push({ text: clean(metas.og["og:title"]), source: "og" });
  if (metas.title) titleTexts.push({ text: clean(metas.title), source: "titulo" });

  const descTexts: { text: string; source: ImportFieldSource }[] = [];
  for (const n of listingNodes) {
    if (typeof n.description === "string")
      descTexts.push({ text: clean(n.description), source: "ficha" });
  }
  if (metas.og["og:description"])
    descTexts.push({ text: clean(metas.og["og:description"]), source: "og" });
  if (metas.description) descTexts.push({ text: clean(metas.description), source: "descricao" });

  const packedTexts = [...titleTexts, ...descTexts];

  // Título e descrição
  const rawTitle = titleTexts[0];
  if (rawTitle) {
    out.title = { value: stripSiteName(rawTitle.text), source: rawTitle.source };
  }
  const longestDesc = descTexts.slice().sort((a, b) => b.text.length - a.text.length)[0];
  if (longestDesc && longestDesc.text.length >= 20) {
    out.description = { value: longestDesc.text, source: longestDesc.source };
  }

  // Preço da ficha primeiro. O do texto vem depois, na segunda fase, e só se
  // aqui não veio nada: campo estruturado não se discute com parágrafo.
  const price = extractPrice(listingNodes, actionNodes);
  if (price) out.price = price;

  // Endereço: PostalAddress dos nós de anúncio + og customizado (padrão Mega).
  extractAddress(out, [...listingNodes, ...actionObjects], metas.og);

  // Finalidade e categoria/tipo: dicionário sobre URL + textos empacotados.
  const path = safePath(pageUrl);
  const haystacks: { text: string; source: ImportFieldSource }[] = [
    ...packedTexts,
    { text: path, source: "url" },
  ];
  const purpose = inferPurpose(haystacks);
  if (purpose) out.purpose = purpose;
  const categoryType = inferCategoryType(haystacks);
  if (categoryType) out.categoryType = categoryType;

  // Números empacotados (4 dormitórios, área total 1.505,00 m²...).
  extractPackedNumbers(out, packedTexts);

  // Código do anúncio: og:propertyRef > identifier da ficha > segmento da URL.
  const code = extractExternalCode(listingNodes, metas.og, path);
  if (code) out.externalCode = code;

  // Cidade/UF e bairro no padrão "Mairiporã / SP, bairro Recanto Ceu Azul".
  extractCityFromPacked(out, packedTexts);

  // Segunda fase: o texto visível preenche o que ficou em branco até aqui.
  scanPageText(out, extractPageText(html));

  // Fotos: contadas, não importadas (a importação de mídia é outra fatia).
  // A capa da ficha vem primeiro, e a galeria completa entra na sequência.
  const capa = extractPhotos(listingNodes, actionObjects, metas.ogAll);
  const galeria = extractGalleryPhotos(html, out.externalCode?.value);
  out.photos = [...new Set([...capa, ...galeria])];

  return out;
}

// --- JSON-LD -----------------------------------------------------------------

function parseJsonLd(html: string): JsonNode[] {
  const nodes: JsonNode[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(re)) {
    try {
      collectNodes(JSON.parse(match[1].trim()), nodes);
    } catch {
      // Bloco com JSON quebrado: ignora e segue para o próximo.
    }
  }
  return nodes;
}

function collectNodes(value: unknown, into: JsonNode[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectNodes(item, into);
    return;
  }
  if (!isRecord(value)) return;
  into.push(value);
  if (value["@graph"]) collectNodes(value["@graph"], into);
}

function isRecord(value: unknown): value is JsonNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function typesOf(node: JsonNode): string[] {
  const t = node["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  return [];
}

function hasType(node: JsonNode, ...types: string[]): boolean {
  const own = typesOf(node);
  return types.some((t) => own.includes(t));
}

/** Nó que descreve O IMÓVEL (nunca a imobiliária nem o site). */
function isListingNode(node: JsonNode): boolean {
  return hasType(
    node,
    "RealEstateListing",
    "Product",
    "Residence",
    "Apartment",
    "House",
    "SingleFamilyResidence",
    "Accommodation",
  );
}

// --- Preço -------------------------------------------------------------------

function extractPrice(listingNodes: JsonNode[], actionNodes: JsonNode[]): Extracted<number> | undefined {
  const candidates: { raw: unknown; evidence: string }[] = [];
  for (const node of listingNodes) {
    for (const offer of asArray(node.offers)) {
      if (isRecord(offer) && offer.price != null) {
        candidates.push({ raw: offer.price, evidence: `ficha: preço ${String(offer.price)}` });
      }
    }
  }
  for (const action of actionNodes) {
    if (action.price != null) {
      candidates.push({ raw: action.price, evidence: `ficha: preço ${String(action.price)}` });
    }
  }
  for (const { raw, evidence } of candidates) {
    const value = typeof raw === "number" ? raw : parseMoneyBR(String(raw));
    if (value != null && value > 0) return { value, source: "ficha", evidence };
  }
  return undefined;
}

// --- Endereço ----------------------------------------------------------------

function extractAddress(out: CanonicalExtraction, propertyNodes: JsonNode[], og: Record<string, string>): void {
  for (const node of propertyNodes) {
    const address = node.address;
    if (!isRecord(address)) continue;
    setText(out, "street", address.streetAddress, "ficha");
    setText(out, "neighborhood", address.addressSection ?? address.addressNeighborhood, "ficha");
    setText(out, "city", address.addressLocality, "ficha");
    if (typeof address.addressRegion === "string" && !out.state) {
      const uf = normalizeUF(address.addressRegion);
      if (uf) out.state = { value: uf, source: "ficha", evidence: clean(address.addressRegion) };
    }
    if (typeof address.postalCode === "string" && !out.zip) {
      const zip = normalizeCep(address.postalCode);
      if (zip) out.zip = { value: zip, source: "ficha" };
    }
  }

  // Padrão Mega: og customizado com o endereço aberto campo a campo.
  setText(out, "street", og["og:streetAddress"], "og");
  setText(out, "addressNumber", og["og:streetNumber"], "og");
  setText(out, "neighborhood", og["og:neighborhood"], "og");
  setText(out, "city", og["og:locality"], "og");
  if (og["og:state"] && !out.state) {
    const uf = normalizeUF(og["og:state"]);
    if (uf) out.state = { value: uf, source: "og", evidence: og["og:state"] };
  }
}

function normalizeCep(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/** "Chácara para Venda, Mairiporã / SP, bairro Recanto Ceu Azul, ..." */
function extractCityFromPacked(
  out: CanonicalExtraction,
  texts: { text: string; source: ImportFieldSource }[],
): void {
  for (const { text, source } of texts) {
    if (!out.city || !out.state) {
      const m = /(?:^|,)\s*([A-Za-zÀ-ú][A-Za-zÀ-ú\s.']{1,40}?)\s*\/\s*([A-Za-z]{2})(?=[\s,]|$)/.exec(text);
      if (m) {
        const uf = normalizeUF(m[2]);
        if (uf) {
          if (!out.city) out.city = { value: m[1].trim(), source, evidence: m[0].trim() };
          if (!out.state) out.state = { value: uf, source, evidence: m[0].trim() };
        }
      }
    }
    if (!out.neighborhood) {
      const m = /bairro\s+([A-Za-zÀ-ú0-9][^,.;|]{1,50})/i.exec(text);
      if (m) out.neighborhood = { value: m[1].trim(), source, evidence: m[0].trim() };
    }
  }
}

// --- Finalidade e categoria/tipo --------------------------------------------

function inferPurpose(
  haystacks: { text: string; source: ImportFieldSource }[],
): Extracted<PropertyPurpose> | undefined {
  for (const { text, source } of haystacks) {
    const flat = deaccent(text.toLowerCase());
    const rent = /aluguel|alugar|locacao|\/locacao\b/.test(flat);
    const sale = /venda|vender|comprar|a venda|\/venda\b/.test(flat);
    const season = /temporada/.test(flat);
    if (season) return { value: "temporada", source, evidence: snippet(text, /temporada/i) };
    if (rent && sale) return { value: "venda_locacao", source };
    if (rent) return { value: "locacao", source, evidence: snippet(text, /aluguel|alugar|locacao/i) };
    if (sale) return { value: "venda", source, evidence: snippet(text, /venda|comprar/i) };
  }
  return undefined;
}

/**
 * Dicionário DE/PARA de tipo, na ordem da especificidade: "cobertura duplex"
 * precisa casar cobertura antes de duplex, e "casa" fica por último porque
 * aparece em qualquer frase. Os pares apontam para o vocabulário REAL de
 * CATEGORY_TYPES, em português.
 */
const TYPE_KEYWORDS: ReadonlyArray<readonly [RegExp, PropertyCategory, string]> = [
  [/cobertura/, "residencial", "cobertura"],
  [/casa\s+(?:de\s+|em\s+)?condominio/, "residencial", "casa_condominio"],
  [/sobrado/, "residencial", "sobrado"],
  [/kitnet|kitinete|quitinete/, "residencial", "kitnet"],
  [/\bstudio\b|\bestudio\b/, "residencial", "studio"],
  [/\bflat\b/, "residencial", "flat"],
  [/\bloft\b/, "residencial", "loft"],
  [/triplex/, "residencial", "triplex"],
  [/duplex/, "residencial", "duplex"],
  [/apartamento|\bapto\b/, "residencial", "apartamento"],
  [/chacara/, "residencial", "chacara_residencial"],
  [/fazenda/, "rural", "fazenda"],
  [/\bsitio\b/, "rural", "sitio"],
  [/area rural/, "rural", "area_rural"],
  [/galpao/, "industrial", "galpao"],
  [/armazem/, "industrial", "armazem"],
  [/sala comercial|conjunto comercial/, "comercial", "sala_comercial"],
  [/ponto comercial/, "comercial", "ponto_comercial"],
  [/\bloja\b/, "comercial", "loja"],
  [/escritorio/, "comercial", "escritorio"],
  [/predio comercial/, "comercial", "predio_comercial"],
  [/\bhotel\b|pousada/, "comercial", "hotel_pousada"],
  [/lote\s+(?:em\s+|de\s+)?condominio/, "terreno", "lote_condominio"],
  [/terreno|\blote\b/, "terreno", "terreno_residencial"],
  [/lancamento/, "empreendimento", "lancamento"],
  [/loteamento/, "empreendimento", "loteamento"],
  [/\bcasa\b/, "residencial", "casa"],
];

function inferCategoryType(
  haystacks: { text: string; source: ImportFieldSource }[],
): Extracted<{ category: PropertyCategory; type: string }> | undefined {
  // Fonte primeiro, dicionário depois: o título que diz "Casa à venda" vence
  // a descrição que menciona "ponto comercial" de brinde. Dentro da MESMA
  // fonte vale a especificidade do dicionário (cobertura antes de duplex).
  for (const { text, source } of haystacks) {
    const flat = deaccent(text.toLowerCase());
    for (const [pattern, category, type] of TYPE_KEYWORDS) {
      if (pattern.test(flat)) {
        return { value: { category, type }, source, evidence: snippet(text, pattern) };
      }
    }
  }
  return undefined;
}

// --- Números empacotados -----------------------------------------------------

const PACKED_PATTERNS: ReadonlyArray<
  readonly [keyof CanonicalExtraction & string, RegExp, (raw: string) => number | null]
> = [
  ["bedrooms", /(\d{1,2})\s*(?:quartos?|dormitorios?|dorms?\b)/, parseCount],
  ["suites", /(\d{1,2})\s*suites?/, parseCount],
  ["bathrooms", /(\d{1,2})\s*banheiros?/, parseCount],
  ["parkingSpots", /(\d{1,2})\s*(?:vagas?|garagens?)/, parseCount],
  ["totalArea", /area total[^\d]{0,16}([\d.,]+)\s*m/, parseAreaBR],
  ["builtArea", /area construida[^\d]{0,16}([\d.,]+)\s*m/, parseAreaBR],
  ["privateArea", /area privativa[^\d]{0,16}([\d.,]+)\s*m/, parseAreaBR],
  ["usableArea", /area util[^\d]{0,16}([\d.,]+)\s*m/, parseAreaBR],
  ["lotArea", /area do terreno[^\d]{0,16}([\d.,]+)\s*m/, parseAreaBR],
];

function extractPackedNumbers(
  out: CanonicalExtraction,
  texts: { text: string; source: ImportFieldSource }[],
): void {
  for (const { text, source } of texts) {
    const flat = deaccent(text.toLowerCase());
    for (const [key, pattern, parse] of PACKED_PATTERNS) {
      if (out[key]) continue;
      const m = pattern.exec(flat);
      if (!m) continue;
      const value = parse(m[1]);
      if (value == null) continue;
      (out as unknown as Record<string, unknown>)[key] = {
        value,
        source,
        evidence: snippet(text, pattern),
      } satisfies Extracted<number>;
    }
    // Área sem rótulo, só se nenhuma área rotulada apareceu neste texto.
    if (!out.totalArea && !out.builtArea && !out.privateArea && !out.usableArea && !out.genericArea) {
      const m = /([\d.,]+)\s*m(?:²|2\b)/.exec(flat);
      if (m) {
        const value = parseAreaBR(m[1]);
        if (value != null) out.genericArea = { value, source, evidence: snippet(text, /m[²2]/) };
      }
    }
  }
}

// --- Código externo e fotos --------------------------------------------------

function extractExternalCode(
  listingNodes: JsonNode[],
  og: Record<string, string>,
  path: string,
): Extracted<string> | undefined {
  if (og["og:propertyRef"]) {
    return { value: clean(og["og:propertyRef"]).slice(0, 80), source: "og" };
  }
  for (const node of listingNodes) {
    for (const key of ["identifier", "sku", "productID"] as const) {
      const raw = node[key];
      if (typeof raw === "string" && raw.trim().length >= 3) {
        return { value: clean(raw).slice(0, 80), source: "ficha" };
      }
    }
  }
  // Último segmento da URL com cara de código: "2573040", "9430", "CA0979".
  const segments = path.split("/").filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i--) {
    if (/^[A-Za-z]{0,4}\d{3,8}$/.test(segments[i])) {
      return { value: segments[i].toUpperCase(), source: "url", evidence: `/${segments[i]}` };
    }
  }
  return undefined;
}

function extractPhotos(
  listingNodes: JsonNode[],
  actionObjects: JsonNode[],
  ogAll: { key: string; value: string }[],
): string[] {
  const urls = new Set<string>();
  const push = (raw: unknown) => {
    if (typeof raw === "string" && /^https?:\/\//i.test(raw)) urls.add(raw.trim());
    else if (isRecord(raw) && typeof raw.url === "string") push(raw.url);
  };
  for (const node of [...listingNodes, ...actionObjects]) {
    for (const image of asArray(node.image)) push(image);
  }
  for (const { key, value } of ogAll) {
    if (key === "og:image" || key === "og:image:url") push(value);
  }
  return [...urls];
}

// --- Meta tags ---------------------------------------------------------------

interface MetaTags {
  og: Record<string, string>;
  ogAll: { key: string; value: string }[];
  title?: string;
  description?: string;
}

function parseMetaTags(html: string): MetaTags {
  const og: Record<string, string> = {};
  const ogAll: { key: string; value: string }[] = [];
  // property/name antes ou depois do content: os dois layouts existem por aí.
  const metaRe = /<meta\s+[^>]*?>/gi;
  for (const tag of html.match(metaRe) ?? []) {
    const key =
      /(?:property|name)=["']((?:og|twitter):[\w:.-]+)["']/i.exec(tag)?.[1] ?? null;
    const value = /content=["']([^"']*)["']/i.exec(tag)?.[1] ?? null;
    if (key && value) {
      const decoded = decodeEntities(value);
      ogAll.push({ key, value: decoded });
      if (!(key in og)) og[key] = decoded;
    }
  }
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const description = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1]
    ?? /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i.exec(html)?.[1];
  return {
    og,
    ogAll,
    title: title ? clean(title) : undefined,
    description: description ? clean(description) : undefined,
  };
}

// --- Utilitários -------------------------------------------------------------

/** Tira o "| Nome do Site" ou "- Nome do Site" do fim, se sobrar título de verdade. */
function stripSiteName(title: string): string {
  const cut = title.replace(/\s*[|]\s*[^|]{2,60}$/, "");
  if (cut.length >= 10 && cut !== title) return cut.trim();
  const dash = title.replace(/\s+-\s+[^-]{2,40}$/, "");
  return dash.length >= 10 ? dash.trim() : title;
}

function setText(
  out: CanonicalExtraction,
  key: "street" | "addressNumber" | "neighborhood" | "city",
  raw: unknown,
  source: ImportFieldSource,
): void {
  if (out[key]) return;
  if (typeof raw !== "string") return;
  const value = clean(raw);
  if (value.length < 1 || value.length > 200) return;
  out[key] = { value, source };
}

function asArray(value: unknown): unknown[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function safePath(pageUrl: string): string {
  try {
    return new URL(pageUrl).pathname;
  } catch {
    return "";
  }
}
