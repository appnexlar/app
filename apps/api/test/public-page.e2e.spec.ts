import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type {
  ManagedPropertiesResponse,
  MyPublicPageState,
  PublicBrokerPageResponse,
  PublicListingResponse,
  PublicPropertyDetailResponse,
  SlugAvailability,
} from "@nexlar/shared";
import { createTestApp, registerBroker, requestAs, resetDatabase, type TestBroker } from "./e2e-utils";
import { PrismaService } from "../src/prisma/prisma.service";
import { PublicPageService } from "../src/public-page/public-page.service";
import { RateLimitStore } from "../src/common/rate-limit/rate-limit.store";

/**
 * e2e da fundação da Página Pública do Corretor: rascunho automático,
 * requisitos mínimos, slug (normalização, reserva, corrida) e a máquina de
 * estados com auditoria. A rota pública de visitante é de outra fatia.
 */
describe("Página Pública — fundação (modelo, estados, slug, requisitos)", () => {
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
    // O spec registra vários corretores no mesmo IP de teste; o limite de
    // cadastro não é o assunto aqui (quem o cobre é o auth.e2e).
    app.get(RateLimitStore).clearAll();
  });

  async function estado(broker: TestBroker): Promise<MyPublicPageState> {
    const res = await requestAs(app, broker, { method: "GET", url: "/api/public-page/me" });
    expect(res.statusCode).toBe(200);
    return res.json() as MyPublicPageState;
  }

  async function patch(
    broker: TestBroker,
    payload: Record<string, unknown>,
  ): Promise<{ statusCode: number; body: MyPublicPageState }> {
    const res = await requestAs(app, broker, {
      method: "PATCH",
      url: "/api/public-page/me",
      payload,
    });
    return { statusCode: res.statusCode, body: res.json() };
  }

  /**
   * Cria um imóvel elegível (disponível, com cidade e foto autorizada) e já
   * publicado na vitrine, salvo se o teste pedir outra coisa.
   */
  async function criarImovel(
    broker: TestBroker,
    overrides: {
      title?: string;
      status?: "rascunho" | "disponivel" | "vendido" | "arquivado" | "reservado";
      city?: string | null;
      comFoto?: boolean;
      fotoAutorizada?: boolean;
      visibility?: "privado" | "publico" | "oculto";
    } = {},
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
        city: overrides.city === undefined ? "São Paulo" : overrides.city,
        publicVisibility: overrides.visibility ?? "publico",
      },
    });
    if (overrides.comFoto !== false) {
      await prisma.propertyMedia.create({
        data: {
          brokerId: broker.brokerId,
          propertyId: imovel.id,
          kind: "foto",
          authorized: overrides.fotoAutorizada ?? true,
          status: "pronto",
          isCover: true,
          storagePath: `brokers/${broker.brokerId}/properties/${imovel.id}/images/x`,
        },
      });
    }
    return imovel.id;
  }

  /**
   * Deixa a conta com TODOS os requisitos mínimos cumpridos. Os dados que a
   * página não edita (foto, CRECI, imóvel publicado) entram direto pelo banco:
   * quem cobre o upload e o cadastro é o teste de cada módulo.
   */
  async function cumprirRequisitos(broker: TestBroker, slug: string): Promise<void> {
    await prisma.broker.update({
      where: { id: broker.brokerId },
      data: { avatarUrl: "https://cdn.exemplo/foto.jpg", creci: "123456", creciUf: "SP" },
    });
    await criarImovel(broker);
    const r = await patch(broker, {
      slug,
      mainCity: "São Paulo",
      publicWhatsapp: "11999998888",
      acceptPublicationTerms: true,
    });
    expect(r.statusCode).toBe(200);
  }

  // -------------------------------------------------------------------------
  // Rascunho e requisitos
  // -------------------------------------------------------------------------

  it("primeira visita cria rascunho pré-preenchido e lista os 8 requisitos", async () => {
    const ana = await registerBroker(app, "Ana Corretora", "ana.pp@teste.dev");
    const st = await estado(ana);

    expect(st.page.status).toBe("rascunho");
    expect(st.page.professionalName).toBe("Ana Corretora");
    expect(st.requirements.total).toBe(8);
    expect(st.requirements.canPublish).toBe(false);

    const nome = st.requirements.items.find((i) => i.key === "nome_profissional");
    expect(nome?.completed).toBe(true); // veio do pré-preenchimento
    const foto = st.requirements.items.find((i) => i.key === "foto");
    expect(foto?.completed).toBe(false);
    expect(foto?.actionUrl).toBeTruthy();
  });

  it("publicar sem requisitos falha com as pendências e marca incompleta", async () => {
    const ana = await registerBroker(app, "Ana", "ana.pub@teste.dev");
    await estado(ana);

    const res = await requestAs(app, ana, { method: "POST", url: "/api/public-page/me/publicar" });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.details?.requirements?.length).toBeGreaterThan(0);

    const st = await estado(ana);
    expect(st.page.status).toBe("incompleta");
  });

  it("com todos os requisitos, publica; página ativa que perde requisito cai para incompleta", async () => {
    const ana = await registerBroker(app, "Ana", "ana.ok@teste.dev");
    await estado(ana);
    await cumprirRequisitos(ana, "ana-corretora");

    const pub = await requestAs(app, ana, { method: "POST", url: "/api/public-page/me/publicar" });
    expect(pub.statusCode).toBe(201);
    expect((pub.json() as MyPublicPageState).page.status).toBe("ativa");

    // O único imóvel elegível sai do ar: a página não pode continuar ativa.
    await prisma.property.updateMany({
      where: { brokerId: ana.brokerId },
      data: { status: "vendido" },
    });
    const st = await estado(ana);
    expect(st.page.status).toBe("incompleta");
    expect(st.requirements.items.find((i) => i.key === "imovel_elegivel")?.completed).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Slug
  // -------------------------------------------------------------------------

  it("normaliza a digitação do corretor para o slug canônico", async () => {
    const ana = await registerBroker(app, "Ana", "ana.slug@teste.dev");
    await estado(ana);

    const r = await patch(ana, { slug: "  Ana  Núñes García! " });
    expect(r.statusCode).toBe(200);
    expect(r.body.page.slug).toBe("ana-nunes-garcia");
  });

  it("recusa slug reservado e slug curto demais", async () => {
    const ana = await registerBroker(app, "Ana", "ana.res@teste.dev");
    await estado(ana);

    expect((await patch(ana, { slug: "Admin" })).statusCode).toBe(400);
    expect((await patch(ana, { slug: "ab" })).statusCode).toBe(400);
  });

  it("dois corretores não podem ter o mesmo endereço (constraint decide a corrida)", async () => {
    const ana = await registerBroker(app, "Ana", "ana.dup@teste.dev");
    const bruno = await registerBroker(app, "Bruno", "bruno.dup@teste.dev");
    await estado(ana);
    await estado(bruno);

    expect((await patch(ana, { slug: "imoveis-premium" })).statusCode).toBe(200);
    expect((await patch(bruno, { slug: "Imóveis Premium" })).statusCode).toBe(409);
  });

  it("checagem de disponibilidade explica o motivo e ignora o próprio dono", async () => {
    const ana = await registerBroker(app, "Ana", "ana.disp@teste.dev");
    await estado(ana);
    await patch(ana, { slug: "ana-imoveis" });

    async function checa(slug: string): Promise<SlugAvailability> {
      const res = await requestAs(app, ana, {
        method: "GET",
        url: `/api/public-page/slug?slug=${encodeURIComponent(slug)}`,
      });
      expect(res.statusCode).toBe(200);
      return res.json() as SlugAvailability;
    }

    expect((await checa("Ana Imóveis")).available).toBe(true); // o dela mesma
    expect((await checa("suporte")).reason).toBe("reservado");
    expect((await checa("!!")).reason).toBe("invalido");

    const bruno = await registerBroker(app, "Bruno", "bruno.disp@teste.dev");
    const res = await requestAs(app, bruno, {
      method: "GET",
      url: "/api/public-page/slug?slug=ana-imoveis",
    });
    expect((res.json() as SlugAvailability).reason).toBe("em_uso");
  });

  // -------------------------------------------------------------------------
  // Máquina de estados
  // -------------------------------------------------------------------------

  it("pausar exige página ativa; reativar volta a exigir requisitos; auditoria registra tudo", async () => {
    const ana = await registerBroker(app, "Ana", "ana.maq@teste.dev");
    await estado(ana);

    // Pausar um rascunho não faz sentido.
    const pausaCedo = await requestAs(app, ana, { method: "POST", url: "/api/public-page/me/pausar" });
    expect(pausaCedo.statusCode).toBe(400);

    await cumprirRequisitos(ana, "ana-maquina");
    await requestAs(app, ana, { method: "POST", url: "/api/public-page/me/publicar" });

    const pausa = await requestAs(app, ana, { method: "POST", url: "/api/public-page/me/pausar" });
    expect(pausa.statusCode).toBe(201);
    expect((pausa.json() as MyPublicPageState).page.status).toBe("pausada");
    expect((pausa.json() as MyPublicPageState).page.pausedAt).toBeTruthy();

    const republica = await requestAs(app, ana, { method: "POST", url: "/api/public-page/me/publicar" });
    expect(republica.statusCode).toBe(201);
    expect((republica.json() as MyPublicPageState).page.status).toBe("ativa");

    const trilha = await prisma.auditLog.findMany({
      where: { brokerId: ana.brokerId, action: "pagina_publica_status" },
      orderBy: { createdAt: "asc" },
    });
    const transicoes = trilha.map((t) => {
      const m = t.metadata as { de: string; para: string };
      return `${m.de}->${m.para}`;
    });
    expect(transicoes).toEqual(["rascunho->ativa", "ativa->pausada", "pausada->ativa"]);
  });

  it("página restrita não publica nem pausa pelo front", async () => {
    const ana = await registerBroker(app, "Ana", "ana.rest@teste.dev");
    await estado(ana);
    await cumprirRequisitos(ana, "ana-restrita");

    // Restrição é administrativa (script), então entra pelo serviço.
    await app.get(PublicPageService).restrict(ana.brokerId, "denuncia em apuração");

    const pub = await requestAs(app, ana, { method: "POST", url: "/api/public-page/me/publicar" });
    expect(pub.statusCode).toBe(403);
    const pausa = await requestAs(app, ana, { method: "POST", url: "/api/public-page/me/pausar" });
    expect(pausa.statusCode).toBe(403);

    const st = await estado(ana);
    expect(st.page.status).toBe("restrita");
  });

  it("remover o slug de página ativa é bloqueado (link no ar não pode morrer)", async () => {
    const ana = await registerBroker(app, "Ana", "ana.link@teste.dev");
    await estado(ana);
    await cumprirRequisitos(ana, "ana-link");
    await requestAs(app, ana, { method: "POST", url: "/api/public-page/me/publicar" });

    expect((await patch(ana, { slug: null })).statusCode).toBe(400);
  });

  // -------------------------------------------------------------------------
  // Imóveis da vitrine: elegibilidade, visibilidade e destaques
  // -------------------------------------------------------------------------

  async function gerenciador(broker: TestBroker): Promise<ManagedPropertiesResponse> {
    const res = await requestAs(app, broker, {
      method: "GET",
      url: "/api/public-page/me/imoveis",
    });
    expect(res.statusCode).toBe(200);
    return res.json() as ManagedPropertiesResponse;
  }

  function publicar(broker: TestBroker, id: string, visibility = "publico") {
    return requestAs(app, broker, {
      method: "PATCH",
      url: `/api/public-page/me/imoveis/${id}/visibilidade`,
      payload: { visibility },
    });
  }

  it("imóvel cadastrado nasce público: anúncio é para ser visto", async () => {
    const ana = await registerBroker(app, "Ana", "ana.padrao@teste.dev");

    // Sem dizer nada sobre visibilidade: vale o padrão do banco.
    const imovel = await prisma.property.create({
      data: {
        brokerId: ana.brokerId,
        title: "Cadastrado sem escolher visibilidade",
        purpose: "venda",
        category: "residencial",
        type: "apartamento",
        origin: "captacao_propria",
        status: "disponivel",
        city: "São Paulo",
      },
    });

    expect(imovel.publicVisibility).toBe("publico");
  });

  it("publicar todos põe no ar só os elegíveis e não toca no que tem pendência", async () => {
    const ana = await registerBroker(app, "Ana", "ana.lote@teste.dev");
    const bruno = await registerBroker(app, "Bruno", "bruno.lote@teste.dev");

    await criarImovel(ana, { title: "Pronto 1", visibility: "privado" });
    await criarImovel(ana, { title: "Pronto 2", visibility: "oculto" });
    await criarImovel(ana, { title: "Sem foto", comFoto: false, visibility: "privado" });
    const doBruno = await criarImovel(bruno, { title: "Do Bruno", visibility: "privado" });

    const res = await requestAs(app, ana, {
      method: "POST",
      url: "/api/public-page/me/imoveis/publicar-todos",
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().publicados).toBe(2);

    const depois = await gerenciador(ana);
    expect(depois.summary.publicados).toBe(2);
    expect(depois.summary.prontos).toBe(0);
    expect(depois.items.find((i) => i.title === "Sem foto")?.visibility).toBe("privado");

    // Isolamento: o lote de um corretor não encosta na carteira do outro.
    const outro = await prisma.property.findUniqueOrThrow({ where: { id: doBruno } });
    expect(outro.publicVisibility).toBe("privado");
  });

  it("o gerenciador separa publicados, prontos e pendentes", async () => {
    const ana = await registerBroker(app, "Ana", "ana.ger@teste.dev");

    const pronto = await criarImovel(ana, { title: "Pronto", visibility: "privado" });
    await criarImovel(ana, { title: "Rascunho", status: "rascunho", visibility: "privado" });
    await criarImovel(ana, { title: "Sem foto", comFoto: false, visibility: "privado" });

    const antes = await gerenciador(ana);
    expect(antes.summary.publicados).toBe(0);
    expect(antes.summary.prontos).toBe(1);
    expect(antes.summary.comPendencia).toBe(2);
    expect(antes.items.find((i) => i.title === "Pronto")?.visibility).toBe("privado");

    expect((await publicar(ana, pronto)).statusCode).toBe(200);
    const depois = await gerenciador(ana);
    expect(depois.summary.publicados).toBe(1);
    expect(depois.items.find((i) => i.id === pronto)?.coverUrl).toContain("/media/");
  });

  it("cada regra de inelegibilidade tem seu motivo e publicar é recusado", async () => {
    const ana = await registerBroker(app, "Ana", "ana.eleg@teste.dev");

    const casos: [string, Record<string, unknown>, string][] = [
      ["rascunho", { status: "rascunho" }, "rascunho"],
      ["vendido", { status: "vendido" }, "vendido"],
      ["reservado", { status: "reservado" }, "indisponivel"],
      ["sem foto", { comFoto: false }, "sem_foto"],
      ["sem cidade", { city: null }, "sem_localizacao"],
    ];

    for (const [titulo, overrides, code] of casos) {
      const id = await criarImovel(ana, { title: titulo, visibility: "privado", ...overrides });
      const lista = await gerenciador(ana);
      const item = lista.items.find((i) => i.id === id);
      expect(item?.eligibility.eligible, titulo).toBe(false);
      expect(item?.eligibility.reasons.map((r) => r.code), titulo).toContain(code);

      const res = await publicar(ana, id);
      expect(res.statusCode, titulo).toBe(400);
      expect(res.json().details?.reasons?.length).toBeGreaterThan(0);
    }
  });

  it("destaques: no máximo seis, só publicados, e ordem preservada", async () => {
    const ana = await registerBroker(app, "Ana", "ana.dest@teste.dev");
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) ids.push(await criarImovel(ana, { title: `Imóvel ${i}` }));

    const setar = (propertyIds: string[]) =>
      requestAs(app, ana, {
        method: "PUT",
        url: "/api/public-page/me/destaques",
        payload: { propertyIds },
      });

    expect((await setar(ids)).statusCode).toBe(400); // 7 é demais
    expect((await setar([ids[0], ids[0]])).statusCode).toBe(400); // repetido

    const ok = await setar([ids[2], ids[0], ids[1]]);
    expect(ok.statusCode).toBe(200);
    const lista = (ok.json() as ManagedPropertiesResponse).items;
    expect(lista.find((i) => i.id === ids[2])?.highlightOrder).toBe(1);
    expect(lista.find((i) => i.id === ids[0])?.highlightOrder).toBe(2);
    expect(lista.find((i) => i.id === ids[1])?.highlightOrder).toBe(3);

    // Um imóvel privado não pode ser destaque.
    const privado = await criarImovel(ana, { title: "Privado", visibility: "privado" });
    expect((await setar([privado])).statusCode).toBe(400);
  });

  it("tirar do ar remove o destaque e renumera os que ficaram", async () => {
    const ana = await registerBroker(app, "Ana", "ana.renum@teste.dev");
    const a = await criarImovel(ana, { title: "A" });
    const b = await criarImovel(ana, { title: "B" });
    const c = await criarImovel(ana, { title: "C" });

    await requestAs(app, ana, {
      method: "PUT",
      url: "/api/public-page/me/destaques",
      payload: { propertyIds: [a, b, c] },
    });

    expect((await publicar(ana, b, "oculto")).statusCode).toBe(200);

    const lista = await gerenciador(ana);
    expect(lista.items.find((i) => i.id === b)?.highlightOrder).toBeNull();
    expect(lista.items.find((i) => i.id === a)?.highlightOrder).toBe(1);
    expect(lista.items.find((i) => i.id === c)?.highlightOrder).toBe(2); // era 3
  });

  it("imóvel vendido por fora derruba o destaque e a página ativa", async () => {
    const ana = await registerBroker(app, "Ana", "ana.vend@teste.dev");
    await estado(ana);
    await cumprirRequisitos(ana, "ana-vendido");
    await requestAs(app, ana, { method: "POST", url: "/api/public-page/me/publicar" });

    const lista = await gerenciador(ana);
    const id = lista.items[0].id;
    await requestAs(app, ana, {
      method: "PUT",
      url: "/api/public-page/me/destaques",
      payload: { propertyIds: [id] },
    });

    // Venda registrada pelo módulo de imóveis, sem passar pela vitrine.
    await prisma.property.update({ where: { id }, data: { status: "vendido" } });

    const depois = await gerenciador(ana);
    expect(depois.items.find((i) => i.id === id)?.highlightOrder).toBeNull();
    expect((await estado(ana)).page.status).toBe("incompleta");
  });

  it("isolamento: um corretor não publica nem destaca o imóvel do outro", async () => {
    const ana = await registerBroker(app, "Ana", "ana.isoim@teste.dev");
    const bruno = await registerBroker(app, "Bruno", "bruno.isoim@teste.dev");
    const daAna = await criarImovel(ana, { visibility: "privado" });

    expect((await publicar(bruno, daAna)).statusCode).toBe(404);
    const destaque = await requestAs(app, bruno, {
      method: "PUT",
      url: "/api/public-page/me/destaques",
      payload: { propertyIds: [daAna] },
    });
    expect(destaque.statusCode).toBe(404);
    expect((await gerenciador(bruno)).items).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Foto de perfil (requisito da publicação)
  // -------------------------------------------------------------------------

  /** Multipart montado à mão, mesmo molde do teste de CRECI do auth.e2e. */
  async function enviarAvatar(
    broker: TestBroker,
    arquivo: { filename: string; contentType: string } = {
      filename: "foto.png",
      contentType: "image/png",
    },
  ) {
    const boundary = "----NexlarAvatar123";
    const corpo = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${arquivo.filename}"\r\n` +
          `Content-Type: ${arquivo.contentType}\r\n\r\n`,
      ),
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return app.inject({
      method: "POST",
      url: "/api/brokers/me/avatar",
      headers: {
        authorization: `Bearer ${broker.accessToken}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: corpo,
    });
  }

  it("upload da foto cumpre o requisito; PDF é recusado; a foto é servida ao dono", async () => {
    const ana = await registerBroker(app, "Ana", "ana.foto@teste.dev");
    await estado(ana);

    const pdf = await enviarAvatar(ana, { filename: "doc.pdf", contentType: "application/pdf" });
    expect(pdf.statusCode).toBe(400);

    const ok = await enviarAvatar(ana);
    expect(ok.statusCode).toBe(201);
    expect(ok.json().avatarUrl).toMatch(/^\/api\/brokers\/me\/avatar\?v=/);

    const st = await estado(ana);
    expect(st.requirements.items.find((i) => i.key === "foto")?.completed).toBe(true);

    const servida = await requestAs(app, ana, { method: "GET", url: "/api/brokers/me/avatar" });
    expect(servida.statusCode).toBe(200);
    expect(servida.headers["content-type"]).toBe("image/png");

    // Remover volta a pendência.
    const removida = await requestAs(app, ana, { method: "DELETE", url: "/api/brokers/me/avatar" });
    expect(removida.statusCode).toBe(200);
    const depois = await estado(ana);
    expect(depois.requirements.items.find((i) => i.key === "foto")?.completed).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Vitrine pública (/public/corretor/:slug)
  // -------------------------------------------------------------------------

  async function vitrine(slug: string): Promise<{ statusCode: number; body: PublicBrokerPageResponse }> {
    // Sem token de propósito: é a visão de quem nunca fez login.
    const res = await app.inject({ method: "GET", url: `/api/public/corretor/${slug}` });
    return { statusCode: res.statusCode, body: res.json() };
  }

  it("página ativa responde a vitrine completa, sem dado privado", async () => {
    const ana = await registerBroker(app, "Ana Vitrine", "ana.vit@teste.dev");
    await estado(ana);
    await cumprirRequisitos(ana, "ana-vitrine-pub");
    await patch(ana, { headline: "Especialista na zona sul", bio: "Vinte anos de mercado." });
    await requestAs(app, ana, { method: "POST", url: "/api/public-page/me/publicar" });

    const { statusCode, body } = await vitrine("ana-vitrine-pub");
    expect(statusCode).toBe(200);
    expect(body.available).toBe(true);
    expect(body.page?.name).toBe("Ana Vitrine");
    expect(body.page?.headline).toBe("Especialista na zona sul");
    expect(body.page?.whatsapp).toBe("11999998888");
    expect(body.page?.totalProperties).toBe(1);
    expect(body.page?.properties[0]?.locationLine).toContain("São Paulo");

    // Nada de e-mail de login, id interno ou notas.
    const bruto = JSON.stringify(body);
    expect(bruto).not.toContain("ana.vit@teste.dev");
    expect(bruto).not.toContain(ana.brokerId);
    // CRECI não verificado não sai, mesmo informado.
    expect(body.page?.verified).toBe(false);
    expect(body.page?.creci).toBeNull();
  });

  it("pausada, restrita ou inexistente: mesma resposta indisponível, sem motivo", async () => {
    const ana = await registerBroker(app, "Ana", "ana.off@teste.dev");
    await estado(ana);
    await cumprirRequisitos(ana, "ana-fechada");
    await requestAs(app, ana, { method: "POST", url: "/api/public-page/me/publicar" });
    await requestAs(app, ana, { method: "POST", url: "/api/public-page/me/pausar" });

    const pausada = await vitrine("ana-fechada");
    const inexistente = await vitrine("nao-existe");
    expect(pausada.statusCode).toBe(200);
    expect(pausada.body).toEqual({ available: false, page: null });
    expect(inexistente.body).toEqual(pausada.body); // indistinguíveis de fora

    expect(JSON.stringify(pausada.body)).not.toContain("pausada");
  });

  it("vitrine só lista imóvel público e elegível; foto sai pela rota pública validada", async () => {
    const ana = await registerBroker(app, "Ana", "ana.fotos@teste.dev");
    await estado(ana);
    await cumprirRequisitos(ana, "ana-fotos");
    // Ruído que NÃO pode aparecer: privado, e público que virou vendido.
    await criarImovel(ana, { title: "Privado", visibility: "privado" });
    const vendido = await criarImovel(ana, { title: "Vendido" });
    await prisma.property.update({ where: { id: vendido }, data: { status: "vendido" } });
    await requestAs(app, ana, { method: "POST", url: "/api/public-page/me/publicar" });

    const { body } = await vitrine("ana-fotos");
    expect(body.page?.properties.map((p) => p.title)).toEqual(["Apartamento 2 dormitórios"]);

    const capa = body.page?.properties[0]?.coverUrl;
    expect(capa).toMatch(/^\/api\/public\/corretor\/ana-fotos\/imoveis\/\d+\/foto\//);

    // A foto do imóvel vendido não sai nem com URL adivinhada.
    const doVendido = await prisma.propertyMedia.findFirstOrThrow({ where: { propertyId: vendido } });
    const codeVendido = (await prisma.property.findUniqueOrThrow({ where: { id: vendido } })).code;
    const roubo = await app.inject({
      method: "GET",
      url: `/api/public/corretor/ana-fotos/imoveis/${codeVendido}/foto/${doVendido.id}`,
    });
    expect(roubo.statusCode).toBe(404);
  });

  it("prévia é do dono, funciona sem página ativa e exige login", async () => {
    const ana = await registerBroker(app, "Ana", "ana.previa@teste.dev");
    await estado(ana); // rascunho, longe de publicável

    const semLogin = await app.inject({ method: "GET", url: "/api/public-page/me/preview" });
    expect(semLogin.statusCode).toBe(401);

    const res = await requestAs(app, ana, { method: "GET", url: "/api/public-page/me/preview" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as PublicBrokerPageResponse;
    expect(body.available).toBe(true);
    expect(body.page?.name).toBe("Ana");
  });

  // -------------------------------------------------------------------------
  // Listagem pública: busca, filtros, ordenação, paginação
  // -------------------------------------------------------------------------

  /** Monta uma vitrine ativa com carteira variada e devolve o corretor. */
  async function montarVitrine(slug: string, email: string): Promise<TestBroker> {
    const dona = await registerBroker(app, "Dona Vitrine", email);
    await estado(dona);
    await cumprirRequisitos(dona, slug);

    const criar = (dados: {
      title: string;
      purpose?: "venda" | "locacao";
      price?: number;
      neighborhood?: string;
      details?: Record<string, number>;
      internalNotes?: string;
    }) =>
      criarImovelCompleto(dona, dados);

    await criar({ title: "Cobertura na Vila Nova", purpose: "venda", price: 2_000_000, neighborhood: "Vila Nova", details: { bedrooms: 4, bathrooms: 3, parkingSpots: 3, builtArea: 220 } });
    await criar({ title: "Kitnet perto do metrô", purpose: "locacao", price: 1_800, neighborhood: "Centro", details: { bedrooms: 1, bathrooms: 1, totalArea: 28 } });
    await criar({ title: "Casa com quintal", purpose: "venda", price: 850_000, neighborhood: "Jardim Europa", details: { bedrooms: 3, bathrooms: 2, parkingSpots: 2, builtArea: 150 }, internalNotes: "Proprietário aceita 780 mil" });

    await requestAs(app, dona, { method: "POST", url: "/api/public-page/me/publicar" });
    return dona;
  }

  /** Imóvel publicado com campos completos, direto no banco. */
  async function criarImovelCompleto(
    broker: TestBroker,
    dados: {
      title: string;
      purpose?: "venda" | "locacao";
      price?: number;
      neighborhood?: string;
      details?: Record<string, number>;
      internalNotes?: string;
    },
  ): Promise<number> {
    const purpose = dados.purpose ?? "venda";
    const imovel = await prisma.property.create({
      data: {
        brokerId: broker.brokerId,
        title: dados.title,
        purpose,
        category: "residencial",
        type: "Apartamento",
        origin: "captacao_propria",
        status: "disponivel",
        city: "São Paulo",
        state: "SP",
        street: "Rua Secreta",
        addressNumber: "123",
        addressDisplay: "bairro_cidade",
        neighborhood: dados.neighborhood ?? "Moema",
        salePrice: purpose === "venda" ? (dados.price ?? 500_000) : null,
        rentPrice: purpose === "locacao" ? (dados.price ?? 3_000) : null,
        details: dados.details ?? {},
        internalNotes: dados.internalNotes,
        commissionNotes: "6% negociável",
        publicVisibility: "publico",
      },
    });
    await prisma.propertyMedia.create({
      data: {
        brokerId: broker.brokerId,
        propertyId: imovel.id,
        kind: "foto",
        authorized: true,
        status: "pronto",
        isCover: true,
        caption: "Fachada",
        storagePath: `brokers/${broker.brokerId}/properties/${imovel.id}/images/x`,
      },
    });
    return imovel.code;
  }

  async function listar(slug: string, params = ""): Promise<{ statusCode: number; body: PublicListingResponse }> {
    const res = await app.inject({
      method: "GET",
      url: `/api/public/corretor/${slug}/imoveis${params ? `?${params}` : ""}`,
    });
    return { statusCode: res.statusCode, body: res.json() };
  }

  it("listagem pública: busca, filtros, ordenação e facetas", async () => {
    await montarVitrine("vitrine-lista", "dona.lista@teste.dev");

    // Sem filtro: os 3 da carteira + o do cumprirRequisitos.
    const tudo = await listar("vitrine-lista");
    expect(tudo.statusCode).toBe(200);
    expect(tudo.body.total).toBe(4);
    expect(tudo.body.facets.neighborhoods).toContain("Vila Nova");

    // Busca textual normalizada (sem acento).
    const busca = await listar("vitrine-lista", "q=vila%20nova");
    expect(busca.body.total).toBe(1);
    expect(busca.body.items[0]?.title).toBe("Cobertura na Vila Nova");

    // Filtro por finalidade + preço.
    const locacao = await listar("vitrine-lista", "purpose=locacao");
    expect(locacao.body.items.map((i) => i.title)).toEqual(["Kitnet perto do metrô"]);

    const faixa = await listar("vitrine-lista", "purpose=venda&maxPrice=1000000&bedrooms=3");
    expect(faixa.body.items.map((i) => i.title)).toEqual(["Casa com quintal"]);

    // Ordenação por menor preço: kitnet (1.800) primeiro; sem preço ("sob
    // consulta") vai para o fim, atrás até da cobertura de 2 milhões.
    const porPreco = await listar("vitrine-lista", "sort=menor_preco");
    expect(porPreco.body.items[0]?.title).toBe("Kitnet perto do metrô");
    expect(porPreco.body.items.at(-2)?.title).toBe("Cobertura na Vila Nova");
    expect(porPreco.body.items.at(-1)?.priceLabel).toBe("Valor sob consulta");

    // Entrada inválida é recusada, não ignorada.
    const invalida = await listar("vitrine-lista", "minPrice=abc");
    expect(invalida.statusCode).toBe(400);
    const abusiva = await listar("vitrine-lista", "page=9999999");
    expect(abusiva.statusCode).toBe(400);
  });

  it("listagem pagina em blocos e não responde para página pausada", async () => {
    const dona = await montarVitrine("vitrine-pag", "dona.pag@teste.dev");
    // Sobe para 14 publicáveis (4 já existem).
    for (let i = 0; i < 10; i++) {
      await criarImovelCompleto(dona, { title: `Unidade ${i + 1}` });
    }

    const p1 = await listar("vitrine-pag");
    expect(p1.body.total).toBe(14);
    expect(p1.body.items).toHaveLength(12);
    const p2 = await listar("vitrine-pag", "page=2");
    expect(p2.body.items).toHaveLength(2);

    await requestAs(app, dona, { method: "POST", url: "/api/public-page/me/pausar" });
    const pausada = await listar("vitrine-pag");
    expect(pausada.body).toEqual({
      available: false,
      items: [],
      total: 0,
      page: 1,
      pageSize: 12,
      facets: { types: [], neighborhoods: [] },
    });
  });

  // -------------------------------------------------------------------------
  // Detalhe público
  // -------------------------------------------------------------------------

  it("detalhe expõe só o público e respeita o addressDisplay", async () => {
    const dona = await montarVitrine("vitrine-det", "dona.det@teste.dev");
    const code = await criarImovelCompleto(dona, {
      title: "Apartamento com varanda",
      price: 900_000,
      details: { bedrooms: 2, bathrooms: 2, parkingSpots: 1, builtArea: 88 },
      internalNotes: "Chaves na portaria",
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/public/corretor/vitrine-det/imoveis/${code}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as PublicPropertyDetailResponse;

    expect(body.available).toBe(true);
    expect(body.property?.priceLabel).toContain("900.000");
    expect(body.property?.bedrooms).toBe(2);
    expect(body.property?.photos[0]?.caption).toBe("Fachada");
    expect(body.broker?.name).toBe("Dona Vitrine");

    // addressDisplay = bairro_cidade: a rua NUNCA sai.
    expect(body.property?.locationLine).toContain("Moema");
    const bruto = JSON.stringify(body);
    expect(bruto).not.toContain("Rua Secreta");
    expect(bruto).not.toContain("Chaves na portaria");
    expect(bruto).not.toContain("negociável"); // commissionNotes
    expect(bruto).not.toContain(dona.brokerId);
  });

  it("detalhe traz a ficha completa do cadastro, com vídeo e tour virtual", async () => {
    const dona = await montarVitrine("vitrine-ficha", "dona.ficha@teste.dev");
    const code = await criarImovelCompleto(dona, { title: "Apartamento completo" });
    const imovel = await prisma.property.findFirstOrThrow({ where: { code } });

    await prisma.property.update({
      where: { id: imovel.id },
      data: {
        category: "residencial",
        condoName: "Edifício Central",
        reference: "Ao lado da praça",
        addressDisplay: "sem_numero",
        acceptsTrade: true,
        priceNegotiable: true,
        features: ["Academia", "piscina"],
        details: {
          bedrooms: 3,
          suites: 1,
          builtArea: 98,
          totalArea: 112,
          yearBuilt: 2019,
          unitFloor: 11,
          pool: true,
          elevator: true,
          garden: false,
          solarPosition: "Face norte",
        },
      },
    });

    await prisma.propertyMedia.createMany({
      data: [
        {
          brokerId: dona.brokerId,
          propertyId: imovel.id,
          kind: "video",
          status: "pronto",
          caption: "Tour gravado",
          storagePath: `brokers/${dona.brokerId}/properties/${imovel.id}/videos/v`,
        },
        {
          brokerId: dona.brokerId,
          propertyId: imovel.id,
          kind: "link_externo",
          status: "pronto",
          caption: "Tour 360",
          externalUrl: "https://tour.example.com/abc",
        },
      ],
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/public/corretor/vitrine-ficha/imoveis/${code}`,
    });
    const detalhe = (res.json() as PublicPropertyDetailResponse).property;

    const porTitulo = Object.fromEntries(
      (detalhe?.specs ?? []).map((g) => [g.title, g.items]),
    );

    // Medidas com unidade, e a área principal não repete o que está no topo.
    // O espaço antes da unidade é não separável, para "112" e "m²" nunca
    // caírem em linhas diferentes no celular.
    expect(porTitulo["Medidas"]).toContainEqual({ label: "Área total", value: "112\u00a0m²" });
    expect(porTitulo["Medidas"]?.map((i) => i.label)).not.toContain("Área construída");

    // Ano sem separador de milhar.
    expect(porTitulo["Cômodos e estrutura"]).toContainEqual({
      label: "Ano de construção",
      value: "2019",
    });

    // Booleano falso não vira linha; comodidade escrita entra sem duplicar.
    const tem = porTitulo["O que o imóvel tem"]?.map((i) => i.label) ?? [];
    expect(tem).toContain("Piscina");
    expect(tem).toContain("Academia");
    expect(tem).not.toContain("Jardim");
    expect(tem.filter((l) => l.toLowerCase() === "piscina")).toHaveLength(1);

    expect(porTitulo["Mais detalhes"]).toContainEqual({
      label: "Posição solar",
      value: "Face norte",
    });

    expect(detalhe?.condoName).toBe("Edifício Central");
    expect(detalhe?.reference).toBe("Ao lado da praça");
    expect(detalhe?.acceptsTrade).toBe(true);
    expect(detalhe?.priceNegotiable).toBe(true);
    expect(detalhe?.videos).toHaveLength(1);
    expect(detalhe?.links).toEqual([{ url: "https://tour.example.com/abc", caption: "Tour 360" }]);
    // Vídeo e link não entram na galeria de fotos.
    expect(detalhe?.photos).toHaveLength(1);
  });

  it("condomínio e referência ficam escondidos quando o endereço é reservado", async () => {
    const dona = await montarVitrine("vitrine-privada", "dona.privada@teste.dev");
    const code = await criarImovelCompleto(dona, { title: "Endereço reservado" });
    await prisma.property.updateMany({
      where: { code },
      // bairro_cidade é o modo em que o corretor não quer revelar o endereço.
      data: { addressDisplay: "bairro_cidade", condoName: "Edifício Secreto", reference: "Atrás do mercado" },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/public/corretor/vitrine-privada/imoveis/${code}`,
    });
    const body = res.json() as PublicPropertyDetailResponse;

    expect(body.property?.condoName).toBeNull();
    expect(body.property?.reference).toBeNull();
    expect(JSON.stringify(body)).not.toContain("Edifício Secreto");
  });

  it("imóvel só com vídeo continua sem foto: vídeo não cumpre o requisito", async () => {
    const ana = await registerBroker(app, "Ana", "ana.video@teste.dev");
    const id = await criarImovel(ana, { title: "Só vídeo", comFoto: false });
    await prisma.propertyMedia.create({
      data: {
        brokerId: ana.brokerId,
        propertyId: id,
        kind: "video",
        status: "pronto",
        storagePath: `brokers/${ana.brokerId}/properties/${id}/videos/v`,
      },
    });

    const lista = await gerenciador(ana);
    const item = lista.items.find((i) => i.id === id);
    expect(item?.eligibility.eligible).toBe(false);
    expect(item?.eligibility.reasons.map((r) => r.code)).toContain("sem_foto");
  });

  it("anúncio publicado mostra todas as fotos cadastradas, na ordem da capa", async () => {
    const dona = await montarVitrine("vitrine-fotos", "dona.fotos@teste.dev");
    const code = await criarImovelCompleto(dona, { title: "Casa com três fotos" });
    const imovel = await prisma.property.findFirstOrThrow({ where: { code } });

    // Fotos extras entram depois da capa. Uma delas sem o antigo flag de
    // autorização: quem decide divulgar é o anúncio, não a foto.
    for (const [i, legenda] of ["Sala", "Cozinha"].entries()) {
      await prisma.propertyMedia.create({
        data: {
          brokerId: dona.brokerId,
          propertyId: imovel.id,
          kind: "foto",
          authorized: i === 0,
          status: "pronto",
          isCover: false,
          sortOrder: i + 1,
          caption: legenda,
          storagePath: `brokers/${dona.brokerId}/properties/${imovel.id}/images/${i}`,
        },
      });
    }

    const res = await app.inject({
      method: "GET",
      url: `/api/public/corretor/vitrine-fotos/imoveis/${code}`,
    });
    const body = res.json() as PublicPropertyDetailResponse;

    expect(body.property?.photos).toHaveLength(3);
    expect(body.property?.photos.map((f) => f.caption)).toEqual(["Fachada", "Sala", "Cozinha"]);
  });

  it("detalhe de imóvel vendido ou oculto responde indisponível", async () => {
    const dona = await montarVitrine("vitrine-off", "dona.off@teste.dev");
    const code = await criarImovelCompleto(dona, { title: "Vai sair do ar" });

    await prisma.property.updateMany({ where: { code }, data: { status: "vendido" } });
    const res = await app.inject({
      method: "GET",
      url: `/api/public/corretor/vitrine-off/imoveis/${code}`,
    });
    expect(res.json()).toEqual({ available: false, property: null, broker: null });
  });

  // -------------------------------------------------------------------------
  // Segurança
  // -------------------------------------------------------------------------

  it("isolamento: a página de um corretor é invisível e intocável para outro", async () => {
    const ana = await registerBroker(app, "Ana", "ana.iso@teste.dev");
    const bruno = await registerBroker(app, "Bruno", "bruno.iso@teste.dev");

    await estado(ana);
    await patch(ana, { bio: "Vinte anos de mercado na zona sul." });

    const deBruno = await estado(bruno);
    expect(deBruno.page.bio).toBeNull();
    expect(deBruno.page.professionalName).toBe("Bruno");

    // O PATCH de Bruno não tem como apontar para a página de Ana: não há id
    // na rota. Ainda assim, provamos que nada vazou.
    await patch(bruno, { bio: "Outra bio" });
    const deAna = await estado(ana);
    expect(deAna.page.bio).toBe("Vinte anos de mercado na zona sul.");
  });

  it("dado privado da conta nunca aparece no contrato da página", async () => {
    const ana = await registerBroker(app, "Ana", "ana.priv@teste.dev");
    const st = await estado(ana);
    const bruto = JSON.stringify(st);
    expect(bruto).not.toContain("ana.priv@teste.dev"); // e-mail de login
    expect(bruto).not.toContain(ana.brokerId); // id interno
  });

  it("CRECI informado mas não verificado: requisito cumprido, número não exposto", async () => {
    const ana = await registerBroker(app, "Ana", "ana.creci@teste.dev");
    await estado(ana);
    await prisma.broker.update({
      where: { id: ana.brokerId },
      data: { creci: "98765", creciUf: "RJ", creciStatus: "pendente" },
    });

    const st = await estado(ana);
    expect(st.requirements.items.find((i) => i.key === "creci")?.completed).toBe(true);
    expect(st.page.creci.informed).toBe(true);
    expect(st.page.creci.verified).toBe(false);
    expect(st.page.creci.number).toBeNull(); // só sai com o selo verificado
  });
});
