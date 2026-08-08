import type { PropertyPurpose } from "./dto";

/**
 * O que falta para um imóvel poder ficar disponível.
 *
 * Duas naturezas diferentes moram aqui, separadas de propósito:
 *
 *  - `bloqueiosParaPublicar` é REGRA DE NEGÓCIO. Quem executa é a API, em
 *    changeStatus, sobre os dados do banco. A revisão do cadastro chama a
 *    mesma função só para avisar antes, mas quem barra é sempre o servidor.
 *
 *  - `sugestoesDeAnuncio` é EXPERIÊNCIA. Só o front usa, nunca bloqueia nada.
 *    Fica fora da regra para que mexer na tela nunca vire, sem querer, uma
 *    trava nova em produção.
 *
 * Um teste de convergência (publish-issues.spec.ts) roda a regra pelos dois
 * caminhos e falha se um dia divergirem.
 */

export function needsSalePrice(purpose: PropertyPurpose | ""): boolean {
  return purpose === "venda" || purpose === "venda_locacao";
}

export function needsRentPrice(purpose: PropertyPurpose | ""): boolean {
  return purpose === "locacao" || purpose === "venda_locacao" || purpose === "temporada";
}

// --- Regra de negócio: o que impede publicar --------------------------------

/** O mínimo que a regra precisa conhecer do imóvel. */
export interface PublishTarget {
  purpose: PropertyPurpose | "";
  city: string | null | undefined;
  neighborhood: string | null | undefined;
  salePrice: number | null | undefined;
  rentPrice: number | null | undefined;
}

export interface PublishBlock {
  key: string;
  /** Substantivo da mensagem da API ("preencha: cidade, bairro"). */
  campo: string;
  /** Frase inteira, para a revisão do cadastro. */
  label: string;
  /** Etapa do cadastro onde se resolve (índice do wizard). */
  step: number;
}

/**
 * Campos sem os quais o imóvel não pode ficar disponível. Fonte única: a API
 * monta a mensagem de erro a partir daqui e a revisão avisa antes.
 */
export function bloqueiosParaPublicar(p: PublishTarget): PublishBlock[] {
  const blocks: PublishBlock[] = [];

  if (!p.city?.trim()) {
    blocks.push({ key: "city", campo: "cidade", label: "Cidade não informada", step: 1 });
  }
  if (!p.neighborhood?.trim()) {
    blocks.push({
      key: "neighborhood",
      campo: "bairro",
      label: "Bairro não informado",
      step: 1,
    });
  }
  if (needsSalePrice(p.purpose) && p.salePrice == null) {
    blocks.push({
      key: "salePrice",
      campo: "valor de venda",
      label: "Valor de venda não informado",
      step: 3,
    });
  }
  if (needsRentPrice(p.purpose) && p.rentPrice == null) {
    blocks.push({
      key: "rentPrice",
      campo: "valor da locação",
      label: "Valor da locação não informado",
      step: 3,
    });
  }

  return blocks;
}

// --- Experiência: o que deixa o anúncio melhor ------------------------------

export type PublishIssueLevel =
  /** Impede tornar disponível (vem de bloqueiosParaPublicar). */
  | "bloqueante"
  /** Não impede: só deixa o anúncio mais fraco. */
  | "recomendado";

export interface PublishIssue {
  key: string;
  label: string;
  level: PublishIssueLevel;
  step: number;
}

export interface AdQualityInput {
  features: readonly string[];
  photoCount: number;
}

/**
 * Sugestões da revisão do cadastro. Nunca entram na regra do servidor: são
 * conselho de anúncio, não requisito. Se um dia alguma virar obrigatória, o
 * lugar é bloqueiosParaPublicar, com o teste de convergência acusando.
 */
export function sugestoesDeAnuncio(p: AdQualityInput): PublishIssue[] {
  const issues: PublishIssue[] = [];
  if (p.photoCount === 0) {
    issues.push({ key: "photos", label: "Nenhuma foto adicionada", level: "recomendado", step: 5 });
  }
  if (p.features.length === 0) {
    issues.push({
      key: "features",
      label: "Nenhuma característica marcada",
      level: "recomendado",
      step: 2,
    });
  }
  return issues;
}

/** A lista completa da revisão: bloqueios primeiro, sugestões depois. */
export function publishIssues(p: PublishTarget & AdQualityInput): PublishIssue[] {
  const bloqueantes: PublishIssue[] = bloqueiosParaPublicar(p).map((b) => ({
    key: b.key,
    label: b.label,
    level: "bloqueante",
    step: b.step,
  }));
  return [...bloqueantes, ...sugestoesDeAnuncio(p)];
}
