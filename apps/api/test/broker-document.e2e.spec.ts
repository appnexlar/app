import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createTestApp, resetDatabase } from "./e2e-utils";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * Documento do corretor no cadastro.
 *
 * Antes disto o campo existia na tela, conferia os dígitos e era descartado:
 * a coluna nem existia no banco. Estes testes guardam as duas regras que
 * passaram a valer: o documento é gravado e confere de verdade, e a mesma
 * pessoa não abre duas contas.
 */
describe("Documento do corretor", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  // CPFs válidos de teste (dígitos verificadores corretos).
  const CPF = "913.943.413-34";
  const CPF_SO_DIGITOS = "91394341334";
  const OUTRO_CPF = "111.444.777-35";
  const CNPJ = "11.222.333/0001-81";

  const conta = (extra: Record<string, unknown> = {}) => ({
    fullName: "Ana Corretora",
    email: "ana@teste.com",
    password: "senha-forte-de-teste-123",
    phone: "11988887777",
    personType: "cpf",
    document: CPF,
    acceptTerms: true,
    ...extra,
  });

  const cadastrar = (payload: Record<string, unknown>) =>
    app.inject({ method: "POST", url: "/api/auth/register", payload });

  /** A validação responde "Dados inválidos" com o detalhe por campo em errors. */
  const erroDoCampo = (corpo: { errors?: { field: string; message: string }[] }, campo: string) =>
    corpo.errors?.find((e) => e.field === campo)?.message ?? "";

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

  it("grava o documento, e guarda só os dígitos", async () => {
    const res = await cadastrar(conta());
    expect(res.statusCode).toBe(201);

    const broker = await prisma.broker.findFirstOrThrow();
    // A máscara não pode entrar: se cada um gravasse do seu jeito, a trava de
    // repetido não seguraria "913.943.413-34" contra "91394341334".
    expect(broker.document).toBe(CPF_SO_DIGITOS);
    expect(broker.personType).toBe("cpf");
  });

  it("recusa CPF com dígito verificador errado, mesmo com 11 números", async () => {
    const res = await cadastrar(conta({ document: "111.111.111-11" }));
    expect(res.statusCode).toBe(400);
    // O detalhe vem por campo, e é ele que a tela usa para apontar o erro no
    // lugar certo em vez de só dizer "dados inválidos".
    expect(erroDoCampo(res.json(), "document")).toContain("CPF inválido");
    expect(await prisma.broker.count()).toBe(0);
  });

  it("recusa CNPJ inválido quando a pessoa se cadastra como empresa", async () => {
    const res = await cadastrar(conta({ personType: "cnpj", document: "11.222.333/0001-00" }));
    expect(res.statusCode).toBe(400);
    expect(erroDoCampo(res.json(), "document")).toContain("CNPJ inválido");
  });

  it("aceita CNPJ válido", async () => {
    const res = await cadastrar(conta({ personType: "cnpj", document: CNPJ }));
    expect(res.statusCode).toBe(201);
    const broker = await prisma.broker.findFirstOrThrow();
    expect(broker.personType).toBe("cnpj");
    expect(broker.document).toBe("11222333000181");
  });

  it("não deixa duas contas com o mesmo CPF, nem com máscara diferente", async () => {
    expect((await cadastrar(conta())).statusCode).toBe(201);

    // Mesmo documento, escrito sem pontuação e com outro e-mail: ainda é a
    // mesma pessoa, e é isso que a trava precisa enxergar.
    const segunda = await cadastrar(
      conta({ email: "ana.segunda@teste.com", document: CPF_SO_DIGITOS }),
    );

    expect(segunda.statusCode).toBe(409);
    expect(segunda.json().message).toBe("Já existe uma conta com esse CPF.");
    expect(await prisma.broker.count()).toBe(1);
  });

  it("diz qual campo repetiu: e-mail e documento não se confundem", async () => {
    await cadastrar(conta());

    const mesmoEmail = await cadastrar(conta({ document: OUTRO_CPF }));
    expect(mesmoEmail.statusCode).toBe(409);
    // Sem olhar qual índice estourou, quem repetiu o documento leria "já
    // existe conta com esse e-mail" e passaria a tarde conferindo o e-mail.
    expect(mesmoEmail.json().message).toBe("Já existe uma conta com esse e-mail.");
  });

  it("exige o documento: cadastro sem ele não passa", async () => {
    const semDocumento = conta();
    delete (semDocumento as Record<string, unknown>).document;

    const res = await cadastrar(semDocumento);
    expect(res.statusCode).toBe(400);
    expect(await prisma.broker.count()).toBe(0);
  });

  it("contas antigas, sem documento, continuam válidas e não brigam entre si", async () => {
    // O índice único ignora nulos no Postgres, então duas contas legadas sem
    // documento convivem. Sem isso, a migration derrubaria quem já usava.
    for (const email of ["antiga1@teste.com", "antiga2@teste.com"]) {
      await prisma.broker.create({
        data: { fullName: "Conta Antiga", email, passwordHash: "x", termsVersion: "1.0" },
      });
    }
    expect(await prisma.broker.count({ where: { document: null } })).toBe(2);
  });
});
