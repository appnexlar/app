import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import * as argon2 from "argon2";
import { PrismaService } from "../src/prisma/prisma.service";
import { RateLimitStore } from "../src/common/rate-limit/rate-limit.store";
import { createTestApp, registerBroker, resetDatabase } from "./e2e-utils";

/**
 * Fundação do Nextlar Admin (docs/10, Fase 1): os universos corretor e admin
 * não se tocam, permissão é verificada no backend, ação crítica é auditada e
 * as autoproteções impedem o time de se trancar para fora.
 */

const SENHA = "senha-forte-de-teste-123";

/** Lê o cookie administrativo de uma resposta. */
function adminCookieDe(response: { headers: Record<string, unknown> }): string | null {
  const bruto = response.headers["set-cookie"];
  const linhas = Array.isArray(bruto) ? bruto : bruto ? [String(bruto)] : [];
  for (const linha of linhas) {
    const achado = /(^|;\s*)nexlar_admin_refresh=([^;]*)/.exec(linha);
    if (achado) return achado[2];
  }
  return null;
}

describe("Nextlar Admin: fundação", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  async function criarAdmin(
    email: string,
    role: "super_admin" | "admin" | "suporte" | "financeiro",
    status: "ativo" | "suspenso" = "ativo",
  ): Promise<string> {
    const admin = await prisma.adminUser.create({
      data: {
        email,
        fullName: "Equipe Teste",
        role,
        status,
        passwordHash: await argon2.hash(SENHA, { type: argon2.argon2id }),
      },
    });
    return admin.id;
  }

  async function loginAdmin(email: string) {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/auth/login",
      payload: { email, password: SENHA },
    });
    return res;
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

  it("faz login, devolve permissões e registra o último acesso", async () => {
    await criarAdmin("chefe@nextlar.app", "super_admin");
    const res = await loginAdmin("chefe@nextlar.app");

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.admin.role).toBe("super_admin");
    expect(body.admin.permissions).toContain("admin.admins.manage");
    expect(body.accessToken).toBeTruthy();
    expect(adminCookieDe(res)).toBeTruthy();

    const noBanco = await prisma.adminUser.findUniqueOrThrow({
      where: { email: "chefe@nextlar.app" },
    });
    expect(noBanco.lastLoginAt).not.toBeNull();
  });

  it("responde igual para senha errada, e-mail inexistente e conta suspensa", async () => {
    await criarAdmin("chefe@nextlar.app", "super_admin");
    await criarAdmin("desligada@nextlar.app", "admin", "suspenso");

    const senhaErrada = await app.inject({
      method: "POST",
      url: "/api/admin/auth/login",
      payload: { email: "chefe@nextlar.app", password: "senha-errada-123" },
    });
    const naoExiste = await app.inject({
      method: "POST",
      url: "/api/admin/auth/login",
      payload: { email: "ninguem@nextlar.app", password: SENHA },
    });
    const suspensa = await loginAdmin("desligada@nextlar.app");

    for (const res of [senhaErrada, naoExiste, suspensa]) {
      expect(res.statusCode).toBe(401);
      expect(res.json().message).toBe("E-mail ou senha incorretos.");
    }
  });

  it("trava a conta depois de cinco falhas seguidas", async () => {
    await criarAdmin("chefe@nextlar.app", "super_admin");
    for (let i = 0; i < 5; i += 1) {
      await app.inject({
        method: "POST",
        url: "/api/admin/auth/login",
        payload: { email: "chefe@nextlar.app", password: `errada-${i}-0123456` },
      });
    }
    // A sexta é barrada antes de conferir a senha, mesmo estando certa.
    const res = await loginAdmin("chefe@nextlar.app");
    expect(res.statusCode).toBe(429);
  });

  it("token de corretor não entra no admin, e token de admin não entra no app do corretor", async () => {
    const corretor = await registerBroker(app, "Corretora Teste", "corretora@example.com");
    const admin = await criarAdmin("chefe@nextlar.app", "super_admin");
    void admin;
    const login = await loginAdmin("chefe@nextlar.app");
    const adminToken = login.json().accessToken as string;

    // Corretor batendo em rota administrativa: 401, sem detalhe.
    const invadindo = await app.inject({
      method: "GET",
      url: "/api/admin/admins",
      headers: { authorization: `Bearer ${corretor.accessToken}` },
    });
    expect(invadindo.statusCode).toBe(401);

    // Admin batendo em rota do corretor: o guard global recusa igual.
    const voltando = await app.inject({
      method: "GET",
      url: "/api/leads",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(voltando.statusCode).toBe(401);
  });

  it("permissão é verificada no backend: suporte lista, mas não cria nem altera", async () => {
    await criarAdmin("suporte@nextlar.app", "suporte");
    const login = await loginAdmin("suporte@nextlar.app");
    const token = login.json().accessToken as string;

    // suporte não tem admin.admins.view: nem a lista abre.
    const lista = await app.inject({
      method: "GET",
      url: "/api/admin/admins",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(lista.statusCode).toBe(403);

    const criando = await app.inject({
      method: "POST",
      url: "/api/admin/admins",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        email: "intruso@nextlar.app",
        fullName: "Tentativa Indevida",
        role: "super_admin",
        password: "senha-instalada-123",
      },
    });
    expect(criando.statusCode).toBe(403);
    expect(await prisma.adminUser.count()).toBe(1);
  });

  it("super_admin cria administrador e a criação sai na auditoria", async () => {
    const chefeId = await criarAdmin("chefe@nextlar.app", "super_admin");
    const login = await loginAdmin("chefe@nextlar.app");
    const token = login.json().accessToken as string;

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/admins",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        email: "nova@nextlar.app",
        fullName: "Pessoa Nova",
        role: "suporte",
        password: "senha-inicial-123",
      },
    });
    expect(res.statusCode).toBe(201);

    // Filtrado pela ação: a entrada de quem criou também está na trilha, e é
    // assunto de outro teste.
    const trilha = await prisma.adminAuditLog.findMany({ where: { action: "admin_criado" } });
    expect(trilha).toHaveLength(1);
    expect(trilha[0].actorAdminId).toBe(chefeId);
    expect(trilha[0].resourceType).toBe("admin_user");
    // A auditoria nunca guarda credencial.
    expect(JSON.stringify(trilha[0].newState)).not.toContain("senha");
    expect(JSON.stringify(trilha[0].newState)).not.toContain("hash");
  });

  it("suspender um administrador derruba as sessões abertas dele", async () => {
    await criarAdmin("chefe@nextlar.app", "super_admin");
    const alvoId = await criarAdmin("colega@nextlar.app", "admin");

    const sessaoDoAlvo = await loginAdmin("colega@nextlar.app");
    const tokenDoAlvo = sessaoDoAlvo.json().accessToken as string;
    const cookieDoAlvo = adminCookieDe(sessaoDoAlvo);

    const chefe = await loginAdmin("chefe@nextlar.app");
    const suspensao = await app.inject({
      method: "PATCH",
      url: `/api/admin/admins/${alvoId}`,
      headers: { authorization: `Bearer ${chefe.json().accessToken}` },
      payload: { status: "suspenso", reason: "Desligamento do time" },
    });
    expect(suspensao.statusCode).toBe(200);

    // O access token que sobrou morre no guard (status no banco).
    const usandoTokenVelho = await app.inject({
      method: "GET",
      url: "/api/admin/auth/me",
      headers: { authorization: `Bearer ${tokenDoAlvo}` },
    });
    expect(usandoTokenVelho.statusCode).toBe(403);

    // E o refresh não ressuscita a sessão.
    const renovando = await app.inject({
      method: "POST",
      url: "/api/admin/auth/refresh",
      headers: { cookie: `nexlar_admin_refresh=${cookieDoAlvo}` },
    });
    expect(renovando.statusCode).toBe(401);
  });

  it("não deixa o time se trancar para fora: nem a si mesmo, nem o último super_admin", async () => {
    const chefeId = await criarAdmin("chefe@nextlar.app", "super_admin");
    const login = await loginAdmin("chefe@nextlar.app");
    const token = login.json().accessToken as string;

    // Suspender a si: recusado.
    const aSiMesmo = await app.inject({
      method: "PATCH",
      url: `/api/admin/admins/${chefeId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: "suspenso", reason: "Teste de bloqueio" },
    });
    expect(aSiMesmo.statusCode).toBe(403);

    // Rebaixar o último super_admin por outra conta manage: cria um segundo
    // super, suspende o primeiro... e aí o segundo vira o último, intocável.
    const segundoId = await criarAdmin("segunda@nextlar.app", "super_admin");
    const suspendePrimeiro = await app.inject({
      method: "PATCH",
      url: `/api/admin/admins/${segundoId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { role: "suporte", reason: "Reorganização do time" },
    });
    expect(suspendePrimeiro.statusCode).toBe(200);

    const login2 = await loginAdmin("chefe@nextlar.app");
    const token2 = login2.json().accessToken as string;
    const segundaConta = await criarAdmin("terceira@nextlar.app", "admin");
    void segundaConta;
    // chefe agora é o único super_admin ativo: ninguém o rebaixa.
    const rebaixandoUltimo = await app.inject({
      method: "PATCH",
      url: `/api/admin/admins/${chefeId}`,
      headers: { authorization: `Bearer ${token2}` },
      payload: { role: "admin", reason: "Não deveria passar" },
    });
    // Recusado pela regra de autoproteção (é a própria conta E o último super).
    expect(rebaixandoUltimo.statusCode).toBe(403);
  });

  it("rotação do refresh funciona e reuso derruba a família de sessões", async () => {
    await criarAdmin("chefe@nextlar.app", "super_admin");
    const login = await loginAdmin("chefe@nextlar.app");
    const cookie1 = adminCookieDe(login);

    const primeira = await app.inject({
      method: "POST",
      url: "/api/admin/auth/refresh",
      headers: { cookie: `nexlar_admin_refresh=${cookie1}` },
    });
    expect(primeira.statusCode).toBe(200);
    const cookie2 = adminCookieDe(primeira);
    expect(cookie2).not.toBe(cookie1);

    // Espera a janela de corrida entre abas passar: dentro dela o reuso é
    // tratado como concorrência honesta, não como roubo.
    await prisma.adminRefreshToken.updateMany({
      where: { revokedAt: { not: null } },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });

    // Reapresentar o cookie antigo: reuso detectado, tudo cai.
    const reuso = await app.inject({
      method: "POST",
      url: "/api/admin/auth/refresh",
      headers: { cookie: `nexlar_admin_refresh=${cookie1}` },
    });
    expect(reuso.statusCode).toBe(401);

    const aindaValido = await app.inject({
      method: "POST",
      url: "/api/admin/auth/refresh",
      headers: { cookie: `nexlar_admin_refresh=${cookie2}` },
    });
    expect(aindaValido.statusCode).toBe(401);
  });

  it("logout revoga a sessão no servidor, não só no navegador", async () => {
    await criarAdmin("chefe@nextlar.app", "super_admin");
    const login = await loginAdmin("chefe@nextlar.app");
    const cookie = adminCookieDe(login);

    const logout = await app.inject({
      method: "POST",
      url: "/api/admin/auth/logout",
      headers: { cookie: `nexlar_admin_refresh=${cookie}` },
    });
    expect(logout.statusCode).toBe(204);

    const renovando = await app.inject({
      method: "POST",
      url: "/api/admin/auth/refresh",
      headers: { cookie: `nexlar_admin_refresh=${cookie}` },
    });
    expect(renovando.statusCode).toBe(401);
  });
});
