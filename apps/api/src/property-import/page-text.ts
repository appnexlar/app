import type { CanonicalExtraction, Extracted } from "./canonical";
import {
  clean,
  deaccent,
  parseAreaBR,
  parseCount,
  parseMoneyBR,
  setNumber,
} from "./canonical";

/**
 * Fatia B: o que está ESCRITO na página.
 *
 * A fase estruturada (JSON-LD e Open Graph) resolve os sites que marcam bem o
 * anúncio. Os outros escrevem tudo na tela: "Aluguel R$ 23.000,00", "IPTU",
 * "Condomínio", "5 quartos", "800 m² total", e uma lista de características em
 * chips. Aqui essa leitura acontece, sempre determinística: recorte do texto,
 * dicionário e expressão regular, nenhuma IA.
 *
 * Duas regras de segurança sustentam o resto:
 *
 * 1. O texto é cortado no primeiro bloco de "imóveis similares". Toda página de
 *    anúncio termina com outros anúncios, e o preço deles é o erro mais caro
 *    que essa leitura poderia cometer.
 * 2. Nada aqui sobrescreve o que a ficha já disse. O texto só preenche buraco,
 *    e sai marcado com a fonte "texto", que o mapper trata como mais fraca.
 */

export interface PageText {
  /** Pedaços visíveis na ordem da página, já sem o rodapé de outros anúncios. */
  segments: string[];
  /** Os mesmos pedaços unidos por " | ", para casar rótulo com valor ao lado. */
  text: string;
  /** O mesmo texto sem acento e em minúsculas: é nele que as regex rodam. */
  flat: string;
}

/** Onde termina o anúncio e começa a vitrine do site. */
const FIM_DO_ANUNCIO =
  /(imoveis|imóveis|anuncios|anúncios|opcoes|opções)\s+(similares|semelhantes|relacionados|parecidos)|voce tambem pode gostar|você também pode gostar|veja tambem|veja também|busque outros imoveis|busque outros imóveis|outros imoveis (que|para)|imoveis recomendados/i;

/** Teto de texto examinado: página gigante não pode virar CPU parada. */
const MAX_SEGMENTOS = 4000;

