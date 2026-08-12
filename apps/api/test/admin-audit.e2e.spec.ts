import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import * as argon2 from "argon2";
import { PrismaService } from "../src/prisma/prisma.service";
import { RateLimitStore } from "../src/common/rate-limit/rate-limit.store";
import { createTestApp, registerBroker, resetDatabase } from "./e2e-utils";

/**
 * Leitura da trilha administrativa (docs/10, Fase 5). O que estes testes
 * protegem: quem pode ler, os filtros, a trilha de entrada no painel e a
 * propriedade que dá sentido a tudo, que é a linha sobreviver ao alvo.
 */

const SENHA = "senha-forte-de-teste-123";

describe("Nextlar Admin: auditoria", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  async function criarAdmin(
    role: "super_admin" | "admin" | "suporte" | "financeiro" = "admin",
  ): Promise<{ id: string; email: string }> {
    const email = `${role}@nextlar.app`;
    const admin = await prisma.adminUser.create({
      data: {
        email,
        fullName: `Equipe ${role}`,
        role,
        passwordHash: await argon2.hash(SENHA, { type: argon2.argon2id }),
      },
    });
    return { id: admin.id, email };
  }

  async function entrar(email: string, senha = SENHA): Promise<string> {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/auth/login",
      payload: { email, password: senha },
    });
    return res.json().accessToken as string;
  }

  async function tokenDe(
    role: "super_admin" | "admin" | "suporte" | "financeiro" = "admin",
  ): Promise<string> {
    const { email } = await criarAdmin(role);
    return entrar(email);
  }

  function trilha(token: string, filtros = "") {
    return app.inject({
      method: "GET",
      url: `/api/admin/audit${filtros}`,
      headers: { authorization: `Bearer ${token}` },
    });
  }

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

  it("entrar no painel vira linha na trilha, com o meio usado", async () => {
    const token = await tokenDe("admin");

    const res = await trilha(token, "?acao=admin_entrou");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(1);
    expect(body.items[0].newState).toEqual({ via: "senha" });
    expect(body.items[0].actor.email).toBe("admin@nextlar.app");
  });

  it("senha errada vira recusa na trilha, com o motivo", async () => {
    const { email } = await criarAdmin("admin");
    await app.inject({
      method: "POST",
      url: "/api/admin/auth/login",
      payload: { email, password: "senha-errada-mesmo-123" },
    });

    const leitor = await tokenDe("super_admin");
    const res = await trilha(leitor, "?acao=admin_login_recusado");

    expect(res.json().total).toBe(1);
    expect(res.json().items[0].newState).toEqual({ motivo: "senha_incorreta" });
  });

  it("tentativa contra e-mail inexistente não suja a trilha", async () => {
    await app.inject({
      method: "POST",
      url: "/api/admin/auth/login",
      payload: { email: "ninguem@nextlar.app", password: "chute-qualquer-123" },
    });

    const token = await tokenDe("admin");
    const res = await trilha(token, "?acao=admin_login_recusado");
    expect(res.json().total).toBe(0);
  });

  it("a linha sobrevive à exclusão da conta afetada", async () => {
    const corretora = await registerBroker(app, "Ana Corretora", "ana@example.com");
    const token = await tokenDe("admin");

    await app.inject({
      method: "POST",
      url: `/api/admin/users/${corretora.brokerId}/suspend`,
      headers: { authorization: `Bearer ${token}` },
      payload: { reason: "Motivo registrado para a posteridade" },
    });

    // Com o alvo vivo, o nome aparece.
    const antes = await trilha(token, "?acao=corretor_suspenso");
    expect(antes.json().items[0].resourceLabel).toBe("Ana Corretora");

    // A conta some inteira, e a prova do que foi feito com ela continua.
    await prisma.broker.delete({ where: { id: corretora.brokerId } });

    const depois = await trilha(token, "?acao=corretor_suspenso");
    expect(depois.json().total).toBe(1);
    expect(depois.json().items[0].resourceId).toBe(corretora.brokerId);
    expect(depois.json().items[0].resourceLabel).toBeNull();
    expect(depois.json().items[0].reason).toBe("Motivo registrado para a posteridade");
  });

  it("filtra por quem fez e por período", async () => {
    const primeiro = await criarAdmin("admin");
    await entrar(primeiro.email);
    const segundo = await criarAdmin("super_admin");
    const token = await entrar(segundo.email);

    const doPrimeiro = await trilha(token, `?ator=${primeiro.id}`);
    expect(doPrimeiro.json().total).toBe(1);
    expect(doPrimeiro.json().items[0].actor.id).toBe(primeiro.id);

    // Janela que termina antes de tudo acontecer não devolve nada.
    const ontem = new Date(Date.now() - 86_400_000).toISOString();
    const vazio = await trilha(token, `?ate=${encodeURIComponent(ontem)}`);
    expect(vazio.json().total).toBe(0);

    const tudo = await trilha(token);
    expect(tudo.json().total).toBe(2);
  });

  it("suporte e financeiro não leem a trilha; corretor nem chega perto", async () => {
    const corretora = await registerBroker(app, "Ana Corretora", "ana@example.com");

    for (const role of ["suporte", "financeiro"] as const) {
      const token = await tokenDe(role);
      const res = await trilha(token);
      expect(res.statusCode).toBe(403);
    }

    const doCorretor = await app.inject({
      method: "GET",
      url: "/api/admin/audit",
      headers: { authorization: `Bearer ${corretora.accessToken}` },
    });
    expect(doCorretor.statusCode).toBe(401);
  });

  it("a trilha não tem rota para alterar nem para apagar", async () => {
    const token = await tokenDe("super_admin");
    const { email } = await criarAdmin("suporte");
    const alvo = await prisma.adminAuditLog.findFirst({
      where: { actor: { email: { not: email } } },
    });

    for (const method of ["DELETE", "PATCH", "PUT"] as const) {
      const res = await app.inject({
        method,
        url: `/api/admin/audit/${alvo?.id ?? "qualquer"}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(res.statusCode).toBe(404);
    }
  });

  it("lista os atores que já aparecem na trilha", async () => {
    const token = await tokenDe("admin");
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/audit/actors",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
    expect(res.json()[0].fullName).toBe("Equipe admin");
  });
});
