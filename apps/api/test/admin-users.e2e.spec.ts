import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import * as argon2 from "argon2";
import { PrismaService } from "../src/prisma/prisma.service";
import { RateLimitStore } from "../src/common/rate-limit/rate-limit.store";
import { comCookie, createTestApp, registerBroker, resetDatabase } from "./e2e-utils";

/**
 * Gestão de usuários no Nexlar Admin (docs/10, Fase 3): busca e filtros no
 * servidor, perfil sem dado pessoal de lead, e a suspensão valendo NA HORA
 * para quem já estava dentro.
 */

const SENHA = "senha-forte-de-teste-123";

describe("Nexlar Admin: gestão de usuários", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  async function adminToken(
    role: "super_admin" | "admin" | "suporte" | "financeiro" = "admin",
  ): Promise<string> {
    const email = `${role}@nexlar.app`;
    await prisma.adminUser.create({
      data: {
        email,
        fullName: "Equipe Teste",
        role,
        passwordHash: await argon2.hash(SENHA, { type: argon2.argon2id }),
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/auth/login",
      payload: { email, password: SENHA },
    });
    return res.json().accessToken as string;
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

  it("lista com busca case-insensitive e filtro de pendente derivado", async () => {
    await registerBroker(app, "Ana Corretora", "ana@example.com");
    await registerBroker(app, "Bruna Imóveis", "bruna@example.com");
    // Conta que nunca confirmou o e-mail: o registerBroker confirma por
    // padrão, então esta é criada e desconfirmada direto no banco.
    const pendente = await registerBroker(app, "Carla Nova", "carla@example.com");
    await prisma.broker.update({
      where: { id: pendente.brokerId },
      data: { emailVerifiedAt: null },
    });

    const token = await adminToken("suporte");

    const porNome = await app.inject({
      method: "GET",
      url: "/api/admin/users?busca=ANA",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(porNome.statusCode).toBe(200);
    expect(porNome.json().items.map((i: { email: string }) => i.email)).toEqual([
      "ana@example.com",
    ]);

    const pendentes = await app.inject({
      method: "GET",
      url: "/api/admin/users?status=pendente_verificacao",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(pendentes.json().items).toHaveLength(1);
    expect(pendentes.json().items[0].email).toBe("carla@example.com");

    const todos = await app.inject({
      method: "GET",
      url: "/api/admin/users",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(todos.json().total).toBe(3);
  });

  it("o perfil traz uso agregado e nenhum dado pessoal de lead", async () => {
    const corretora = await registerBroker(app, "Ana Corretora", "ana@example.com");
    await app.inject({
      method: "POST",
      url: "/api/leads",
      headers: { authorization: `Bearer ${corretora.accessToken}` },
      payload: { fullName: "Lead Sigilosa", whatsapp: "11999998888" },
    });

    const token = await adminToken("suporte");
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/users/${corretora.brokerId}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.usage.leads).toBe(1);
    // A contagem entra; a pessoa, nunca.
    expect(JSON.stringify(body)).not.toContain("Lead Sigilosa");
    expect(JSON.stringify(body)).not.toContain("11999998888");
  });

  it("financeiro não enxerga usuários; suporte enxerga mas não suspende", async () => {
    const corretora = await registerBroker(app, "Ana Corretora", "ana@example.com");

    const financeiro = await adminToken("financeiro");
    const lista = await app.inject({
      method: "GET",
      url: "/api/admin/users",
      headers: { authorization: `Bearer ${financeiro}` },
    });
    expect(lista.statusCode).toBe(403);

    const suporte = await adminToken("suporte");
    const suspender = await app.inject({
      method: "POST",
      url: `/api/admin/users/${corretora.brokerId}/suspend`,
      headers: { authorization: `Bearer ${suporte}` },
      payload: { reason: "Não deveria conseguir" },
    });
    expect(suspender.statusCode).toBe(403);
  });

  it("corretor não acessa a gestão de usuários", async () => {
    const corretora = await registerBroker(app, "Ana Corretora", "ana@example.com");
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/users",
      headers: { authorization: `Bearer ${corretora.accessToken}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("suspender derruba a conta NA HORA: token vivo barrado, refresh morto, auditoria completa", async () => {
    const corretora = await registerBroker(app, "Ana Corretora", "ana@example.com");
    const token = await adminToken("admin");

    const suspensao = await app.inject({
      method: "POST",
      url: `/api/admin/users/${corretora.brokerId}/suspend`,
      headers: { authorization: `Bearer ${token}` },
      payload: { reason: "Denúncia de uso indevido em análise" },
    });
    expect(suspensao.statusCode).toBe(200);
    expect(suspensao.json().status).toBe("suspenso");
    expect(suspensao.json().suspendedReason).toBe("Denúncia de uso indevido em análise");

    // O access token que a corretora ainda tem na mão morre no guard.
    const usando = await app.inject({
      method: "GET",
      url: "/api/leads",
      headers: { authorization: `Bearer ${corretora.accessToken}` },
    });
    expect(usando.statusCode).toBe(403);
    expect(usando.json().details?.code).toBe("conta_suspensa");

    // E a renovação pelo cookie também: a sessão foi revogada no servidor.
    const renovando = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: comCookie(corretora.refreshCookie),
    });
    expect(renovando.statusCode).toBe(401);

    // Trilha completa: quem, o quê, de qual estado para qual, por quê.
    const trilha = await prisma.adminAuditLog.findFirst({
      where: { action: "corretor_suspenso" },
    });
    expect(trilha).not.toBeNull();
    expect(trilha?.resourceId).toBe(corretora.brokerId);
    expect(trilha?.previousState).toEqual({ status: "ativo" });
    expect(trilha?.newState).toEqual({ status: "suspenso" });
    expect(trilha?.reason).toBe("Denúncia de uso indevido em análise");
  });

  it("reativar devolve a entrada e limpa o registro de suspensão", async () => {
    const corretora = await registerBroker(app, "Ana Corretora", "ana@example.com");
    const token = await adminToken("admin");

    await app.inject({
      method: "POST",
      url: `/api/admin/users/${corretora.brokerId}/suspend`,
      headers: { authorization: `Bearer ${token}` },
      payload: { reason: "Suspensão temporária" },
    });
    const reativacao = await app.inject({
      method: "POST",
      url: `/api/admin/users/${corretora.brokerId}/reactivate`,
      headers: { authorization: `Bearer ${token}` },
      payload: { reason: "Situação resolvida" },
    });
    expect(reativacao.statusCode).toBe(200);
    expect(reativacao.json().status).toBe("ativo");
    expect(reativacao.json().suspendedReason).toBeNull();

    // A corretora entra de novo pela senha e o último acesso é gravado.
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "ana@example.com", password: "SenhaForte123" },
    });
    expect(login.statusCode).toBe(200);

    const broker = await prisma.broker.findUniqueOrThrow({
      where: { id: corretora.brokerId },
    });
    expect(broker.lastLoginAt).not.toBeNull();
  });
});
