import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createTestApp, registerBroker, resetDatabase } from "./e2e-utils";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * Conferência do documento na etapa do perfil, antes de concluir o cadastro.
 * Responde só sim ou não: não diz nada sobre a conta que já existe.
 */
describe("Conferência do documento antes do cadastro", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  const conferir = (payload: Record<string, unknown>) =>
    app.inject({ method: "POST", url: "/api/auth/document/check", payload });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  it("documento livre responde disponível", async () => {
    const res = await conferir({ personType: "cpf", document: "913.943.413-34" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ available: true });
  });

  it("documento de conta existente responde indisponível, com ou sem máscara", async () => {
    const ana = await registerBroker(app, "Ana", "ana@teste.com");
    const { document } = await prisma.broker.findUniqueOrThrow({
      where: { id: ana.brokerId },
      select: { document: true },
    });
    const comMascara = `${document!.slice(0, 3)}.${document!.slice(3, 6)}.${document!.slice(6, 9)}-${document!.slice(9)}`;

    for (const doc of [document, comMascara]) {
      const res = await conferir({ personType: "cpf", document: doc });
      expect(res.json()).toEqual({ available: false });
    }
  });

  it("não devolve nada além do sim ou não", async () => {
    await registerBroker(app, "Ana", "ana@teste.com");
    const { document } = await prisma.broker.findFirstOrThrow({ select: { document: true } });
    const res = await conferir({ personType: "cpf", document });
    // Se vazasse nome, e-mail ou id, viraria um jeito de descobrir quem é
    // dono de cada CPF. Só a resposta binária.
    expect(Object.keys(res.json())).toEqual(["available"]);
  });

  it("CPF inventado é recusado antes de consultar", async () => {
    const res = await conferir({ personType: "cpf", document: "111.111.111-11" });
    expect(res.statusCode).toBe(400);
  });

  it("é pública: não exige sessão", async () => {
    const res = await conferir({ personType: "cnpj", document: "11.222.333/0001-81" });
    expect(res.statusCode).toBe(200);
  });
});
