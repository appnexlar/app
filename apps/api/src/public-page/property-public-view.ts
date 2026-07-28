import type { Property, PropertyMedia } from "@prisma/client";
import {
  DETAIL_FIELDS,
  type FieldDef,
  type PropertyCategory,
  type PublicPropertyDetail,
  type PublicRentTerms,
  type PublicSpecGroup,
} from "@nexlar/shared";

/**
 * Montadores puros da visão pública de um imóvel. Nasceram na vitrine
 * (/corretor/:slug) e são os mesmos para a seleção personalizada
 * (/selecao/:token): o que muda entre as páginas é só a rota que serve as
 * fotos, então quem chama informa a base das URLs de mídia.
 *
 * Regra de ouro inalterada: nunca sai nota interna, origem, comissão nem
 * rua exata quando o addressDisplay não permite.
 */

/** Minúsculas e sem acento, para busca e comparação. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** O preço que o visitante compara: venda quando existe, senão locação. */
export function precoEfetivo(p: Property): number | null {
  if (p.salePrice != null) return Number(p.salePrice);
  if (p.rentPrice != null) return Number(p.rentPrice);
  return null;
}

/** Números do details (Json) com validação de tipo. */
export function detalhes(p: Property): {
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

/**
 * A régua de elegibilidade pergunta "tem foto?". Como a página do imóvel
 * também carrega vídeo e link, o veredito recebe uma cópia só com as fotos:
 * vídeo não vira foto por estar na mesma lista.
 */
export function soFotos<T extends { media: PropertyMedia[] }>(p: T): T {
  return { ...p, media: p.media.filter((m) => m.kind === "foto") };
}

/**
 * Ficha técnica do anúncio: tudo que o corretor preencheu em `details`, com o
 * rótulo do próprio formulário de cadastro (DETAIL_FIELDS). Agrupa por tipo de
 * informação para a leitura no celular não virar uma lista de trinta linhas.
 *
 * O que já está em destaque no topo da página (quartos, banheiros, vagas, a
 * área principal e mobiliado) fica de fora, para a ficha não repetir o que o
 * visitante acabou de ler. Só entra o que tem valor: booleano falso e texto
 * vazio somem, porque "Piscina: não" é ruído, não informação.
 */
export function fichaTecnica(p: Property): PublicSpecGroup[] {
  const campos: FieldDef[] = DETAIL_FIELDS[p.category as PropertyCategory] ?? [];
  const raw = (p.details ?? {}) as Record<string, unknown>;

  const chaveDaArea = typeof raw.builtArea === "number" ? "builtArea" : "totalArea";
  const jaMostrado = new Set(["bedrooms", "bathrooms", "parkingSpots", "furnished", chaveDaArea]);

  const medidas: { label: string; value: string }[] = [];
  const numeros: { label: string; value: string }[] = [];
  const temQue: { label: string; value: string }[] = [];
  const textos: { label: string; value: string }[] = [];

  for (const campo of campos) {
    if (jaMostrado.has(campo.key)) continue;
    const valor = raw[campo.key];

    if (campo.kind === "number") {
      if (typeof valor !== "number" || !Number.isFinite(valor)) continue;
      // Ano não leva separador de milhar: "2.019" não é ano, é erro de leitura.
      const numero = campo.key.toLowerCase().includes("year")
        ? String(valor)
        : valor.toLocaleString("pt-BR");
      // Espaço NÃO SEPARÁVEL (\u00a0) antes da unidade: "112" e "m²"
      // nunca quebram em linhas diferentes.
      const formatado = `${numero}${campo.suffix ? ` ${campo.suffix}` : ""}`;
      (campo.suffix ? medidas : numeros).push({ label: campo.label, value: formatado });
      continue;
    }

    if (campo.kind === "boolean") {
      if (valor === true) temQue.push({ label: campo.label, value: "Sim" });
      continue;
    }

    if (typeof valor === "string" && valor.trim()) {
      textos.push({ label: campo.label, value: valor.trim() });
    }
  }

  // As comodidades escritas à mão entram no mesmo bloco dos atributos marcados:
  // para o visitante, "Piscina" digitada e piscina marcada são a mesma coisa.
  // Deduplica sem acento e sem caixa, senão "Churrasqueira" aparece duas vezes.
  const vistos = new Set(temQue.map((i) => normalizar(i.label)));
  for (const feature of p.features) {
    const limpo = feature.trim();
    if (!limpo || vistos.has(normalizar(limpo))) continue;
    vistos.add(normalizar(limpo));
    temQue.push({ label: limpo, value: "Sim" });
  }

  const grupos: PublicSpecGroup[] = [
    { title: "Medidas", kind: "pares", items: medidas },
    { title: "Cômodos e estrutura", kind: "pares", items: numeros },
    { title: "O que o imóvel tem", kind: "itens", items: temQue },
    { title: "Mais detalhes", kind: "pares", items: textos },
  ];
  return grupos.filter((g) => g.items.length > 0);
}

/** Condições de aluguel, só para anúncio que envolve locação e tem algo a dizer. */
export function condicoesDeLocacao(p: Property): PublicRentTerms | null {
  if (p.purpose === "venda") return null;

  const termos: PublicRentTerms = {
    guaranteeTypes: p.guaranteeTypes?.trim() || null,
    minTermMonths: p.minTermMonths ?? null,
    otherFees: p.otherFees?.trim() || null,
    availableFromLabel: p.availableFrom
      ? p.availableFrom.toLocaleDateString("pt-BR", { timeZone: "UTC" })
      : null,
    notes: p.rentNotes?.trim() || null,
  };

  return Object.values(termos).some((v) => v != null) ? termos : null;
}

/** R$ 1.234, ou nulo quando não informado. */
export function moeda(valor: unknown): string | null {
  if (valor == null) return null;
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/** Linha de localização do detalhe, respeitando o addressDisplay do imóvel. */
export function linhaDeLocalizacao(p: Property): string | null {
  const bairroCidade = [p.neighborhood, [p.city, p.state].filter(Boolean).join("/")]
    .filter(Boolean)
    .join(", ");
  if (p.addressDisplay === "completo") {
    const linha = [[p.street, p.addressNumber].filter(Boolean).join(", "), bairroCidade]
      .filter(Boolean)
      .join(" - ");
    return linha || null;
  }
  if (p.addressDisplay === "sem_numero") {
    return [p.street, bairroCidade].filter(Boolean).join(" - ") || null;
  }
  if (p.addressDisplay === "aproximado") {
    return bairroCidade ? `${bairroCidade} (região aproximada)` : null;
  }
  return bairroCidade || null;
}

export function precoLegivel(purpose: string, price: number | null): string {
  if (price == null) return "Valor sob consulta";
  const valor = price.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
  return purpose === "locacao" || purpose === "temporada" ? `${valor} / mês` : valor;
}

/**
 * O detalhe público completo de um imóvel. `fotoBase` é a rota que serve as
 * mídias na página em questão (vitrine ou seleção); o id da mídia é anexado.
 */
export function montarDetalhePublico(
  property: Property & { media: PropertyMedia[] },
  fotoBase: string,
): PublicPropertyDetail {
  const d = detalhes(property);
  const preco = precoEfetivo(property);
  // Endereço detalhado só sai quando o corretor escolheu mostrar o endereço.
  // Condomínio e ponto de referência entregam o local tão bem quanto a rua.
  const podeLocalizar =
    property.addressDisplay === "completo" || property.addressDisplay === "sem_numero";

  return {
    code: property.code,
    title: property.title,
    type: property.type,
    purpose: property.purpose,
    priceLabel: precoLegivel(property.purpose, preco),
    condoFeeLabel: moeda(property.condoFee),
    iptuLabel: moeda(property.iptu),
    description: property.description,
    locationLine: linhaDeLocalizacao(property),
    bedrooms: d.bedrooms,
    bathrooms: d.bathrooms,
    parkingSpots: d.parkingSpots,
    area: d.area,
    features: property.features,
    acceptsFinancing: property.acceptsFinancing,
    acceptsFgts: property.acceptsFgts,
    acceptsTrade: property.acceptsTrade,
    priceNegotiable: property.priceNegotiable,
    furnished: property.furnished,
    category: property.category,
    condoName: podeLocalizar ? property.condoName : null,
    reference: podeLocalizar ? property.reference : null,
    specs: fichaTecnica(property),
    rentTerms: condicoesDeLocacao(property),
    photos: property.media
      .filter((m) => m.kind === "foto")
      .map((m) => ({ url: `${fotoBase}/${m.id}`, caption: m.caption })),
    videos: property.media
      .filter((m) => m.kind === "video")
      .map((m) => ({ url: `${fotoBase}/${m.id}`, caption: m.caption })),
    links: property.media
      .filter((m) => m.kind === "link_externo" && m.externalUrl)
      .map((m) => ({ url: m.externalUrl as string, caption: m.caption })),
    highlighted: property.highlightOrder != null,
  };
}
