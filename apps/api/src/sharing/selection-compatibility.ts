import type { SelectionCompatibility } from "@nexlar/shared";
import type { LeadPreference, Property } from "@prisma/client";

/**
 * Compatibilidade entre um imóvel e as preferências da lead.
 *
 * Regras determinísticas e explicáveis, sem porcentagem mágica: cada critério
 * que a preferência DEFINE é avaliado como atende ou não atende, e o veredito
 * sai da combinação. Critério não preenchido não conta a favor nem contra.
 *
 *   fora_do_perfil  finalidade incompatível, ou preço acima da faixa em
 *                   mais de 20%
 *   alta            todos os critérios definidos atendem
 *   media           o preço atende e pelo menos metade dos demais atende
 *   baixa           o resto
 *
 * O retorno explica o porquê nas duas direções: `atende` e `ressalvas` viram
 * texto na interface, para o corretor confiar no selo em vez de decorar regra.
 */

export interface CompatibilityVerdict {
  level: SelectionCompatibility;
  atende: string[];
  ressalvas: string[];
}

/** Tolerância acima do teto de preço antes de considerar fora do perfil. */
const FOLGA_DE_PRECO = 1.2;

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

/** Números validados do details (Json) do imóvel. */
function detalhes(p: Property): {
  bedrooms: number | null;
  bathrooms: number | null;
  parkingSpots: number | null;
  area: number | null;
} {
  const raw = (p.details ?? {}) as Record<string, unknown>;
  const numero = (chave: string): number | null => {
    const v = raw[chave];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  return {
    bedrooms: numero("bedrooms"),
    bathrooms: numero("bathrooms"),
    parkingSpots: numero("parkingSpots"),
    area: numero("builtArea") ?? numero("totalArea"),
  };
}

/** Preço relevante para a finalidade procurada. */
function precoDoImovel(p: Property, procura: LeadPreference["purpose"]): number | null {
  if (procura === "locacao" || procura === "temporada") {
    return p.rentPrice != null ? Number(p.rentPrice) : null;
  }
  if (procura === "venda") return p.salePrice != null ? Number(p.salePrice) : null;
  // Sem finalidade definida: usa o que o imóvel tiver.
  if (p.salePrice != null) return Number(p.salePrice);
  return p.rentPrice != null ? Number(p.rentPrice) : null;
}

/** O imóvel serve para a finalidade procurada? venda_locacao serve às duas. */
function finalidadeCompativel(pref: LeadPreference["purpose"], p: Property): boolean {
  if (!pref) return true;
  if (p.purpose === "venda_locacao") return pref === "venda" || pref === "locacao";
  return p.purpose === pref;
}

const normalizar = (s: string): string =>
  s
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();

function contem(lista: string[], valor: string | null): boolean {
  if (!valor) return false;
  const alvo = normalizar(valor);
  return lista.some((item) => normalizar(item) === alvo);
}

/**
 * Sem preferências (ou sem nenhum critério preenchido) não há o que julgar:
 * devolve nulo e a interface mostra o card sem selo.
 */
export function avaliarCompatibilidade(
  pref: LeadPreference | null,
  property: Property,
): CompatibilityVerdict | null {
  if (!pref) return null;

  const d = detalhes(property);
  const preco = precoDoImovel(property, pref.purpose);
  const atende: string[] = [];
  const ressalvas: string[] = [];

  // Fora do perfil: finalidade errada encerra a conversa.
  if (pref.purpose && !finalidadeCompativel(pref.purpose, property)) {
    return {
      level: "fora_do_perfil",
      atende: [],
      ressalvas: [pref.purpose === "venda" ? "A lead procura compra, e este imóvel é só locação" : "A finalidade do imóvel não é a que a lead procura"],
    };
  }

  // Cada bloco só avalia se a preferência definiu o critério.
  let criterios = 0;
  let atendidos = 0;
  const avaliar = (definido: boolean, ok: boolean, simTexto: string, naoTexto: string): void => {
    if (!definido) return;
    criterios += 1;
    if (ok) {
      atendidos += 1;
      atende.push(simTexto);
    } else {
      ressalvas.push(naoTexto);
    }
  };

  // Preço: o critério âncora.
  const teto = pref.priceMax != null ? Number(pref.priceMax) : null;
  const piso = pref.priceMin != null ? Number(pref.priceMin) : null;
  const temFaixa = teto != null || piso != null;
  let precoOk = false;
  if (temFaixa) {
    if (preco == null) {
      criterios += 1;
      ressalvas.push("Imóvel sem preço para comparar com a faixa da lead");
    } else if (teto != null && preco > teto * FOLGA_DE_PRECO) {
      return {
        level: "fora_do_perfil",
        atende: [],
        ressalvas: [`Preço ${BRL.format(preco)} mais de 20% acima do teto de ${BRL.format(teto)}`],
      };
    } else {
      precoOk = (teto == null || preco <= teto) && (piso == null || preco >= piso);
      avaliar(
        true,
        precoOk,
        "Dentro da faixa de preço",
        teto != null && preco > teto
          ? `Um pouco acima do teto de ${BRL.format(teto)}`
          : "Abaixo do valor mínimo definido",
      );
    }
  }

  avaliar(
    pref.cities.length > 0,
    contem(pref.cities, property.city),
    `Na cidade desejada (${property.city ?? ""})`.replace(" ()", ""),
    "Fora das cidades desejadas",
  );
  avaliar(
    pref.neighborhoods.length > 0,
    contem(pref.neighborhoods, property.neighborhood),
    `No bairro desejado (${property.neighborhood ?? ""})`.replace(" ()", ""),
    "Fora dos bairros preferidos",
  );
  avaliar(
    pref.types.length > 0,
    contem(pref.types, property.type),
    "É o tipo de imóvel procurado",
    "Não é o tipo de imóvel procurado",
  );
  avaliar(
    pref.bedroomsMin != null,
    d.bedrooms != null && d.bedrooms >= (pref.bedroomsMin ?? 0),
    `Tem os quartos pedidos (${d.bedrooms ?? 0})`,
    `Menos quartos que o mínimo de ${pref.bedroomsMin}`,
  );
  avaliar(
    pref.bathroomsMin != null,
    d.bathrooms != null && d.bathrooms >= (pref.bathroomsMin ?? 0),
    "Banheiros suficientes",
    `Menos banheiros que o mínimo de ${pref.bathroomsMin}`,
  );
  avaliar(
    pref.parkingMin != null,
    d.parkingSpots != null && d.parkingSpots >= (pref.parkingMin ?? 0),
    "Vagas suficientes",
    `Menos vagas que o mínimo de ${pref.parkingMin}`,
  );
  avaliar(
    pref.areaMin != null || pref.areaMax != null,
    d.area != null &&
      (pref.areaMin == null || d.area >= pref.areaMin) &&
      (pref.areaMax == null || d.area <= pref.areaMax),
    "Metragem na faixa desejada",
    "Metragem fora da faixa desejada",
  );
  avaliar(
    pref.furnished === true,
    property.furnished === true,
    "Mobiliado, como pedido",
    "Não é mobiliado",
  );
  if (pref.features.length > 0) {
    const doImovel = property.features.map(normalizar);
    const desejadas = pref.features;
    const encontradas = desejadas.filter((f) => doImovel.includes(normalizar(f)));
    avaliar(
      true,
      encontradas.length > 0,
      `Tem ${encontradas.length} de ${desejadas.length} comodidades desejadas`,
      "Nenhuma das comodidades desejadas",
    );
  }

  // Nenhum critério preenchido: não há veredito honesto a dar.
  if (criterios === 0) return null;

  if (atendidos === criterios) return { level: "alta", atende, ressalvas };
  const demais = criterios - (temFaixa ? 1 : 0);
  const demaisAtendidos = atendidos - (precoOk ? 1 : 0);
  if ((!temFaixa || precoOk) && demaisAtendidos * 2 >= demais) {
    return { level: "media", atende, ressalvas };
  }
  return { level: "baixa", atende, ressalvas };
}
