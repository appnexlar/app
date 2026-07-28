import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type {
  LeadPreferenceView,
  SelectionCandidatesResult,
  SelectionSummary,
  SelectionView,
} from "@nexlar/shared";
import { createTestApp, registerBroker, requestAs, resetDatabase, type TestBroker } from "./e2e-utils";
import { PrismaService } from "../src/prisma/prisma.service";
import { RateLimitStore } from "../src/common/rate-limit/rate-limit.store";

/**
 * Fatia 1 da Seleção Personalizada: máquina de estados, prazo calculado no
 * servidor, composição dos itens e preferências da lead. O que se protege
 * aqui: transição proibida devolve 409, o front nunca escreve status, e um
 * corretor jamais toca a seleção do outro.
 */
describe("Seleções personalizadas: fundação", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    app.get(RateLimitStore).clearAll();
  });

  async function criarLead(broker: TestBroker, nome = "Mariana"): Promise<string> {
    const lead = await prisma.lead.create({
      data: {
        brokerId: broker.brokerId,
        fullName: nome,
        whatsapp: `1198888${Math.floor(Math.random() * 10_000)}`,
      },
    });
    return lead.id;
  }

  async function criarImovel(
    broker: TestBroker,
    overrides: { status?: "disponivel" | "arquivado"; title?: string } = {},
  ): Promise<string> {
    const imovel = await prisma.property.create({
      data: {
        brokerId: broker.brokerId,
        title: overrides.title ?? "Apartamento 2 dormitórios",
        purpose: "venda",
        category: "residencial",
        type: "apartamento",
        origin: "captacao_propria",
        status: overrides.status ?? "disponivel",
        city: "São Paulo",
      },
    });
    return imovel.id;
  }

  async function criarSelecao(broker: TestBroker, leadId: string): Promise<SelectionView> {
    const res = await requestAs(app, broker, {
      method: "POST",
      url: "/api/selections",
      payload: { leadId },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as SelectionView;
  }

  async function prontaParaAtivar(broker: TestBroker, leadId: string): Promise<SelectionView> {
    const selecao = await criarSelecao(broker, leadId);
    const imovelId = await criarImovel(broker);
    await requestAs(app, broker, {
      method: "POST",
      url: `/api/selections/${selecao.id}/items`,
      payload: { propertyId: imovelId },
    });
    await requestAs(app, broker, {
      method: "PATCH",
      url: `/api/selections/${selecao.id}`,
      payload: { expiresInDays: 15 },
    });
    return selecao;
  }

  it("nasce rascunho, sem prazo e sem token exposto por acaso", async () => {
    const ana = await registerBroker(app, "Ana", "ana.sel1@teste.dev");
    const leadId = await criarLead(ana);
    const selecao = await criarSelecao(ana, leadId);

    expect(selecao.status).toBe("rascunho");
    expect(selecao.activatedAt).toBeNull();
    expect(selecao.expiresAt).toBeNull();
    expect(selecao.items).toEqual([]);
    // Token existe desde o início, mas rascunho não abre em público.
    const publica = await app.inject({ method: "GET", url: `/api/public/shares/${selecao.publicToken}` });
    expect(publica.json().available).toBe(false);
  });

  it("ativação exige item e prazo, e o servidor calcula a expiração", async () => {
    const ana = await registerBroker(app, "Ana", "ana.sel2@teste.dev");
    const leadId = await criarLead(ana);
    const selecao = await criarSelecao(ana, leadId);

    // Sem item: recusa.
    const semItem = await requestAs(app, ana, { method: "POST", url: `/api/selections/${selecao.id}/activate` });
    expect(semItem.statusCode).toBe(400);

    const imovelId = await criarImovel(ana);
    await requestAs(app, ana, {
      method: "POST",
      url: `/api/selections/${selecao.id}/items`,
      payload: { propertyId: imovelId },
    });

    // Sem prazo: recusa.
    const semPrazo = await requestAs(app, ana, { method: "POST", url: `/api/selections/${selecao.id}/activate` });
    expect(semPrazo.statusCode).toBe(400);

    // Prazo fora das opções: o schema barra.
    const prazoInvalido = await requestAs(app, ana, {
      method: "PATCH",
      url: `/api/selections/${selecao.id}`,
      payload: { expiresInDays: 45 },
    });
    expect(prazoInvalido.statusCode).toBe(400);

    await requestAs(app, ana, {
      method: "PATCH",
      url: `/api/selections/${selecao.id}`,
      payload: { expiresInDays: 7 },
    });
    const ativada = await requestAs(app, ana, { method: "POST", url: `/api/selections/${selecao.id}/activate` });
    expect(ativada.statusCode).toBe(200);
    const view = ativada.json() as SelectionView;
    expect(view.status).toBe("ativa");
    expect(view.activatedAt).not.toBeNull();

    // Expiração = ativação + 7 dias, calculada no servidor.
    const dias =
      (new Date(view.expiresAt as string).getTime() - new Date(view.activatedAt as string).getTime()) / 86_400_000;
    expect(dias).toBeCloseTo(7, 5);

    // A timeline da lead registrou o marco.
    const atividades = await prisma.leadActivity.findMany({ where: { leadId, type: "selecao" } });
    expect(atividades.some((a) => a.description.includes("ativada"))).toBe(true);
  });

  it("bloqueia transições proibidas com 409 e permite as do mapa", async () => {
    const ana = await registerBroker(app, "Ana", "ana.sel3@teste.dev");
    const leadId = await criarLead(ana);

    // rascunho -> revogada: proibido.
    const s1 = await criarSelecao(ana, leadId);
    const r1 = await requestAs(app, ana, { method: "POST", url: `/api/selections/${s1.id}/revoke` });
    expect(r1.statusCode).toBe(409);

    // rascunho -> arquivada: permitido. arquivada -> ativa: proibido.
    const arq = await requestAs(app, ana, { method: "POST", url: `/api/selections/${s1.id}/archive` });
    expect(arq.statusCode).toBe(200);
    const reativar = await requestAs(app, ana, { method: "POST", url: `/api/selections/${s1.id}/activate` });
    expect(reativar.statusCode).toBe(409);

    // ativa -> revogada -> arquivada: caminho completo permitido.
    const s2 = await prontaParaAtivar(ana, leadId);
    await requestAs(app, ana, { method: "POST", url: `/api/selections/${s2.id}/activate` });
    const revogada = await requestAs(app, ana, { method: "POST", url: `/api/selections/${s2.id}/revoke` });
    expect(revogada.statusCode).toBe(200);
    expect((revogada.json() as SelectionView).revokedAt).not.toBeNull();

    // Revogada perde o acesso público na hora.
    const publica = await app.inject({ method: "GET", url: `/api/public/shares/${s2.publicToken}` });
    expect(publica.json().available).toBe(false);

    const arquivada = await requestAs(app, ana, { method: "POST", url: `/api/selections/${s2.id}/archive` });
    expect(arquivada.statusCode).toBe(200);
  });

  it("ativa com prazo vencido vira expirada na primeira leitura", async () => {
    const ana = await registerBroker(app, "Ana", "ana.sel4@teste.dev");
    const leadId = await criarLead(ana);
    const selecao = await prontaParaAtivar(ana, leadId);
    await requestAs(app, ana, { method: "POST", url: `/api/selections/${selecao.id}/activate` });

    // Volta o relógio direto no banco: o backend decide pela data, não pelo front.
    await prisma.propertySelection.update({
      where: { id: selecao.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const res = await requestAs(app, ana, { method: "GET", url: `/api/selections/${selecao.id}` });
    expect((res.json() as SelectionView).status).toBe("expirada");
    // E persistiu: o banco também diz expirada.
    const doBanco = await prisma.propertySelection.findUniqueOrThrow({ where: { id: selecao.id } });
    expect(doBanco.status).toBe("expirada");

    // Editar seleção encerrada: recusado.
    const editar = await requestAs(app, ana, {
      method: "PATCH",
      url: `/api/selections/${selecao.id}`,
      payload: { message: "oi" },
    });
    expect(editar.statusCode).toBe(409);
  });

  it("itens: sem duplicata, sem arquivado, no máximo 3 destaques, reordenação", async () => {
    const ana = await registerBroker(app, "Ana", "ana.sel5@teste.dev");
    const leadId = await criarLead(ana);
    const selecao = await criarSelecao(ana, leadId);

    const ids = await Promise.all([
      criarImovel(ana, { title: "Imóvel A" }),
      criarImovel(ana, { title: "Imóvel B" }),
      criarImovel(ana, { title: "Imóvel C" }),
      criarImovel(ana, { title: "Imóvel D" }),
    ]);
    for (const propertyId of ids) {
      const res = await requestAs(app, ana, {
        method: "POST",
        url: `/api/selections/${selecao.id}/items`,
        payload: { propertyId },
      });
      expect(res.statusCode).toBe(201);
    }

    // Duplicata: 409.
    const dup = await requestAs(app, ana, {
      method: "POST",
      url: `/api/selections/${selecao.id}/items`,
      payload: { propertyId: ids[0] },
    });
    expect(dup.statusCode).toBe(409);

    // Arquivado: 400.
    const arquivado = await criarImovel(ana, { status: "arquivado" });
    const recusado = await requestAs(app, ana, {
      method: "POST",
      url: `/api/selections/${selecao.id}/items`,
      payload: { propertyId: arquivado },
    });
    expect(recusado.statusCode).toBe(400);

    // Destaques: os 3 primeiros passam, o quarto é recusado.
    const view = (await requestAs(app, ana, { method: "GET", url: `/api/selections/${selecao.id}` })).json() as SelectionView;
    for (const item of view.items.slice(0, 3)) {
      const res = await requestAs(app, ana, {
        method: "PATCH",
        url: `/api/selections/${selecao.id}/items/${item.id}`,
        payload: { highlight: true },
      });
      expect(res.statusCode).toBe(200);
    }
    const quarto = await requestAs(app, ana, {
      method: "PATCH",
      url: `/api/selections/${selecao.id}/items/${view.items[3].id}`,
      payload: { highlight: true },
    });
    expect(quarto.statusCode).toBe(400);

    // Reordenar: a ordem enviada vira a ordem final.
    const invertida = view.items.map((i) => i.id).reverse();
    const reordenada = await requestAs(app, ana, {
      method: "PATCH",
      url: `/api/selections/${selecao.id}/items/reorder`,
      payload: { itemIds: invertida },
    });
    expect(reordenada.statusCode).toBe(200);
    expect((reordenada.json() as SelectionView).items.map((i) => i.id)).toEqual(invertida);

    // Reordenar com item de fora: 400.
    const errada = await requestAs(app, ana, {
      method: "PATCH",
      url: `/api/selections/${selecao.id}/items/reorder`,
      payload: { itemIds: invertida.slice(1) },
    });
    expect(errada.statusCode).toBe(400);

    // Remover não exclui o imóvel.
    const remover = await requestAs(app, ana, {
      method: "DELETE",
      url: `/api/selections/${selecao.id}/items/${view.items[0].id}`,
    });
    expect(remover.statusCode).toBe(200);
    expect(await prisma.property.count({ where: { id: view.items[0].propertyId } })).toBe(1);
  });

  it("prazo não é renovável depois de ativa e o histórico da lead lista tudo", async () => {
    const ana = await registerBroker(app, "Ana", "ana.sel6@teste.dev");
    const leadId = await criarLead(ana);
    const selecao = await prontaParaAtivar(ana, leadId);
    await requestAs(app, ana, { method: "POST", url: `/api/selections/${selecao.id}/activate` });

    const renovar = await requestAs(app, ana, {
      method: "PATCH",
      url: `/api/selections/${selecao.id}`,
      payload: { expiresInDays: 30 },
    });
    expect(renovar.statusCode).toBe(400);

    const historico = await requestAs(app, ana, { method: "GET", url: `/api/leads/${leadId}/selections` });
    expect(historico.statusCode).toBe(200);
    const linhas = historico.json() as SelectionSummary[];
    expect(linhas).toHaveLength(1);
    expect(linhas[0].status).toBe("ativa");
    expect(linhas[0].itemCount).toBe(1);
  });

  it("isolamento: seleção, itens e preferências de um corretor são invisíveis ao outro", async () => {
    const ana = await registerBroker(app, "Ana", "ana.sel7@teste.dev");
    const bruno = await registerBroker(app, "Bruno", "bruno.sel7@teste.dev");
    const leadDaAna = await criarLead(ana);
    const selecaoDaAna = await criarSelecao(ana, leadDaAna);

    // Bruno não lê, não edita, não ativa, não adiciona item.
    for (const tentativa of [
      { method: "GET" as const, url: `/api/selections/${selecaoDaAna.id}` },
      { method: "PATCH" as const, url: `/api/selections/${selecaoDaAna.id}`, payload: { message: "x" } },
      { method: "POST" as const, url: `/api/selections/${selecaoDaAna.id}/activate` },
      {
        method: "POST" as const,
        url: `/api/selections/${selecaoDaAna.id}/items`,
        payload: { propertyId: selecaoDaAna.id },
      },
    ]) {
      const res = await requestAs(app, bruno, tentativa);
      expect(res.statusCode).toBe(404);
    }

    // Bruno não cria seleção para lead da Ana.
    const roubo = await requestAs(app, bruno, {
      method: "POST",
      url: "/api/selections",
      payload: { leadId: leadDaAna },
    });
    expect(roubo.statusCode).toBe(404);

    // Bruno não lê nem escreve preferências da lead da Ana.
    const lerPref = await requestAs(app, bruno, { method: "GET", url: `/api/leads/${leadDaAna}/preferences` });
    expect(lerPref.statusCode).toBe(404);
  });

  it("preferências: salvar substitui o conjunto, validações de faixa funcionam", async () => {
    const ana = await registerBroker(app, "Ana", "ana.sel8@teste.dev");
    const leadId = await criarLead(ana);

    // Sem preferências ainda: nulo, não erro.
    const vazio = await requestAs(app, ana, { method: "GET", url: `/api/leads/${leadId}/preferences` });
    expect(vazio.statusCode).toBe(200);
    expect(vazio.body === "" || vazio.body === "null").toBe(true);

    // Faixa invertida: barrada pelo schema.
    const invertida = await requestAs(app, ana, {
      method: "PUT",
      url: `/api/leads/${leadId}/preferences`,
      payload: { priceMin: 500_000, priceMax: 300_000 },
    });
    expect(invertida.statusCode).toBe(400);

    const salvar = await requestAs(app, ana, {
      method: "PUT",
      url: `/api/leads/${leadId}/preferences`,
      payload: {
        purpose: "venda",
        cities: ["São Paulo"],
        neighborhoods: ["Moema", "Vila Mariana"],
        priceMax: 800_000,
        bedroomsMin: 2,
        features: ["varanda"],
        restrictions: "Nada em avenida movimentada",
      },
    });
    expect(salvar.statusCode).toBe(200);
    const pref = salvar.json() as LeadPreferenceView;
    expect(pref.neighborhoods).toEqual(["Moema", "Vila Mariana"]);
    expect(pref.priceMax).toBe(800_000);

    // Salvar de novo substitui: o que não veio, zera.
    const substituir = await requestAs(app, ana, {
      method: "PUT",
      url: `/api/leads/${leadId}/preferences`,
      payload: { purpose: "locacao", priceMax: 3_000 },
    });
    const depois = substituir.json() as LeadPreferenceView;
    expect(depois.purpose).toBe("locacao");
    expect(depois.neighborhoods).toEqual([]);
    expect(depois.bedroomsMin).toBeNull();

    // Continua havendo UMA linha por lead no banco.
    expect(await prisma.leadPreference.count({ where: { leadId } })).toBe(1);
  });

  it("candidatos: compatibilidade explicada ordena, filtros e busca funcionam", async () => {
    const ana = await registerBroker(app, "Ana", "ana.sel9@teste.dev");
    const leadId = await criarLead(ana);
    await requestAs(app, ana, {
      method: "PUT",
      url: `/api/leads/${leadId}/preferences`,
      payload: { purpose: "venda", priceMax: 500_000, neighborhoods: ["Moema"], bedroomsMin: 2 },
    });

    // Perfil perfeito: preço ok, bairro certo, quartos suficientes.
    const perfeito = await prisma.property.create({
      data: {
        brokerId: ana.brokerId,
        title: "Apartamento em Moema",
        purpose: "venda",
        category: "residencial",
        type: "apartamento",
        origin: "captacao_propria",
        status: "disponivel",
        city: "São Paulo",
        neighborhood: "Moema",
        salePrice: 480_000,
        details: { bedrooms: 3, bathrooms: 2 },
      },
    });
    // Um pouco acima do teto (dentro dos 20%), bairro errado: media/baixa.
    await prisma.property.create({
      data: {
        brokerId: ana.brokerId,
        title: "Casa na Vila Mariana",
        purpose: "venda",
        category: "residencial",
        type: "casa",
        origin: "captacao_propria",
        status: "disponivel",
        city: "São Paulo",
        neighborhood: "Vila Mariana",
        salePrice: 550_000,
        details: { bedrooms: 2 },
      },
    });
    // Muito acima do teto: fora do perfil.
    await prisma.property.create({
      data: {
        brokerId: ana.brokerId,
        title: "Cobertura cara",
        purpose: "venda",
        category: "residencial",
        type: "cobertura",
        origin: "captacao_propria",
        status: "disponivel",
        salePrice: 900_000,
        details: { bedrooms: 4 },
      },
    });
    // Só locação quando a lead quer comprar: fora do perfil.
    await prisma.property.create({
      data: {
        brokerId: ana.brokerId,
        title: "Studio para alugar",
        purpose: "locacao",
        category: "residencial",
        type: "studio",
        origin: "captacao_propria",
        status: "disponivel",
        rentPrice: 2_500,
      },
    });

    const selecao = await criarSelecao(ana, leadId);
    const res = await requestAs(app, ana, {
      method: "GET",
      url: `/api/selections/${selecao.id}/candidates`,
    });
    expect(res.statusCode).toBe(200);
    const busca = res.json() as SelectionCandidatesResult;
    expect(busca.total).toBe(4);

    // Alta primeiro, fora do perfil por último.
    expect(busca.items[0].propertyId).toBe(perfeito.id);
    expect(busca.items[0].compatibility).toBe("alta");
    expect(busca.items[0].compatibilityReasons.length).toBeGreaterThan(0);
    const niveis = busca.items.map((c) => c.compatibility);
    expect(niveis.slice(-2)).toEqual(["fora_do_perfil", "fora_do_perfil"]);

    // Filtro de preço máximo derruba os caros; busca textual acha por bairro.
    const baratos = (
      await requestAs(app, ana, {
        method: "GET",
        url: `/api/selections/${selecao.id}/candidates?priceMax=500000`,
      })
    ).json() as SelectionCandidatesResult;
    expect(baratos.items.every((c) => (c.price ?? 0) <= 500_000)).toBe(true);

    const porTexto = (
      await requestAs(app, ana, {
        method: "GET",
        url: `/api/selections/${selecao.id}/candidates?q=moema`,
      })
    ).json() as SelectionCandidatesResult;
    expect(porTexto.total).toBe(1);
    expect(porTexto.items[0].propertyId).toBe(perfeito.id);

    // Adicionado à seleção, o candidato volta marcado.
    await requestAs(app, ana, {
      method: "POST",
      url: `/api/selections/${selecao.id}/items`,
      payload: { propertyId: perfeito.id, origin: "preferencia" },
    });
    const depois = (
      await requestAs(app, ana, { method: "GET", url: `/api/selections/${selecao.id}/candidates` })
    ).json() as SelectionCandidatesResult;
    expect(depois.items.find((c) => c.propertyId === perfeito.id)?.inSelection).toBe(true);

    // E o item guardou a fotografia da compatibilidade e a origem.
    const view = (
      await requestAs(app, ana, { method: "GET", url: `/api/selections/${selecao.id}` })
    ).json() as SelectionView;
    expect(view.items[0].compatibility).toBe("alta");
    expect(view.items[0].origin).toBe("preferencia");
  });

  it("candidatos: histórico com a lead aparece e a carteira alheia não", async () => {
    const ana = await registerBroker(app, "Ana", "ana.sel10@teste.dev");
    const bruno = await registerBroker(app, "Bruno", "bruno.sel10@teste.dev");
    const leadId = await criarLead(ana);
    const imovelId = await criarImovel(ana, { title: "Já enviado antes" });
    await criarImovel(bruno, { title: "Imóvel do Bruno" });

    // Seleção anterior em que a lead descartou o imóvel.
    const antiga = await criarSelecao(ana, leadId);
    await requestAs(app, ana, {
      method: "POST",
      url: `/api/selections/${antiga.id}/items`,
      payload: { propertyId: imovelId },
    });
    const antigaView = (
      await requestAs(app, ana, { method: "GET", url: `/api/selections/${antiga.id}` })
    ).json() as SelectionView;
    await prisma.selectionItem.update({
      where: { id: antigaView.items[0].id },
      data: { response: "sem_interesse", responseReason: "preco", respondedAt: new Date() },
    });

    const nova = await criarSelecao(ana, leadId);
    const res = (
      await requestAs(app, ana, { method: "GET", url: `/api/selections/${nova.id}/candidates` })
    ).json() as SelectionCandidatesResult;

    // A carteira do Bruno não vaza.
    expect(res.items.some((c) => c.title === "Imóvel do Bruno")).toBe(false);

    // O descarte anterior chega com o motivo: reincluir é decisão consciente.
    const candidato = res.items.find((c) => c.propertyId === imovelId);
    expect(candidato?.history?.response).toBe("sem_interesse");
    expect(candidato?.history?.responseReason).toBe("preco");
  });

  it("código curto abre as mesmas rotas que o uuid, e o do outro corretor dá 404", async () => {
    const ana = await registerBroker(app, "Ana", "ana.codigo@teste.dev");
    const bruno = await registerBroker(app, "Bruno", "bruno.codigo@teste.dev");

    const leadId = await criarLead(ana);
    const selecao = await criarSelecao(ana, leadId);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });

    // O código sai nas respostas, é ele que o front põe na URL.
    expect(selecao.code).toBeGreaterThan(0);
    expect(selecao.leadCode).toBe(lead.code);

    // Abrir pelo código devolve exatamente o mesmo registro que o uuid.
    const porCodigo = await requestAs(app, ana, {
      method: "GET",
      url: `/api/selections/${selecao.code}`,
    });
    expect(porCodigo.statusCode).toBe(200);
    expect((porCodigo.json() as SelectionView).id).toBe(selecao.id);

    const leadPorCodigo = await requestAs(app, ana, {
      method: "GET",
      url: `/api/leads/${lead.code}`,
    });
    expect(leadPorCodigo.statusCode).toBe(200);

    // O código é sequencial e portanto adivinhável: a autorização continua
    // sendo por broker_id, então o Bruno não enxerga nada da Ana.
    const invasaoSelecao = await requestAs(app, bruno, {
      method: "GET",
      url: `/api/selections/${selecao.code}`,
    });
    expect(invasaoSelecao.statusCode).toBe(404);

    const invasaoLead = await requestAs(app, bruno, {
      method: "GET",
      url: `/api/leads/${lead.code}`,
    });
    expect(invasaoLead.statusCode).toBe(404);

    // Lixo no lugar do identificador não vira consulta ao banco.
    const invalido = await requestAs(app, ana, { method: "GET", url: "/api/selections/abc" });
    expect(invalido.statusCode).toBe(400);
  });

  it("fluxo da carteira: criar já com imóveis preserva a ordem e valida tudo antes", async () => {
    const ana = await registerBroker(app, "Ana", "ana.carteira@teste.dev");
    const bruno = await registerBroker(app, "Bruno", "bruno.carteira@teste.dev");
    const leadId = await criarLead(ana);

    const a = await criarImovel(ana, { title: "Apartamento A" });
    const b = await criarImovel(ana, { title: "Apartamento B" });
    const c = await criarImovel(ana, { title: "Apartamento C" });

    // A ordem do payload é a ordem em que o corretor marcou na carteira.
    const res = await requestAs(app, ana, {
      method: "POST",
      url: "/api/selections",
      payload: { leadId, propertyIds: [c, a, b] },
    });
    expect(res.statusCode).toBe(201);
    const view = res.json() as SelectionView;
    expect(view.status).toBe("rascunho");
    expect(view.items.map((i) => i.propertyTitle)).toEqual([
      "Apartamento C",
      "Apartamento A",
      "Apartamento B",
    ]);

    // Arquivado recusa a operação inteira: nada é criado pela metade.
    const arquivado = await criarImovel(ana, { status: "arquivado" });
    const comArquivado = await requestAs(app, ana, {
      method: "POST",
      url: "/api/selections",
      payload: { leadId, propertyIds: [a, arquivado] },
    });
    expect(comArquivado.statusCode).toBe(400);

    // Imóvel do Bruno no meio da lista: 404, e nada é criado.
    const doBruno = await criarImovel(bruno, { title: "Imóvel do Bruno" });
    const antes = await prisma.propertySelection.count({ where: { brokerId: ana.brokerId } });
    const invasao = await requestAs(app, ana, {
      method: "POST",
      url: "/api/selections",
      payload: { leadId, propertyIds: [a, doBruno] },
    });
    expect(invasao.statusCode).toBe(404);
    const depois = await prisma.propertySelection.count({ where: { brokerId: ana.brokerId } });
    expect(depois).toBe(antes);
  });
});
