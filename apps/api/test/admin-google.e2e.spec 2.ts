import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import * as argon2 from "argon2";
import { AppModule } from "../src/app.module";
import {
  GoogleAuthError,
  GoogleOAuthService,
  type GoogleIdentity,
} from "../src/auth/google-oauth.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { RateLimitStore } from "../src/common/rate-limit/rate-limit.store";
import { registerPlugins, resetDatabase } from "./e2e-utils";

/**
 * Entrar com o Google no Nexlar Admin. A regra que estes testes guardam é a
 * inversão do app do corretor: aqui o Google AUTENTICA, nunca cadastra.
 */

class GoogleDouble extends GoogleOAuthService {
  identidade: GoogleIdentity = {
    googleId: "google-sub-admin-1",
    email: "chefe@nexlar.app",
    fullName: "Chefe Nexlar",
  };
  falha: GoogleAuthError | null = null;

  async identify(): Promise<GoogleIdentity> {
    if (this.falha) throw this.falha;
    return this.identidade;
  }
}

describe("Nexlar Admin: entrar com o Google", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let google: GoogleDouble;

  async function criarAdmin(email: string, status: "ativo" | "suspenso" = "ativo") {
    return prisma.adminUser.create({
      data: {
        email,
        fullName: "Equipe Teste",
        role: "admin",
        status,
        passwordHash: await argon2.hash("senha-forte-de-teste-123", {
          type: argon2.argon2id,
        }),
      },
    });
  }

  /** Percorre início e volta do fluxo, com state e cookie de verdade. */
  async function entrarPeloGoogle() {
    const inicio = await app.inject({ method: "GET", url: "/api/admin/auth/google" });
    expect(inicio.statusCode).toBe(302);
    const url = new URL(inicio.headers.location as string);
    const state = url.searchParams.get("state") as string;
    const setCookie = String(inicio.headers["set-cookie"]);
    const oauthCookie = /nexlar_admin_oauth=([^;]*)/.exec(setCookie)?.[1] as string;

    return app.inject({
      method: "GET",
      url: `/api/admin/auth/google/callback?code=um-codigo&state=${state}`,
      headers: { cookie: `nexlar_admin_oauth=${oauthCookie}` },
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleOAuthService)
      .useClass(GoogleDouble)
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await registerPlugins(app);
    app.setGlobalPrefix("api");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    google = app.get(GoogleOAuthService) as GoogleDouble;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    app.get(RateLimitStore).clearAll();
    google.falha = null;
    google.identidade = {
      googleId: "google-sub-admin-1",
      email: "chefe@nexlar.app",
      fullName: "Chefe Nexlar",
    };
  });

  it("o início do fluxo usa o callback DO ADMIN, não o do corretor", async () => {
    await criarAdmin("chefe@nexlar.app");
    const inicio = await app.inject({ method: "GET", url: "/api/admin/auth/google" });
    const url = new URL(inicio.headers.location as string);
    expect(url.searchParams.get("redirect_uri")).toContain("/api/admin/auth/google/callback");
  });

  it("admin existente entra pelo Google e o vínculo é gravado e auditado", async () => {
    const admin = await criarAdmin("chefe@nexlar.app");
    const volta = await entrarPeloGoogle();

    expect(volta.statusCode).toBe(302);
    expect(volta.headers.location).toContain("/admin");
    expect(String(volta.headers["set-cookie"])).toContain("nexlar_admin_refresh=");

    const depois = await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id } });
    expect(depois.googleId).toBe("google-sub-admin-1");
    expect(depois.lastLoginAt).not.toBeNull();

    const trilha = await prisma.adminAuditLog.findMany();
    expect(trilha).toHaveLength(1);
    expect(trilha[0].action).toBe("admin_google_vinculado");
  });

  it("e-mail desconhecido é recusado SEM criar conta nenhuma", async () => {
    google.identidade = {
      googleId: "google-sub-estranho",
      email: "curiosa@gmail.com",
      fullName: "Pessoa Curiosa",
    };
    const volta = await entrarPeloGoogle();

    expect(volta.statusCode).toBe(302);
    expect(volta.headers.location).toContain("erro=sem_acesso");
    expect(String(volta.headers["set-cookie"])).not.toContain("nexlar_admin_refresh=");
    expect(await prisma.adminUser.count()).toBe(0);
  });

  it("admin suspenso é recusado com o mesmo código de e-mail desconhecido", async () => {
    await criarAdmin("chefe@nexlar.app", "suspenso");
    const volta = await entrarPeloGoogle();
    expect(volta.headers.location).toContain("erro=sem_acesso");
  });

  it("e-mail já vinculado a OUTRA conta Google é recusado", async () => {
    const admin = await criarAdmin("chefe@nexlar.app");
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { googleId: "google-sub-antigo" },
    });
    // O Google confirma o mesmo e-mail, mas com sub diferente.
    const volta = await entrarPeloGoogle();
    expect(volta.headers.location).toContain("erro=sem_acesso");

    const depois = await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id } });
    expect(depois.googleId).toBe("google-sub-antigo");
  });

  it("volta sem state que bata com o cookie é recusada", async () => {
    await criarAdmin("chefe@nexlar.app");
    const inicio = await app.inject({ method: "GET", url: "/api/admin/auth/google" });
    const setCookie = String(inicio.headers["set-cookie"]);
    const oauthCookie = /nexlar_admin_oauth=([^;]*)/.exec(setCookie)?.[1] as string;

    const volta = await app.inject({
      method: "GET",
      url: "/api/admin/auth/google/callback?code=um-codigo&state=state-forjado",
      headers: { cookie: `nexlar_admin_oauth=${oauthCookie}` },
    });
    expect(volta.headers.location).toContain("erro=google");
  });

  it("nas voltas seguintes entra direto pelo vínculo, sem nova auditoria", async () => {
    await criarAdmin("chefe@nexlar.app");
    await entrarPeloGoogle();
    const segunda = await entrarPeloGoogle();

    expect(segunda.statusCode).toBe(302);
    expect(segunda.headers.location).toContain("/admin");
    // O vínculo aconteceu uma vez; a segunda entrada não é mudança de estado.
    expect(await prisma.adminAuditLog.count()).toBe(1);
  });
});
