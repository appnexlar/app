import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractFromHtml, normalizeUF, parseMoneyBR } from "../src/property-import/extraction";
import { mapExtraction } from "../src/property-import/import-mapper";
import { decodeHtml } from "../src/property-import/page-fetch.service";
import { UrlSecurityService } from "../src/property-import/url-security.service";

/**
 * Fatia A da importação por URL: o porteiro anti-SSRF e a extração
 * determinística sobre TRÊS páginas reais (fixtures), uma de cada plataforma:
 * ImobiBrasil (JK Macedo, ISO-8859-1), site próprio em Next (Mega Imóveis,
 * og customizado) e C2S (MG Imob, RealEstateListing).
 */

function fixture(name: string): string {
  // Sem Content-Type, como no teste de charset: o decode se vira sozinho.
  return decodeHtml(readFileSync(join(__dirname, "fixtures/import", name)));
}

function dnsFalso(map: Record<string, string[]>): UrlSecurityService {
  const service = new UrlSecurityService();
  service.resolve = async (hostname) =>
    (map[hostname] ?? []).map((address) => ({
      address,
      family: address.includes(":") ? 6 : 4,
    }));
  return service;
}

async function codigoDe(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? "sem_codigo";
  }
}

describe("UrlSecurityService (anti-SSRF)", () => {
  const service = dnsFalso({
    "site-publico.teste": ["93.184.216.34"],
    "site-interno.teste": ["10.1.2.3"],
    "site-rebinding.teste": ["93.184.216.34", "127.0.0.1"],
    "site-ipv6-privado.teste": ["fd00::1"],
  });

  it("recusa esquemas que não são http(s)", async () => {
    for (const url of [
      "file:///etc/passwd",
      "ftp://site.com/arquivo",
      "javascript:alert(1)",
      "data:text/html,oi",
    ]) {
      expect(await codigoDe(service.validate(url))).toBe("url_invalida");
    }
  });

  it("recusa credencial embutida e porta fora do padrão", async () => {
    expect(await codigoDe(service.validate("https://user:senha@site-publico.teste/"))).toBe(
      "url_bloqueada",
    );
    expect(await codigoDe(service.validate("http://site-publico.teste:8080/"))).toBe(
      "url_bloqueada",
    );
  });

  it("recusa IP literal privado, loopback, link-local, metadata e CGNAT", async () => {
    for (const url of [
      "http://127.0.0.1/",
      "http://10.0.0.5/",
      "http://172.16.0.9/",
      "http://192.168.1.10/",
      "http://169.254.169.254/latest/meta-data/",
      "http://100.64.0.1/",
      "http://0.0.0.0/",
      "http://[::1]/",
      "http://[fe80::1]/",
    ]) {
      expect(await codigoDe(service.validate(url))).toBe("url_bloqueada");
    }
  });

  it("recusa hostname que resolve para rede privada, mesmo misturado com IP público", async () => {
    expect(await codigoDe(service.validate("https://site-interno.teste/imovel/1"))).toBe(
      "url_bloqueada",
    );
    // Rebinding clássico: um endereço público de fachada e um privado junto.
    expect(await codigoDe(service.validate("https://site-rebinding.teste/imovel/1"))).toBe(
      "url_bloqueada",
    );
    expect(await codigoDe(service.validate("https://site-ipv6-privado.teste/"))).toBe(
      "url_bloqueada",
    );
  });

  it("aceita site público e devolve os IPs pinados para a conexão", async () => {
    const safe = await service.validate("https://site-publico.teste/imovel/123");
    expect(safe.addresses).toEqual([{ address: "93.184.216.34", family: 4 }]);
  });

  it("hostname desconhecido vira inacessível, não erro técnico", async () => {
    expect(await codigoDe(service.validate("https://nao-existe.teste/"))).toBe("inacessivel");
  });
});

describe("Normalização brasileira", () => {
  it("lê dinheiro em qualquer grafia", () => {
    expect(parseMoneyBR("R$ 518.000,00")).toBe(518000);
    expect(parseMoneyBR("518000")).toBe(518000);
    expect(parseMoneyBR("490000.0")).toBe(490000);
    expect(parseMoneyBR("518.000")).toBe(518000);
    expect(parseMoneyBR("1.045,27")).toBe(1045.27);
    expect(parseMoneyBR("abc")).toBeNull();
    expect(parseMoneyBR("0")).toBeNull();
  });

  it("normaliza UF por sigla e por nome", () => {
    expect(normalizeUF("SP")).toBe("SP");
    expect(normalizeUF("Ceará")).toBe("CE");
    expect(normalizeUF("sao paulo")).toBe("SP");
    expect(normalizeUF("Marte")).toBeNull();
  });
});

describe("Extração: JK Macedo (ImobiBrasil, JSON-LD + título empacotado, latin1)", () => {
  const canonical = extractFromHtml(
    fixture("jk.html"),
    "https://www.jkmacedoimoveis.com.br/imovel/2573040/chacara-venda-mairipora-sp-recanto-ceu-azul",
  );

  it("decodifica o charset certo (Mairiporã, não lixo)", () => {
    expect(canonical.city?.value).toBe("Mairiporã");
  });

  it("lê preço, endereço e finalidade da ficha", () => {
    expect(canonical.price?.value).toBe(518000);
    expect(canonical.price?.source).toBe("ficha");
    expect(canonical.state?.value).toBe("SP");
    expect(canonical.neighborhood?.value).toBe("Recanto Ceu Azul");
    expect(canonical.purpose?.value).toBe("venda");
  });

  it("lê os números empacotados no título da ficha", () => {
    expect(canonical.categoryType?.value).toEqual({
      category: "residencial",
      type: "chacara_residencial",
    });
    expect(canonical.bedrooms?.value).toBe(4);
    expect(canonical.suites?.value).toBe(4);
    expect(canonical.parkingSpots?.value).toBe(6);
    expect(canonical.totalArea?.value).toBe(1505);
    expect(canonical.builtArea?.value).toBe(181.32);
  });

  it("acha o código do anúncio na URL e conta as fotos", () => {
    expect(canonical.externalCode?.value).toBe("2573040");
    expect(canonical.photos.length).toBeGreaterThan(0);
  });
});