export function extractPageText(html: string): PageText {
  const limpo = html
    .replace(/<(script|style|noscript|template|svg|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, "");

  const segments: string[] = [];
  for (const bruto of limpo.split(/<[^>]*>/)) {
    const texto = clean(bruto);
    if (!texto) continue;
    if (FIM_DO_ANUNCIO.test(texto)) break;
    segments.push(texto);
    if (segments.length >= MAX_SEGMENTOS) break;
  }

  const text = segments.join(" | ");
  return { segments, text, flat: deaccent(text.toLowerCase()) };
}

// --- Leitura ------------------------------------------------------------------

export function scanPageText(out: CanonicalExtraction, page: PageText): void {
  lerValores(out, page);
  lerContagens(out, page);
  lerAreas(out, page);
  lerCaracteristicas(out, page);
}

// --- Preço, condomínio e IPTU -------------------------------------------------

/**
 * Rótulos que aparecem colados a um valor mas NÃO são o preço do imóvel. O
 * "Total" da soma aluguel + IPTU + condomínio é o mais perigoso: é o número
 * maior e o mais próximo do preço na tela.
 */
const NAO_E_PRECO =
  /total|iptu|condomin|seguro|taxa|financia|entrada|parcela|desconto|multa|caucao|deposito|renda|m2|metro/;

const PRECO_LABEL = /(alugu[e]l|locacao|venda|valor|preco)([^\d]{0,20})([\d][\d.,]*)/g;
/** Mesma forma de três grupos do preço: rótulo, meio e valor. */
const CUSTO_LABEL = (rotulo: string) =>
  new RegExp(`(${rotulo})([^\\d]{0,20})([\\d][\\d.,]*)`, "g");

function lerValores(out: CanonicalExtraction, page: PageText): void {
  if (!out.price) {
    const preco = primeiroValor(page, PRECO_LABEL, {
      min: 100,
      recusar: (rotulo, meio) => NAO_E_PRECO.test(rotulo) || NAO_E_PRECO.test(meio),
    });
    if (preco) setNumber(out, "price", preco);
  }
  if (!out.condoFee) {
    const condo = primeiroValor(page, CUSTO_LABEL("condomin[ií]o"), { min: 1 });
    if (condo) setNumber(out, "condoFee", condo);
  }
  if (!out.iptu) {
    const iptu = primeiroValor(page, CUSTO_LABEL("iptu"), { min: 1 });
    if (iptu) setNumber(out, "iptu", iptu);
  }
}

/**
 * Percorre TODAS as ocorrências e devolve a primeira que vira um número de
 * verdade. Percorrer em vez de olhar só a primeira é o que faz o chip
 * "Condomínio" da lista de comodidades ser pulado em favor do
 * "Condomínio R$ 3.500,00" que aparece depois, no quadro de valores.
 */
function primeiroValor(
  page: PageText,
  pattern: RegExp,
  opcoes: { min: number; recusar?: (rotulo: string, meio: string) => boolean },
): Extracted<number> | undefined {
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  for (const m of page.flat.matchAll(re)) {
    const [tudo, rotulo, meio, bruto] = m;
    if (opcoes.recusar?.(rotulo, meio ?? "")) continue;
    const value = parseMoneyBR(bruto);
    if (value == null || value < opcoes.min) continue;
    return { value, source: "texto", evidence: trechoDe(page, m.index ?? 0, tudo.length) };
  }
  return undefined;
}

function trechoDe(page: PageText, index: number, length: number): string {
  const start = Math.max(0, index - 20);
  return page.text.slice(start, Math.min(page.text.length, index + length + 20)).trim();
}

// --- Contagem de cômodos ------------------------------------------------------

/**
 * O plural aceita um espaço no meio ("5 quarto s") porque muito site quebra a
 * palavra em dois elementos para estilizar o número, e a remoção das tags
 * deixa a costura à mostra.
 */
const CONTAGENS: ReadonlyArray<readonly ["bedrooms" | "suites" | "bathrooms" | "halfBaths" | "livingRooms" | "parkingSpots", string]> = [
  ["bedrooms", "(?:quarto|dormitorio|dorm|qto)"],
  ["suites", "suite"],
  ["bathrooms", "(?:banheiro|wc|lavabo e banheiro)"],
  ["halfBaths", "lavabo"],
  ["livingRooms", "sala"],
  ["parkingSpots", "(?:vaga|garagem)"],
];

function lerContagens(out: CanonicalExtraction, page: PageText): void {
  for (const [key, palavra] of CONTAGENS) {
    if (out[key]) continue;
    // Duas ordens, porque as duas existem: "5 quartos" e "Qtos | 5".
    const numeroAntes = new RegExp(`(\\d{1,2})\\s*${palavra}\\s?s?\\b`);
    const numeroDepois = new RegExp(`${palavra}\\s?s?\\s*[|:]\\s*(\\d{1,2})\\b`);
    const m = numeroAntes.exec(page.flat) ?? numeroDepois.exec(page.flat);
    if (!m) continue;
    const value = parseCount(m[1]);
    if (value == null) continue;
    setNumber(out, key, {
      value,
      source: "texto",
      evidence: trechoDe(page, m.index, m[0].length),
    });
  }
}

// --- Áreas --------------------------------------------------------------------

const AREAS: ReadonlyArray<
  readonly ["totalArea" | "builtArea" | "privateArea" | "usableArea" | "lotArea", string]
> = [
  ["totalArea", "area total"],
  ["builtArea", "area construida"],
  ["privateArea", "area privativa"],
  ["usableArea", "area util"],
  ["lotArea", "area do terreno"],
];

function lerAreas(out: CanonicalExtraction, page: PageText): void {
  for (const [key, rotulo] of AREAS) {
    if (out[key]) continue;
    // A unidade é obrigatória. Sem ela, "Terreno Frente: 20,00" viraria uma
    // área de 20 m², quando na verdade são 20 metros de frente do lote.
    const rotuloAntes = new RegExp(`${rotulo}[^\\d]{0,16}([\\d][\\d.,]*)\\s*m`);
    // "800 m² total": o rótulo vem depois da medida, padrão de site novo.
    const rotuloDepois = new RegExp(`([\\d][\\d.,]*)\\s*m[²2]\\s*${rotulo.replace("area ", "")}`);
    const m = rotuloAntes.exec(page.flat) ?? rotuloDepois.exec(page.flat);
    if (!m) continue;
    const value = parseAreaBR(m[1]);
    if (value == null) continue;
    setNumber(out, key, {
      value,
      source: "texto",
      evidence: trechoDe(page, m.index, m[0].length),
    });
  }
}

// --- Características de sim ou não --------------------------------------------

/**
 * DE/PARA das comodidades listadas em chips. A chave é a mesma de
 * DETAIL_FIELDS; o mapper descarta as que não valem para a categoria.
 */
const AMENIDADES: ReadonlyArray<readonly [string, RegExp]> = [
  ["pool", /^piscina( (privativa|aquecida|adulto|infantil))?$/],
  ["barbecue", /^churrasqueira$/],
  ["balcony", /^(varanda|sacada|varanda gourmet|terraco)$/],
  ["elevator", /^elevador(es)?$/],
  ["furnished", /^(mobiliado|mobiliada|mobilia|mobilias|semimobiliado|semimobiliada)$/],
  ["serviceArea", /^area de servico$/],
  ["serviceRoom", /^(dependencia (de servico|completa)|quarto de empregada|dce)$/],
  ["office", /^(escritorio|home office)$/],
  ["garden", /^jardim$/],
  ["gatedCommunity", /^condominio fechado$/],
  ["acceptsPets", /^(aceita pets|pet friendly|aceita animais)$/],
];

/** Chip é rótulo curto. Frase é prosa, e prosa mente ("não tem piscina"). */
const MAX_CHIP = 30;
const NEGACAO = /\b(sem|nao|nenhum|nenhuma)\b/;

function lerCaracteristicas(out: CanonicalExtraction, page: PageText): void {
  for (const bruto of page.segments) {
    if (bruto.length > MAX_CHIP) continue;
    // "1 escritório" e "2 varandas" são chips com contador na frente.
    const chip = deaccent(bruto.toLowerCase()).replace(/^[\d\s.:|-]+/, "").trim();
    if (!chip || NEGACAO.test(chip)) continue;
    // O singular entra junto: o site escreve tanto "Varanda" quanto "Varandas".
    const formas = chip.endsWith("s") && chip.length > 4 ? [chip, chip.slice(0, -1)] : [chip];
    for (const [key, pattern] of AMENIDADES) {
      if (out.amenities[key]) continue;
      if (formas.some((forma) => pattern.test(forma))) {
        out.amenities[key] = { value: true, source: "texto", evidence: bruto };
      }
    }
  }
}

// --- Fotos --------------------------------------------------------------------

/** Imagem que é enfeite do site, não foto do imóvel. */
const NAO_E_FOTO =
  /logo|favicon|icone|icon|sprite|placeholder|avatar|banner|selo|whats|facebook|instagram|youtube|pixel|watermark|marca-?dagua|no-?image|sem-?foto|\/site\/uploads\//i;

const MAX_FOTOS = 60;

/**
 * A URL sem os trechos ilegíveis (identificador assinado, hash, base64). Sem
 * isso, um "icon" ou um "logo" que aparece por acaso no meio de um token de
 * 200 caracteres derrubaria a foto de verdade.
 */
function legivel(url: string): string {
  return url.replace(/[A-Za-z0-9+/=_-]{20,}/g, "/");
}

/**
 * Fotos da galeria.
 *
 * O JSON-LD costuma trazer uma foto só (a de capa), e a galeria de verdade
 * mora nos `img` ou dentro do JSON que o site embute na página. Pegar toda
 * imagem da página traria os anúncios vizinhos junto, então as candidatas são
 * agrupadas pelo caminho e vence o maior grupo: as fotos de um mesmo anúncio
 * sempre moram na mesma pasta do CDN. Quando o código do anúncio aparece no
 * caminho, ele decide sozinho, que é sinal mais forte que qualquer contagem.
 */
export function extractGalleryPhotos(html: string, externalCode?: string): string[] {
  const brutas = html.match(/https?:\/\/[^\s"'<>\\)]+?\.(?:jpg|jpeg|png|webp)/gi) ?? [];
  const candidatas: string[] = [];
  const vistas = new Set<string>();
  for (const bruta of brutas) {
    const url = bruta.replace(/&amp;/g, "&");
    if (NAO_E_FOTO.test(legivel(url)) || vistas.has(url)) continue;
    vistas.add(url);
    candidatas.push(url);
  }
  if (candidatas.length === 0) return [];

  if (externalCode && externalCode.length >= 3) {
    const marca = `/${externalCode.toLowerCase()}/`;
    const doAnuncio = candidatas.filter((u) => u.toLowerCase().includes(marca));
    if (doAnuncio.length >= 3) return doAnuncio.slice(0, MAX_FOTOS);
  }

  // Do caminho mais específico para o mais raso, para na primeira pasta que
  // parece galeria. Site que assina a URL inteira (cada foto num caminho só
  // dela) só se revela um nível acima.
  for (let manter = 8; manter >= 1; manter--) {
    const grupos = new Map<string, string[]>();
    for (const url of candidatas) {
      const chave = prefixo(url, manter);
      grupos.set(chave, [...(grupos.get(chave) ?? []), url]);
    }
    const maior = [...grupos.values()].sort((a, b) => b.length - a.length)[0];
    if (maior && maior.length >= 4) return maior.slice(0, MAX_FOTOS);
  }
  return candidatas.slice(0, MAX_FOTOS);
}

function prefixo(url: string, segmentos: number): string {
  try {
    const { origin, pathname } = new URL(url);
    const partes = pathname.split("/").filter(Boolean).slice(0, -1);
    return `${origin}/${partes.slice(0, segmentos).join("/")}`;
  } catch {
    return url;
  }
}
