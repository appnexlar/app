import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  createTestApp,
  registerBroker,
  requestAs,
  resetDatabase,
  type TestBroker,
} from "./e2e-utils";

/**
 * Teste de isolamento exigido pelo CLAUDE.md: dois corretores autenticados,
 * cada um com seus leads e imóveis, e nenhuma leitura ou escrita de um
 * alcança os dados do outro. O broker_id vem sempre do token (@CurrentBroker),
 * então todo acesso cruzado tem que se comportar como se o recurso não
 * existisse (404), sem alterar nada.
 */
describe("Isolamento por corretor", () => {
  let app: NestFastifyApplication;
  let ana: TestBroker;
  let bruno: TestBroker;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    ana = await registerBroker(app, "Ana Corretora", "ana.isolamento@teste.com");
    bruno = await registerBroker(app, "Bruno Corretor", "bruno.isolamento@teste.com");
  });

  afterAll(async () => {
    await app.close();
  });

  it("exige autenticação nas rotas de leads e imóveis", async () => {
    for (const url of ["/api/leads", "/api/properties"]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode).toBe(401);
    }
  });

  describe("/leads", () => {
    let leadAna: string;
    let leadBruno: string;

    beforeAll(async () => {
      const created = await Promise.all([
        requestAs(app, ana, {
          method: "POST",
          url: "/api/leads",
          payload: { fullName: "Cliente da Ana", whatsapp: "11999990001" },
        }),
        requestAs(app, bruno, {
          method: "POST",
          url: "/api/leads",
          payload: { fullName: "Cliente do Bruno", whatsapp: "11999990002" },
        }),
      ]);
      for (const response of created) expect(response.statusCode).toBe(201);
      leadAna = created[0].json().id;
      leadBruno = created[1].json().id;
    });

    it("list devolve só os leads do corretor autenticado", async () => {
      const listAna = (await requestAs(app, ana, { method: "GET", url: "/api/leads" })).json();
      const listBruno = (await requestAs(app, bruno, { method: "GET", url: "/api/leads" })).json();

      expect(listAna.map((l: { id: string }) => l.id)).toEqual([leadAna]);
      expect(listBruno.map((l: { id: string }) => l.id)).toEqual([leadBruno]);
    });

    it("findOne de lead alheio responde 404", async () => {
      const cruzado = await requestAs(app, ana, {
        method: "GET",
        url: `/api/leads/${leadBruno}`,
      });
      expect(cruzado.statusCode).toBe(404);

      const proprio = await requestAs(app, bruno, {
        method: "GET",
        url: `/api/leads/${leadBruno}`,
      });
      expect(proprio.statusCode).toBe(200);
    });

    it("changeStatus em lead alheio responde 404 e não altera nada", async () => {
      const cruzado = await requestAs(app, ana, {
        method: "PATCH",
        url: `/api/leads/${leadBruno}/status`,
        payload: { status: "em_atendimento" },
      });
      expect(cruzado.statusCode).toBe(404);

      const ficha = await requestAs(app, bruno, {
        method: "GET",
        url: `/api/leads/${leadBruno}`,
      });
      expect(ficha.json().status).toBe("novo");
    });

    it("a checagem de WhatsApp duplicado é por corretor, não global", async () => {
      // Mesmo WhatsApp do lead do Bruno: para a Ana não é duplicado (e o 409
      // não pode vazar a existência do lead alheio).
      const response = await requestAs(app, ana, {
        method: "POST",
        url: "/api/leads",
        payload: { fullName: "Outro Cliente", whatsapp: "11999990002" },
      });
      expect(response.statusCode).toBe(201);
    });

    it("delete de lead alheio responde 404 e o lead continua existindo", async () => {
      const cruzado = await requestAs(app, ana, {
        method: "DELETE",
        url: `/api/leads/${leadBruno}`,
      });
      expect(cruzado.statusCode).toBe(404);

      const aindaExiste = await requestAs(app, bruno, {
        method: "GET",
        url: `/api/leads/${leadBruno}`,
      });
      expect(aindaExiste.statusCode).toBe(200);
    });
  });

  describe("/properties", () => {
    let imovelAna: string;
    let imovelBruno: string;

    const novoImovel = (title: string) => ({
      title,
      purpose: "venda",
      category: "residencial",
      type: "apartamento",
      origin: "captacao_propria",
    });

    beforeAll(async () => {
      const created = await Promise.all([
        requestAs(app, ana, {
          method: "POST",
          url: "/api/properties",
          payload: novoImovel("Apartamento da Ana"),
        }),
        requestAs(app, bruno, {
          method: "POST",
          url: "/api/properties",
          payload: novoImovel("Apartamento do Bruno"),
        }),
      ]);
      for (const response of created) expect(response.statusCode).toBe(201);
      imovelAna = created[0].json().id;
      imovelBruno = created[1].json().id;
    });

    it("list devolve só a carteira do corretor autenticado", async () => {
      const listAna = (
        await requestAs(app, ana, { method: "GET", url: "/api/properties" })
      ).json();
      const listBruno = (
        await requestAs(app, bruno, { method: "GET", url: "/api/properties" })
      ).json();

      expect(listAna.items.map((p: { id: string }) => p.id)).toEqual([imovelAna]);
      expect(listBruno.items.map((p: { id: string }) => p.id)).toEqual([imovelBruno]);
    });

    it("findOne de imóvel alheio responde 404", async () => {
      const cruzado = await requestAs(app, ana, {
        method: "GET",
        url: `/api/properties/${imovelBruno}`,
      });
      expect(cruzado.statusCode).toBe(404);

      const proprio = await requestAs(app, bruno, {
        method: "GET",
        url: `/api/properties/${imovelBruno}`,
      });
      expect(proprio.statusCode).toBe(200);
    });

    it("update em imóvel alheio responde 404 e não altera nada", async () => {
      const cruzado = await requestAs(app, ana, {
        method: "PATCH",
        url: `/api/properties/${imovelBruno}`,
        payload: { title: "Título invadido" },
      });
      expect(cruzado.statusCode).toBe(404);

      const ficha = await requestAs(app, bruno, {
        method: "GET",
        url: `/api/properties/${imovelBruno}`,
      });
      expect(ficha.json().title).toBe("Apartamento do Bruno");
    });

    it("changeStatus em imóvel alheio responde 404 e não altera nada", async () => {
      const cruzado = await requestAs(app, ana, {
        method: "PATCH",
        url: `/api/properties/${imovelBruno}/status`,
        payload: { status: "arquivado" },
      });
      expect(cruzado.statusCode).toBe(404);

      const ficha = await requestAs(app, bruno, {
        method: "GET",
        url: `/api/properties/${imovelBruno}`,
      });
      expect(ficha.json().status).toBe("rascunho");
    });

    it("duplicate de imóvel alheio responde 404 e não cria cópia", async () => {
      const cruzado = await requestAs(app, ana, {
        method: "POST",
        url: `/api/properties/${imovelBruno}/duplicate`,
      });
      expect(cruzado.statusCode).toBe(404);

      const listAna = (
        await requestAs(app, ana, { method: "GET", url: "/api/properties" })
      ).json();
      expect(listAna.items).toHaveLength(1);
    });

    it("delete de imóvel alheio responde 404 e o imóvel continua existindo", async () => {
      const cruzado = await requestAs(app, ana, {
        method: "DELETE",
        url: `/api/properties/${imovelBruno}`,
      });
      expect(cruzado.statusCode).toBe(404);

      const aindaExiste = await requestAs(app, bruno, {
        method: "GET",
        url: `/api/properties/${imovelBruno}`,
      });
      expect(aindaExiste.statusCode).toBe(200);
    });
  });
});