describe("Extração: Mega Imóveis (og customizado, sem JSON-LD)", () => {
  const canonical = extractFromHtml(
    fixture("mega.html"),
    "https://www.megaimoveis.com/imovel/locacao/apartamentos/fortaleza/meireles/9430",
  );

  it("lê o endereço aberto do og, até rua e número", () => {
    expect(canonical.street?.value).toBe("Rua República do Líbano");
    expect(canonical.addressNumber?.value).toBe("120");
    expect(canonical.neighborhood?.value).toBe("Meireles");
    expect(canonical.city?.value).toBe("Fortaleza");
    expect(canonical.state?.value).toBe("CE");
  });

  it("deduz locação pela URL e cobertura pelo título", () => {
    expect(canonical.purpose?.value).toBe("locacao");
    expect(canonical.categoryType?.value).toEqual({
      category: "residencial",
      type: "cobertura",
    });
    expect(canonical.suites?.value).toBe(5);
  });

  it("pega o código no og:propertyRef e tira o nome do site do título", () => {
    expect(canonical.externalCode?.value).toBe("9430");
    expect(canonical.title?.value).toBe(
      "Cobertura Duplex com 5 suítes no bairro Meireles em Fortaleza, CE",
    );
  });

  it("sem preço estruturado, preço fica honesto: ausente (fatia B lê o texto)", () => {
    expect(canonical.price).toBeUndefined();
  });
});

describe("Extração: MG Imob (RealEstateListing da C2S)", () => {
  const canonical = extractFromHtml(
    fixture("mg.html"),
    "https://www.mgimob.com.br/imoveis/venda/residencial/fortaleza/rodolfo-teofilo/CA0979",
  );

  it("lê a ficha RealEstateListing inteira", () => {
    expect(canonical.price?.value).toBe(490000);
    expect(canonical.externalCode?.value).toBe("CA0979");
    expect(canonical.city?.value).toBe("Fortaleza");
    expect(canonical.state?.value).toBe("CE");
    expect(canonical.neighborhood?.value).toBe("Rodolfo Teófilo");
    expect(canonical.purpose?.value).toBe("venda");
    expect(canonical.categoryType?.value).toEqual({ category: "residencial", type: "casa" });
  });

  it("lê quartos e banheiros da descrição e a área sem rótulo como genérica", () => {
    expect(canonical.bedrooms?.value).toBe(2);
    expect(canonical.bathrooms?.value).toBe(2);
    expect(canonical.genericArea?.value).toBe(144);
  });
});

describe("Mapper: do canônico para o modelo da Nexlar", () => {
  const canonical = extractFromHtml(
    fixture("jk.html"),
    "https://www.jkmacedoimoveis.com.br/imovel/2573040/chacara-venda-mairipora-sp-recanto-ceu-azul",
  );
  const mapped = mapExtraction(canonical, {
    url: "https://www.jkmacedoimoveis.com.br/imovel/2573040/chacara-venda-mairipora-sp-recanto-ceu-azul",
    domain: "www.jkmacedoimoveis.com.br",
  });

  it("monta o rascunho válido com origem sempre em revisão", () => {
    expect(mapped.createDto.category).toBe("residencial");
    expect(mapped.createDto.type).toBe("chacara_residencial");
    expect(mapped.createDto.origin).toBe("outro");
    expect(mapped.fields.find((f) => f.key === "origin")?.state).toBe("revisar");
  });

  it("preço vai para salePrice em reais (Decimal, nunca centavos)", () => {
    expect(mapped.updateDto.salePrice).toBe(518000);
    expect(mapped.updateDto.rentPrice).toBeUndefined();
  });

  it("características caem no details validado por categoria", () => {
    expect(mapped.updateDto.details).toMatchObject({
      bedrooms: 4,
      suites: 4,
      parkingSpots: 6,
      totalArea: 1505,
      builtArea: 181.32,
    });
  });

  it("resume o que achou, o que é para conferir e o que faltou", () => {
    expect(mapped.summary.found).toBeGreaterThanOrEqual(8);
    expect(mapped.summary.review).toBeGreaterThanOrEqual(1);
    expect(mapped.foundCount).toBe(mapped.summary.found);
  });

  it("área genérica entra como área total marcada para revisar (MG)", () => {
    const mg = mapExtraction(
      extractFromHtml(
        fixture("mg.html"),
        "https://www.mgimob.com.br/imoveis/venda/residencial/fortaleza/rodolfo-teofilo/CA0979",
      ),
      { url: "https://www.mgimob.com.br/x", domain: "www.mgimob.com.br" },
    );
    expect(mg.updateDto.details).toMatchObject({ totalArea: 144 });
    expect(mg.fields.find((f) => f.key === "details.totalArea")?.state).toBe("revisar");
  });
});
