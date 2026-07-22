import type {
  AddressDisplayMode,
  MediaOrigin,
  PhotoRoom,
  PropertyCategory,
  PropertyContactRole,
  PropertyOrigin,
  PropertyPurpose,
  PropertySort,
  PropertyStatus,
} from "@nexlar/shared";

export const PURPOSE_LABELS: Record<PropertyPurpose, string> = {
  venda: "Venda",
  locacao: "Locação",
  venda_locacao: "Venda e locação",
  temporada: "Temporada",
};

export const CATEGORY_LABELS: Record<PropertyCategory, string> = {
  residencial: "Residencial",
  comercial: "Comercial",
  industrial: "Industrial e logístico",
  terreno: "Terreno",
  rural: "Rural",
  empreendimento: "Empreendimento",
};

export const TYPE_LABELS: Record<string, string> = {
  casa: "Casa",
  apartamento: "Apartamento",
  casa_condominio: "Casa em condomínio",
  cobertura: "Cobertura",
  studio: "Studio",
  kitnet: "Kitnet",
  sobrado: "Sobrado",
  flat: "Flat",
  loft: "Loft",
  duplex: "Duplex",
  triplex: "Triplex",
  chacara_residencial: "Chácara residencial",
  sala_comercial: "Sala comercial",
  loja: "Loja",
  ponto_comercial: "Ponto comercial",
  escritorio: "Escritório",
  predio_comercial: "Prédio comercial",
  clinica_consultorio: "Clínica ou consultório",
  hotel_pousada: "Hotel ou pousada",
  galpao: "Galpão",
  armazem: "Armazém",
  fabrica: "Fábrica",
  centro_distribuicao: "Centro de distribuição",
  area_industrial: "Área industrial",
  terreno_residencial: "Terreno residencial",
  terreno_comercial: "Terreno comercial",
  terreno_industrial: "Terreno industrial",
  lote_condominio: "Lote em condomínio",
  area_incorporacao: "Área para incorporação",
  fazenda: "Fazenda",
  sitio: "Sítio",
  chacara: "Chácara",
  area_rural: "Área rural",
  lancamento: "Lançamento",
  unidade_construcao: "Unidade em construção",
  unidade_pronta: "Unidade pronta",
  loteamento: "Loteamento",
};

export const STATUS_LABELS: Record<PropertyStatus, string> = {
  rascunho: "Rascunho",
  disponivel: "Disponível",
  temporariamente_indisponivel: "Indisponível",
  reservado: "Reservado",
  em_negociacao: "Em negociação",
  vendido: "Vendido",
  alugado: "Alugado",
  arquivado: "Arquivado",
};

/** Tom visual de cada status nos selos. */
export const STATUS_TONES: Record<PropertyStatus, "neutral" | "success" | "accent" | "danger"> = {
  rascunho: "neutral",
  disponivel: "success",
  temporariamente_indisponivel: "danger",
  reservado: "accent",
  em_negociacao: "accent",
  vendido: "neutral",
  alugado: "neutral",
  arquivado: "neutral",
};

export const ORIGIN_LABELS: Record<PropertyOrigin, string> = {
  captacao_propria: "Captação própria",
  proprietario_particular: "Proprietário particular",
  imobiliaria: "Imobiliária",
  corretor_parceiro: "Corretor parceiro",
  construtora: "Construtora ou incorporadora",
  indicacao: "Indicação",
  banco_leilao: "Banco ou leilão",
  outro: "Outro",
};

export const ADDRESS_DISPLAY_LABELS: Record<AddressDisplayMode, string> = {
  completo: "Mostrar endereço completo",
  aproximado: "Mostrar localização aproximada",
  sem_numero: "Ocultar o número",
  bairro_cidade: "Mostrar somente bairro e cidade",
};

export const CONTACT_ROLE_LABELS: Record<PropertyContactRole, string> = {
  proprietario: "Proprietário",
  corretor_captador: "Corretor captador",
  corretor_parceiro: "Corretor parceiro",
  imobiliaria_responsavel: "Imobiliária responsável",
  construtora: "Construtora",
  administradora_locacao: "Administradora da locação",
  responsavel_chaves: "Responsável pelas chaves",
  contato_agendamento: "Contato para agendamento",
  outro: "Outro",
};

export const MEDIA_ORIGIN_LABELS: Record<MediaOrigin, string> = {
  corretor: "Produzida por mim",
  imobiliaria: "Fornecida pela imobiliária",
  proprietario: "Enviada pelo proprietário",
  parceiro: "Fornecida por parceiro",
  link_externo: "Link externo",
  outro: "Outra origem",
};

export const PHOTO_ROOM_LABELS: Record<PhotoRoom, string> = {
  fachada: "Fachada",
  sala: "Sala",
  cozinha: "Cozinha",
  quarto: "Quarto",
  banheiro: "Banheiro",
  area_externa: "Área externa",
  garagem: "Garagem",
  condominio: "Condomínio",
  planta: "Planta",
  vista: "Vista",
  outro: "Outro",
};

export const SORT_LABELS: Record<PropertySort, string> = {
  recentes: "Mais recentes",
  antigos: "Mais antigos",
  menor_valor: "Menor valor",
  maior_valor: "Maior valor",
  atualizacao: "Última atualização",
  titulo: "Título",
};

export const FEATURE_SUGGESTIONS = [
  "Piscina",
  "Academia",
  "Salão de festas",
  "Churrasqueira",
  "Playground",
  "Portaria 24h",
  "Segurança",
  "Elevador",
  "Varanda",
  "Vista livre",
  "Mobiliado",
  "Ar-condicionado",
  "Energia solar",
  "Aquecimento",
  "Acessibilidade",
  "Área verde",
  "Próximo a transporte",
  "Próximo a escolas",
  "Próximo a comércio",
  "Condomínio fechado",
  "Pet friendly",
];

export function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

/** Valor principal do card conforme a finalidade. */
export function mainPrice(p: { purpose: PropertyPurpose; salePrice: number | null; rentPrice: number | null }): string {
  if (p.purpose === "venda" && p.salePrice != null) return formatMoney(p.salePrice);
  if ((p.purpose === "locacao" || p.purpose === "temporada") && p.rentPrice != null)
    return `${formatMoney(p.rentPrice)}/mês`;
  if (p.purpose === "venda_locacao") {
    if (p.salePrice != null && p.rentPrice != null)
      return `${formatMoney(p.salePrice)} · ${formatMoney(p.rentPrice)}/mês`;
    if (p.salePrice != null) return formatMoney(p.salePrice);
    if (p.rentPrice != null) return `${formatMoney(p.rentPrice)}/mês`;
  }
  return "Valor a definir";
}

/** Código interno exibido como IM-0001. */
export function formatCode(code: number): string {
  return `IM-${String(code).padStart(4, "0")}`;
}
