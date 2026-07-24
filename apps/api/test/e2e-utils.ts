import { Test } from "@nestjs/testing";
import multipart from "@fastify/multipart";
import cookie from "@fastify/cookie";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import type { InjectOptions } from "fastify";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * Plugins do Fastify que o main.ts registra no boot. Sem eles o app de teste
 * não é o mesmo do ar: upload de arquivo, por exemplo, responde 415.
 */
export async function registerPlugins(app: NestFastifyApplication): Promise<void> {
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 5 } });
}

/** Sobe a aplicação inteira (guard global, pipes, filtro) como em produção. */
export async function createTestApp(): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
  );
  await registerPlugins(app);
  app.setGlobalPrefix("api");
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}


/**
 * Lê o cookie de sessão de uma resposta, para o teste poder devolvê-lo na
 * chamada seguinte. O inject do Fastify não mantém sessão entre chamadas, então
 * o cookie viaja na mão, que é justamente o que o navegador faz sozinho.
 */
export function refreshCookieDe(response: { headers: Record<string, unknown> }): string | null {
  const bruto = response.headers["set-cookie"];
  const linhas = Array.isArray(bruto) ? bruto : bruto ? [String(bruto)] : [];
  for (const linha of linhas) {
    const achado = /(^|;\s*)nexlar_refresh=([^;]*)/.exec(linha);
    if (achado) return achado[2];
  }
  return null;
}

/** Monta o cabeçalho Cookie com a sessão. */
export function comCookie(refreshToken: string | null): Record<string, string> {
  return refreshToken ? { cookie: `nexlar_refresh=${refreshToken}` } : {};
}

/** Limpa todas as tabelas do banco de teste (menos o histórico de migrations). */
export async function resetDatabase(app: NestFastifyApplication): Promise<void> {
  if (!/test/.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("resetDatabase só roda contra o banco de teste.");
  }
  const prisma = app.get(PrismaService);
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const names = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
}

export interface TestBroker {
  brokerId: string;
  accessToken: string;
  /** Cookie de sessão devolvido no cadastro. */
  refreshCookie: string | null;
}

/**
 * Registra um corretor pela rota pública e devolve o token da sessão.
 *
 * Marca o e-mail como confirmado logo em seguida, direto no banco: conta nova
 * nasce presa no gate de confirmação, e os testes de domínio (leads, imóveis,
 * isolamento) não são sobre isso. Quem cobre o gate é o auth.e2e.spec.
 */
export async function registerBroker(
  app: NestFastifyApplication,
  fullName: string,
  email: string,
): Promise<TestBroker> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { fullName, email, password: "SenhaForte123", acceptTerms: true },
  });
  if (response.statusCode !== 201) {
    throw new Error(`Falha ao registrar ${email}: ${response.statusCode} ${response.body}`);
  }
  const body = response.json();

  await app.get(PrismaService).broker.update({
    where: { id: body.broker.id },
    data: { emailVerifiedAt: new Date() },
  });

  return {
    brokerId: body.broker.id,
    accessToken: body.tokens.accessToken,
    refreshCookie: refreshCookieDe(response),
  };
}

/** Requisição autenticada como um corretor específico. */
export function requestAs(
  app: NestFastifyApplication,
  broker: TestBroker,
  options: InjectOptions,
) {
  return app.inject({
    ...options,
    headers: {
      ...options.headers,
      authorization: `Bearer ${broker.accessToken}`,
    },
  });
}
