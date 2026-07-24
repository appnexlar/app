import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { GuidanceState } from "@nexlar/shared";
import { createTestApp, registerBroker, requestAs, resetDatabase } from "./e2e-utils";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * e2e da experiência guiada: prova que a fiação (contexto -> motor -> serviço
 * -> HTTP) funciona ponta a ponta, que a conclusão acontece por ação real e
 * que o progresso de um corretor é invisível para outro (GUI-07).
 */
describe("Guidance — experiência guiada ponta a ponta", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  async function estado(broker: Awaited<ReturnType<typeof registerBroker>>): Promise<GuidanceState> {
    const res = await requestAs(app, broker, { method: "GET", url: "/api/guidance" });
    expect(res.statusCode).toBe(200);
    return res.json() as GuidanceState;
  }

  async function criarLead(
    broker: Awaited<ReturnType<typeof registerBroker>>,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const res = await requestAs(app, broker, {
      method: "POST",
      url: "/api/leads",
      payload,
    });
    expect(res.statusCode).toBe(201);
  }

  it("conta nova recebe 'cadastrar primeiro lead' como recomendação principal", async () => {
    const corretor = await registerBroker(app, "Ana", "ana.g@teste.dev");
    const st = await estado(corretor);

    expect(st.primary?.key).toBe("cadastrar-primeiro-lead");
    expect(st.checklist.total).toBe(9);
    expect(st.checklist.completed).toBe(0);
    expect(st.onboarding.diagnosisCompleted).toBe(false);
  });

  it("criar lead conclui o marco e muda a recomendação principal", async () => {
    const corretor = await registerBroker(app, "Beto", "beto.g@teste.dev");
    await criarLead(corretor, { fullName: "Cliente", whatsapp: "11988880001" });

    const st = await estado(corretor);
    // Cadastrar lead saiu; o próximo passo aparece (perfil ou preferências).
    expect(st.primary?.key).not.toBe("cadastrar-primeiro-lead");
    const item = st.checklist.items.find((i) => i.key === "primeiro-lead");
    expect(item?.done).toBe(true);
  });

  it("dispensar uma educacional a remove e revela a próxima", async () => {
    const corretor = await registerBroker(app, "Cadu", "cadu.g@teste.dev");
    // Cria lead sem preferências: sobra perfil (90) e preferências (80).
    await criarLead(corretor, { fullName: "Cliente", whatsapp: "11988880002" });

    const antes = await estado(corretor);
    expect(antes.primary?.key).toBe("completar-perfil");

    const dispensa = await requestAs(app, corretor, {
      method: "POST",
      url: "/api/guidance/completar-perfil/dismiss",
    });
    expect(dispensa.statusCode).toBe(204);

    const depois = await estado(corretor);
    expect(depois.primary?.key).toBe("adicionar-preferencias-lead");
  });

  it("reabrir traz de volta uma orientação dispensada", async () => {
    const corretor = await registerBroker(app, "Duda", "duda.g@teste.dev");
    await criarLead(corretor, { fullName: "Cliente", whatsapp: "11988880003", region: "Centro" });

    await requestAs(app, corretor, { method: "POST", url: "/api/guidance/completar-perfil/dismiss" });
    let st = await estado(corretor);
    expect(st.primary?.key).not.toBe("completar-perfil");

    const reabre = await requestAs(app, corretor, {
      method: "POST",
      url: "/api/guidance/completar-perfil/reopen",
    });
    expect(reabre.statusCode).toBe(204);

    st = await estado(corretor);
    expect(st.primary?.key).toBe("completar-perfil");
  });

  it("salvar o diagnóstico reflete no estado do onboarding", async () => {
    const corretor = await registerBroker(app, "Edu", "edu.g@teste.dev");

    const res = await requestAs(app, corretor, {
      method: "POST",
      url: "/api/guidance/onboarding",
      payload: { workMode: "sozinho", businessFocus: "venda" },
    });
    expect(res.statusCode).toBe(201);

    const st = await estado(corretor);
    expect(st.onboarding.diagnosisCompleted).toBe(true);
    expect(st.onboarding.workMode).toBe("sozinho");
  });

  it("recusa uma chave de orientação inventada", async () => {
    const corretor = await registerBroker(app, "Fabi", "fabi.g@teste.dev");
    const res = await requestAs(app, corretor, {
      method: "POST",
      url: "/api/guidance/orientacao-que-nao-existe/dismiss",
    });
    expect(res.statusCode).toBe(400);
  });

  it("isola o progresso: o que um dispensa não afeta o outro (GUI-07)", async () => {
    const ana = await registerBroker(app, "Ana", "ana.iso@teste.dev");
    const beto = await registerBroker(app, "Beto", "beto.iso@teste.dev");
    await criarLead(ana, { fullName: "Cliente", whatsapp: "11988880004" });
    await criarLead(beto, { fullName: "Cliente", whatsapp: "11988880005" });

    await requestAs(app, ana, { method: "POST", url: "/api/guidance/completar-perfil/dismiss" });

    const stAna = await estado(ana);
    const stBeto = await estado(beto);
    expect(stAna.primary?.key).not.toBe("completar-perfil");
    expect(stBeto.primary?.key).toBe("completar-perfil");
  });

  it("expira uma educacional que perdeu a relevância sem ter sido concluída (GUI-09)", async () => {
    const corretor = await registerBroker(app, "Gil", "gil.g@teste.dev");
    await criarLead(corretor, { fullName: "Cliente", whatsapp: "11988880006" });

    // Vê e dispensa "completar-perfil". Fica dismissed, elegível ainda.
    await estado(corretor);
    await requestAs(app, corretor, { method: "POST", url: "/api/guidance/completar-perfil/dismiss" });

    // O perfil é completado por fora (telefone + CRECI): a orientação perde a
    // relevância sem que exista o evento PROFILE_COMPLETED.
    await app.get(PrismaService).broker.update({
      where: { id: corretor.brokerId },
      data: { phone: "11999998888", creci: "SP-12345" },
    });
    await estado(corretor);

    const prog = await app.get(PrismaService).guidanceProgress.findUnique({
      where: { broker_guidance: { brokerId: corretor.brokerId, guidanceKey: "completar-perfil" } },
      select: { status: true },
    });
    expect(prog?.status).toBe("expired");
  });

  it("ajuda contextual devolve conteúdo por rota e nada para rota sem ajuda", async () => {
    const corretor = await registerBroker(app, "Ivo", "ivo.g@teste.dev");

    const imoveis = await requestAs(app, corretor, {
      method: "GET",
      url: "/api/guidance/help?route=imoveis",
    });
    expect(imoveis.statusCode).toBe(200);
    expect(imoveis.json().route).toBe("imoveis");
    expect(imoveis.json().topics.length).toBeGreaterThan(0);

    const inexistente = await requestAs(app, corretor, {
      method: "GET",
      url: "/api/guidance/help?route=inexistente",
    });
    expect(inexistente.statusCode).toBe(200);
    expect(inexistente.body === "" || inexistente.json() === null).toBe(true);
  });

  it("exige autenticação", async () => {
    const res = await app.inject({ method: "GET", url: "/api/guidance" });
    expect(res.statusCode).toBe(401);
  });
});
