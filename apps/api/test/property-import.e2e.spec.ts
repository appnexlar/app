import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Test } from "@nestjs/testing";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { RateLimitStore } from "../src/common/rate-limit/rate-limit.store";
import { ImportFailedError } from "../src/property-import/import-errors";
import { PageFetchService } from "../src/property-import/page-fetch.service";
import { decodeHtml } from "../src/property-import/page-fetch.service";
import {
  registerBroker,
  registerPlugins,
  requestAs,
  resetDatabase,
  type TestBroker,
} from "./e2e-utils";

const MG_URL = "https://site-parceiro.teste/imoveis/venda/residencial/fortaleza/rodolfo-teofilo/CA0979";
const VAZIO_URL = "https://pagina-vazia.teste/imovel/1";

/**
 * Fluxo da importação por URL com o app inteiro no ar. O PageFetchService é
 * trocado por um dublê que devolve a fixture real da MG Imob: a REDE é a
 * única coisa falsa aqui; validação, extração, criação e isolamento rodam de
 * verdade, com o guard global e os pipes de produção.
 */
async function createAppWithFakeFetch(): Promise<NestFastifyApplication> {
  const mgHtml = decodeHtml(readFileSync(join(__dirname, "fixtures/import/mg.html")));
  const fake: Pick<PageFetchService, "fetch"> = {
    fetch: async (url: string) => {
      if (url.startsWith("https://site-parceiro.teste/")) {
        return { html: mgHtml, finalUrl: url, httpStatus: 200 };
      }
      if (url.startsWith("https://pagina-vazia.teste/")) {
        return { html: "<html><head><title>oi</title></head><body></body></html>", finalUrl: url, httpStatus: 200 };
      }
      throw new ImportFailedError("inacessivel", "Não conseguimos acessar este anúncio.");
    },
  };

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PageFetchService)
    .useValue(fake)
    .compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await registerPlugins(app);
  app.setGlobalPrefix("api");
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe("Importação de imóvel por URL (e2e)", () => {
  let app: NestFastifyApplication;
  let ana: TestBroker;
  let bruno: TestBroker;
  let propertyAnaId: string;

  beforeAll(async () => {
    app = await createAppWithFakeFetch();
    await resetDatabase(app);
    app.get(RateLimitStore).clearAll();
    ana = await registerBroker(app, "Ana Corretora", "ana.import@teste.com");
    bruno = await registerBroker(app, "Bruno Corretor", "bruno.import@teste.com");
  });

  afterAll(async () => {
    await app.close();
  });

  it("exige autenticação", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/properties/imports",
      payload: { url: MG_URL },
    });
    expect(response.statusCode).toBe(401);
  });

  it("recusa link que não é http(s) sem tocar a rede", async () => {
    const response = await requestAs(app, ana, {
      method: "POST",
      url: "/api/properties/imports",
      payload: { url: "file:///etc/passwd" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("importa o anúncio e cria o rascunho preenchido", async () => {
    const response = await requestAs(app, ana, {
      method: "POST",
      url: "/api/properties/imports",
      payload: { url: MG_URL },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.outcome).toBe("criado");
    expect(body.propertyId).toBeTruthy();
    expect(body.summary.found).toBeGreaterThanOrEqual(6);
    propertyAnaId = body.propertyId;

    const detail = (
      await requestAs(app, ana, { method: "GET", url: `/api/properties/${propertyAnaId}` })
    ).json();
    expect(detail.status).toBe("rascunho");
    expect(detail.salePrice).toBe(490000);
    expect(detail.city).toBe("Fortaleza");
    expect(detail.externalCode).toBe("CA0979");
    expect(detail.externalLink).toBe(MG_URL);
    expect(detail.origin).toBe("outro");
    expect(detail.details).toMatchObject({ bedrooms: 2, bathrooms: 2 });
  });

  it("mesmo link de novo: avisa o duplicado e não cria nada", async () => {
    const antes = (
      await requestAs(app, ana, { method: "GET", url: "/api/properties?status=rascunho" })
    ).json().total;

    const response = await requestAs(app, ana, {
      method: "POST",
      url: "/api/properties/imports",
      payload: { url: MG_URL },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.outcome).toBe("duplicado");
    expect(body.propertyId).toBeNull();
    expect(body.duplicates[0].id).toBe(propertyAnaId);

    const depois = (
      await requestAs(app, ana, { method: "GET", url: "/api/properties?status=rascunho" })
    ).json().total;
    expect(depois).toBe(antes);
  });

  it("com force, o corretor decide importar mesmo assim", async () => {
    const response = await requestAs(app, ana, {
      method: "POST",
      url: "/api/properties/imports",
      payload: { url: MG_URL, force: true },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.outcome).toBe("criado");
    expect(body.propertyId).not.toBe(propertyAnaId);
    // Limpa a cópia para não sujar os testes seguintes.
    await requestAs(app, ana, { method: "DELETE", url: `/api/properties/${body.propertyId}` });
  });

  it("isolamento: a importação da Ana não existe para o Bruno, nem como duplicado", async () => {
    const cross = await requestAs(app, bruno, {
      method: "GET",
      url: `/api/properties/${propertyAnaId}`,
    });
    expect(cross.statusCode).toBe(404);

    // O mesmo link importado pelo Bruno cria o imóvel DELE: o dedupe é por
    // carteira, nunca entre corretores (um não pode nem saber que o outro tem).
    const response = await requestAs(app, bruno, {
      method: "POST",
      url: "/api/properties/imports",
      payload: { url: MG_URL },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().outcome).toBe("criado");
  });

  it("página sem dados aproveitáveis não vira rascunho vazio", async () => {
    const response = await requestAs(app, ana, {
      method: "POST",
      url: "/api/properties/imports",
      payload: { url: VAZIO_URL },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("pouca coisa");
  });

  it("trava por corretor: a 16ª importação na mesma hora é recusada", async () => {
    const store = app.get(RateLimitStore);
    const key = `import-imovel:broker:${ana.brokerId}`;
    store.reset(key);
    for (let i = 0; i < 15; i++) store.hit(key, 60 * 60 * 1000);

    const response = await requestAs(app, ana, {
      method: "POST",
      url: "/api/properties/imports",
      payload: { url: "https://site-parceiro.teste/outro/CA1000", force: true },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("Muitas importações");
    store.reset(key);
  });

  it("cada tentativa vira uma linha de auditoria em property_import", async () => {
    const { PrismaService } = await import("../src/prisma/prisma.service");
    const prisma = app.get(PrismaService);
    const rows = await prisma.propertyImport.findMany({ where: { brokerId: ana.brokerId } });
    const statuses = rows.map((r: { status: string }) => r.status);
    expect(statuses).toContain("concluida");
    expect(statuses).toContain("duplicada");
    expect(statuses).toContain("falhou");
    // O conteúdo integral da página nunca é gravado: só o resultado.
    for (const row of rows) {
      expect(JSON.stringify(row.payload ?? {})).not.toContain("<html");
    }
  });
});
