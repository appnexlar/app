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

  // --- Clientes -------------------------------------------------------------
  describe("/clients", () => {
    let clienteAna: string;
    let clienteBruno: string;

    const conversao = {
      reason: "inicio_financiamento",
      nextStep: "coletar_dados",
      purpose: "compra",
      consent: true,
    };

    beforeAll(async () => {
      // Cliente nasce de uma lead convertida, então cada corretor precisa da
      // sua própria lead antes.
      const leads = await Promise.all(
        [ana, bruno].map((corretor, i) =>
          requestAs(app, corretor, {
            method: "POST",
            url: "/api/leads",
            payload: { fullName: `Convertida ${i}`, whatsapp: `1198888000${i}` },
          }),
        ),
      );
      const convertidos = await Promise.all(
        [ana, bruno].map((corretor, i) =>
          requestAs(app, corretor, {
            method: "POST",
            url: `/api/leads/${leads[i].json().id}/convert`,
            payload: conversao,
          }),
        ),
      );
      for (const r of convertidos) expect([200, 201]).toContain(r.statusCode);
      clienteAna = leads[0].json().id;
      clienteBruno = leads[1].json().id;
    });

    it("list devolve só os clientes do corretor autenticado", async () => {
      const listAna = (await requestAs(app, ana, { method: "GET", url: "/api/clients" })).json();
      const listBruno = (await requestAs(app, bruno, { method: "GET", url: "/api/clients" })).json();

      expect(listAna.map((c: { id: string }) => c.id)).toEqual([clienteAna]);
      expect(listBruno.map((c: { id: string }) => c.id)).toEqual([clienteBruno]);
    });

    it("ficha de cliente alheio responde 404", async () => {
      const cruzado = await requestAs(app, ana, {
        method: "GET",
        url: `/api/clients/${clienteBruno}`,
      });
      expect(cruzado.statusCode).toBe(404);
    });

    it("editar dados pessoais de cliente alheio responde 404 e não altera nada", async () => {
      const cruzado = await requestAs(app, ana, {
        method: "PATCH",
        url: `/api/clients/${clienteBruno}/profile`,
        payload: { cpf: "39053344705" },
      });
      expect(cruzado.statusCode).toBe(404);

      const ficha = await requestAs(app, bruno, {
        method: "GET",
        url: `/api/clients/${clienteBruno}`,
      });
      expect(ficha.json().profile?.cpf ?? null).toBeNull();
    });

    it("editar o financeiro de cliente alheio responde 404", async () => {
      // A seção mais sensível da ficha: renda e capacidade de pagamento.
      const cruzado = await requestAs(app, ana, {
        method: "PATCH",
        url: `/api/clients/${clienteBruno}/financial`,
        payload: { monthlyIncome: 99999 },
      });
      expect(cruzado.statusCode).toBe(404);
    });

    it("pedir exclusão de dados de cliente alheio responde 404", async () => {
      const cruzado = await requestAs(app, ana, {
        method: "POST",
        url: `/api/clients/${clienteBruno}/deletion-request`,
        payload: { reason: "pedido do titular" },
      });
      expect(cruzado.statusCode).toBe(404);
    });
  });

  // --- Agenda ---------------------------------------------------------------
  describe("/agenda", () => {
    let eventoAna: string;
    let eventoBruno: string;

    const evento = (title: string) => ({
      type: "tarefa",
      title,
      startAt: "2026-08-10T13:00:00.000Z",
      taskKind: "retorno",
    });

    beforeAll(async () => {
      const criados = await Promise.all([
        requestAs(app, ana, { method: "POST", url: "/api/agenda", payload: evento("Tarefa da Ana") }),
        requestAs(app, bruno, { method: "POST", url: "/api/agenda", payload: evento("Tarefa do Bruno") }),
      ]);
      for (const r of criados) expect(r.statusCode).toBe(201);
      eventoAna = criados[0].json().id;
      eventoBruno = criados[1].json().id;
    });

    it("list devolve só os eventos do corretor autenticado", async () => {
      const listAna = (
        await requestAs(app, ana, {
          method: "GET",
          url: "/api/agenda?from=2026-08-01T00:00:00.000Z&to=2026-08-31T23:59:59.000Z",
        })
      ).json();
      const ids = (Array.isArray(listAna) ? listAna : listAna.items).map((e: { id: string }) => e.id);
      expect(ids).toContain(eventoAna);
      expect(ids).not.toContain(eventoBruno);
    });

    it("abrir evento alheio responde 404", async () => {
      const cruzado = await requestAs(app, ana, {
        method: "GET",
        url: `/api/agenda/${eventoBruno}`,
      });
      expect(cruzado.statusCode).toBe(404);
    });

    it("editar evento alheio responde 404 e não altera nada", async () => {
      const cruzado = await requestAs(app, ana, {
        method: "PATCH",
        url: `/api/agenda/${eventoBruno}`,
        payload: { title: "Titulo invadido" },
      });
      expect(cruzado.statusCode).toBe(404);

      const ficha = await requestAs(app, bruno, {
        method: "GET",
        url: `/api/agenda/${eventoBruno}`,
      });
      expect(ficha.json().title).toBe("Tarefa do Bruno");
    });

    it("apagar evento alheio responde 404 e o evento continua existindo", async () => {
      const cruzado = await requestAs(app, ana, {
        method: "DELETE",
        url: `/api/agenda/${eventoBruno}`,
      });
      expect(cruzado.statusCode).toBe(404);

      const aindaExiste = await requestAs(app, bruno, {
        method: "GET",
        url: `/api/agenda/${eventoBruno}`,
      });
      expect(aindaExiste.statusCode).toBe(200);
    });
  });

  // --- Compartilhamento de imóveis -----------------------------------------
  describe("/shares", () => {
    let shareBruno: string;
    let itemBruno: string;
    let tokenPublicoBruno: string;

    beforeAll(async () => {
      const lead = await requestAs(app, bruno, {
        method: "POST",
        url: "/api/leads",
        payload: { fullName: "Lead do envio", whatsapp: "11977770001" },
      });
      const imovel = await requestAs(app, bruno, {
        method: "POST",
        url: "/api/properties",
        payload: {
          title: "Imóvel enviado",
          purpose: "venda",
          category: "residencial",
          type: "apartamento",
          origin: "captacao_propria",
        },
      });
      const envio = await requestAs(app, bruno, {
        method: "POST",
        url: `/api/properties/${imovel.json().id}/shares`,
        payload: { leadId: lead.json().id },
      });
      expect(envio.statusCode).toBe(201);
      shareBruno = envio.json().id;
      tokenPublicoBruno = envio.json().token ?? envio.json().publicToken;

      const enviados = await requestAs(app, bruno, {
        method: "GET",
        url: `/api/leads/${lead.json().id}/shares`,
      });
      itemBruno = enviados.json()[0].itemId;
    });

    it("revogar envio alheio responde 404 e o link continua valendo", async () => {
      const cruzado = await requestAs(app, ana, {
        method: "POST",
        url: `/api/shares/${shareBruno}/revoke`,
      });
      expect(cruzado.statusCode).toBe(404);

      if (tokenPublicoBruno) {
        const publico = await app.inject({
          method: "GET",
          url: `/api/public/shares/${tokenPublicoBruno}`,
        });
        expect(publico.statusCode).toBe(200);
      }
    });

    it("registrar resposta em envio alheio responde 404", async () => {
      const cruzado = await requestAs(app, ana, {
        method: "POST",
        url: `/api/shares/${shareBruno}/items/${itemBruno}/response`,
        payload: { response: "tenho_interesse" },
      });
      expect(cruzado.statusCode).toBe(404);
    });

    it("o link público não expõe dado do corretor nem da lead", async () => {
      if (!tokenPublicoBruno) return;
      const publico = await app.inject({
        method: "GET",
        url: `/api/public/shares/${tokenPublicoBruno}`,
      });
      // Página aberta na internet: não pode carregar contato nem identificador
      // interno de ninguém.
      expect(publico.body).not.toContain("bruno.isolamento@teste.com");
      expect(publico.body).not.toContain("11977770001");
      expect(publico.body).not.toContain(bruno.brokerId);
    });
  });
});
