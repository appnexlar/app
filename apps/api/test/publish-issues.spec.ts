import { describe, expect, it } from "vitest";
import {
  bloqueiosParaPublicar,
  publishIssues,
  sugestoesDeAnuncio,
  type AdQualityInput,
  type PublishTarget,
} from "@nexlar/shared";

/**
 * A regra de publicação tem uma fonte só (packages/shared/properties/publish).
 * A API a executa em changeStatus e a revisão do cadastro a usa para avisar
 * antes. Estes casos travam as duas coisas que podem apodrecer com o tempo:
 *
 *  1) o que bloqueia continua sendo cidade, bairro e o valor da finalidade;
 *  2) sugestão de anúncio (foto, característica) NUNCA vira bloqueio.
 */

const completo: PublishTarget & AdQualityInput = {
  purpose: "venda",
  city: "Fortaleza",
  neighborhood: "Meireles",
  salePrice: 490000,
  rentPrice: null,
  features: ["Piscina"],
  photoCount: 3,
};

/** Reproduz a mensagem que a API monta, para comparar com a regra. */
const mensagemDaApi = (alvo: PublishTarget) =>
  `Para deixar o imóvel disponível, preencha: ${bloqueiosParaPublicar(alvo)
    .map((b) => b.campo)
    .join(", ")}.`;

describe("bloqueiosParaPublicar (a regra do servidor)", () => {
  it("imóvel completo não tem bloqueio", () => {
    expect(bloqueiosParaPublicar(completo)).toEqual([]);
  });

  it("cidade e bairro em branco bloqueiam e levam à etapa de localização", () => {
    const blocks = bloqueiosParaPublicar({ ...completo, city: "", neighborhood: "   " });
    expect(blocks.map((b) => b.key)).toEqual(["city", "neighborhood"]);
    expect(blocks.every((b) => b.step === 1)).toBe(true);
  });

  it("cobra o valor de venda só de quem vende", () => {
    expect(bloqueiosParaPublicar({ ...completo, salePrice: null }).map((b) => b.key)).toEqual([
      "salePrice",
    ]);
    expect(
      bloqueiosParaPublicar({ ...completo, purpose: "locacao", salePrice: null, rentPrice: 2500 }),
    ).toEqual([]);
  });

  it("cobra o valor da locação de locação, temporada e venda_locacao", () => {
    for (const purpose of ["locacao", "temporada"] as const) {
      const blocks = bloqueiosParaPublicar({ ...completo, purpose, salePrice: null, rentPrice: null });
      expect(blocks.map((b) => b.key)).toEqual(["rentPrice"]);
    }
    const ambos = bloqueiosParaPublicar({
      ...completo,
      purpose: "venda_locacao",
      salePrice: null,
      rentPrice: null,
    });
    expect(ambos.map((b) => b.key)).toEqual(["salePrice", "rentPrice"]);
  });

  it("a mensagem da API continua a mesma de antes da regra virar compartilhada", () => {
    expect(mensagemDaApi({ ...completo, city: "", neighborhood: "", salePrice: null })).toBe(
      "Para deixar o imóvel disponível, preencha: cidade, bairro, valor de venda.",
    );
    expect(
      mensagemDaApi({ ...completo, purpose: "locacao", city: "", salePrice: null, rentPrice: null }),
    ).toBe("Para deixar o imóvel disponível, preencha: cidade, valor da locação.");
  });
});

describe("sugestoesDeAnuncio (só experiência, nunca trava)", () => {
  it("foto e característica em falta viram recomendação", () => {
    const issues = sugestoesDeAnuncio({ features: [], photoCount: 0 });
    expect(issues.map((i) => i.key)).toEqual(["photos", "features"]);
    expect(issues.every((i) => i.level === "recomendado")).toBe(true);
  });

  it("nenhuma sugestão aparece entre os bloqueios do servidor", () => {
    const chavesQueBloqueiam = new Set(
      bloqueiosParaPublicar({
        purpose: "venda_locacao",
        city: "",
        neighborhood: "",
        salePrice: null,
        rentPrice: null,
      }).map((b) => b.key),
    );
    for (const sugestao of sugestoesDeAnuncio({ features: [], photoCount: 0 })) {
      expect(chavesQueBloqueiam.has(sugestao.key)).toBe(false);
    }
  });
});

describe("publishIssues (o que a revisão mostra)", () => {
  it("junta as duas listas: bloqueios primeiro, sugestões depois", () => {
    const issues = publishIssues({
      ...completo,
      city: "",
      salePrice: null,
      features: [],
      photoCount: 0,
    });
    expect(issues.map((i) => i.key)).toEqual(["city", "salePrice", "photos", "features"]);
    const primeiraSugestao = issues.findIndex((i) => i.level === "recomendado");
    const ultimoBloqueio = issues.map((i) => i.level).lastIndexOf("bloqueante");
    expect(ultimoBloqueio).toBeLessThan(primeiraSugestao);
  });

  it("todo bloqueio do servidor aparece na revisão, com o mesmo peso", () => {
    // Convergência: se alguém acrescentar um bloqueio na regra e esquecer da
    // tela, ou marcar como recomendado o que barra de verdade, quebra aqui.
    const alvo: PublishTarget & AdQualityInput = {
      ...completo,
      purpose: "venda_locacao",
      city: "",
      neighborhood: "",
      salePrice: null,
      rentPrice: null,
    };
    const naRegra = bloqueiosParaPublicar(alvo).map((b) => b.key);
    const naTela = publishIssues(alvo)
      .filter((i) => i.level === "bloqueante")
      .map((i) => i.key);
    expect(naTela).toEqual(naRegra);
  });

  it("imóvel completo não mostra pendência nenhuma", () => {
    expect(publishIssues(completo)).toEqual([]);
  });
});
