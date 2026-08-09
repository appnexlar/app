import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { AppModule } from "../src/app.module";
import {
  GoogleAuthError,
  GoogleOAuthService,
  type GoogleIdentity,
} from "../src/auth/google-oauth.service";
import { RateLimitStore } from "../src/common/rate-limit/rate-limit.store";
import { PrismaService } from "../src/prisma/prisma.service";
import { comCookie, refreshCookieDe, registerPlugins, resetDatabase } from "./e2e-utils";

/**
 * Entrar e criar conta com o Google.
 *
 * O Google é substituído por um dublê: os testes são sobre as nossas regras
 * (state, vínculo por e-mail, aceite dos Termos, conta suspensa), não sobre a
 * implementação do OpenID Connect deles. O dublê mantém a URL de autorização e
 * o redirect_uri reais, que é o que precisa continuar batendo com o cadastro
 * no Google Cloud.
 */
class GoogleDouble extends GoogleOAuthService {
  /** Quem o Google vai dizer que é, na próxima troca de código. */
  identidade: GoogleIdentity = {
    googleId: "google-sub-1",
    email: "ana@gmail.com",
    fullName: "Ana Vitrine",
  };

  /** Quando preenchido, a troca falha com este motivo. */
  falha: GoogleAuthError | null = null;

  /** O nonce que o controller mandou conferir, para o teste inspecionar. */
  nonceRecebido: string | null = null;

  async identify(_code: string, nonce: string): Promise<GoogleIdentity> {
    this.nonceRecebido = nonce;
    if (this.falha) throw this.falha;
    return this.identidade;
  }
}

describe("entrar com o Google (e2e)", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let google: GoogleDouble;

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
    // O limite por IP é global e compartilhado entre os casos: sem zerar, o
    // último teste do arquivo levaria 429 sem ter nada a ver com a regra.
    app.get(RateLimitStore).reset();
    google.identidade = {
      googleId: "google-sub-1",
      email: "ana@gmail.com",
      fullName: "Ana Vitrine",
    };
    google.falha = null;
  });

  /** Começa o fluxo e devolve o state sorteado junto com o cookie do pedido. */
  async function abrirPedido(): Promise<{ state: string; cookie: string }> {
    const inicio = await app.inject({ method: "GET", url: "/api/auth/google" });
    expect(inicio.statusCode).toBe(302);

    const destino = new URL(inicio.headers.location as string);
    expect(destino.origin).toBe("https://accounts.google.com");
    // O client_secret nunca pode aparecer na URL que o navegador carrega.
    expect(inicio.headers.location).not.toContain("test-client-secret");

    const state = destino.searchParams.get("state");
    const bruto = inicio.headers["set-cookie"];
    const linhas = Array.isArray(bruto) ? bruto : [String(bruto)];
    const achado = /nexlar_oauth=([^;]*)/.exec(linhas.join(";"));
    if (!state || !achado) throw new Error("O pedido não foi aberto");
    return { state, cookie: achado[1] };
  }

  function callback(params: {
    state: string;
    cookie: string;
    code?: string;
  }) {
    const busca = new URLSearchParams({ code: params.code ?? "codigo-do-google", state: params.state });
    return app.inject({
      method: "GET",
      url: `/api/auth/google/callback?${busca.toString()}`,
      headers: { cookie: `nexlar_oauth=${params.cookie}` },
    });
  }

  /** Lê um cookie qualquer da resposta. */
  function cookieDe(resposta: { headers: Record<string, unknown> }, nome: string): string | null {
    const bruto = resposta.headers["set-cookie"];
    const linhas = Array.isArray(bruto) ? bruto : bruto ? [String(bruto)] : [];
    for (const linha of linhas) {
      const achado = new RegExp(`(^|;\\s*)${nome}=([^;]*)`).exec(linha);
      // maxAge 0 é o cookie sendo apagado, não um valor.
      if (achado && achado[2] !== "") return achado[2];
    }
    return null;
  }

  it("manda para o Google com state, nonce e escopo mínimo", async () => {
    const inicio = await app.inject({ method: "GET", url: "/api/auth/google" });
    const destino = new URL(inicio.headers.location as string);

    expect(destino.searchParams.get("response_type")).toBe("code");
    expect(destino.searchParams.get("scope")).toBe("openid email profile");
    expect(destino.searchParams.get("state")).toBeTruthy();
    expect(destino.searchParams.get("nonce")).toBeTruthy();
    // O state e o nonce precisam ser valores diferentes: um protege o retorno,
    // o outro amarra o id_token, e reaproveitar um no lugar do outro anularia
    // a segunda proteção.
    expect(destino.searchParams.get("state")).not.toBe(destino.searchParams.get("nonce"));
  });

  it("recusa o retorno com state que não bate e não abre sessão", async () => {
    const { cookie } = await abrirPedido();

    const resposta = await callback({ state: "state-de-outro-fluxo", cookie });

    expect(resposta.statusCode).toBe(302);
    expect(resposta.headers.location).toContain("/login?erro=google");
    expect(refreshCookieDe(resposta)).toBeNull();
    expect(await prisma.broker.count()).toBe(0);
  });

  it("recusa o retorno sem o cookie do pedido", async () => {
    const { state } = await abrirPedido();

    const resposta = await app.inject({
      method: "GET",
      url: `/api/auth/google/callback?code=x&state=${state}`,
    });

    expect(resposta.headers.location).toContain("/login?erro=google");
    expect(refreshCookieDe(resposta)).toBeNull();
  });

  it("não cria conta no retorno: guarda o convite e manda completar o cadastro", async () => {
    const { state, cookie } = await abrirPedido();

    const resposta = await callback({ state, cookie });

    expect(resposta.headers.location).toContain("/criar-conta");
    expect(cookieDe(resposta, "nexlar_cadastro")).toBeTruthy();
    // Sem aceite dos Termos não existe conta. Essa é a razão de o convite
    // existir em vez de o callback criar tudo de uma vez.
    expect(await prisma.broker.count()).toBe(0);
    expect(refreshCookieDe(resposta)).toBeNull();
  });

  it("conclui o cadastro sem senha, com e-mail já confirmado", async () => {
    const { state, cookie } = await abrirPedido();
    const retorno = await callback({ state, cookie });
    const convite = cookieDe(retorno, "nexlar_cadastro");

    const pendente = await app.inject({
      method: "GET",
      url: "/api/auth/google/pending",
      headers: { cookie: `nexlar_cadastro=${convite}` },
    });
    expect(pendente.statusCode).toBe(200);
    expect(pendente.json()).toMatchObject({ email: "ana@gmail.com", fullName: "Ana Vitrine" });

    const criada = await app.inject({
      method: "POST",
      url: "/api/auth/register/google",
      headers: { cookie: `nexlar_cadastro=${convite}` },
      payload: { phone: "11988887777", acceptTerms: true, marketingOptIn: false },
    });

    expect(criada.statusCode).toBe(201);
    expect(criada.json().broker.emailVerified).toBe(true);
    expect(refreshCookieDe(criada)).toBeTruthy();

    const broker = await prisma.broker.findUniqueOrThrow({ where: { email: "ana@gmail.com" } });
    expect(broker.passwordHash).toBeNull();
    expect(broker.googleId).toBe("google-sub-1");
    expect(broker.termsAcceptedAt).not.toBeNull();
  });

  it("ignora nome e e-mail enviados no corpo: quem manda é o convite", async () => {
    const { state, cookie } = await abrirPedido();
    const convite = cookieDe(await callback({ state, cookie }), "nexlar_cadastro");

    await app.inject({
      method: "POST",
      url: "/api/auth/register/google",
      headers: { cookie: `nexlar_cadastro=${convite}` },
      payload: {
        acceptTerms: true,
        // Tentativa de criar a conta com o e-mail de outra pessoa.
        email: "vitima@gmail.com",
        fullName: "Outra Pessoa",
      },
    });

    const broker = await prisma.broker.findUniqueOrThrow({ where: { googleId: "google-sub-1" } });
    expect(broker.email).toBe("ana@gmail.com");
    expect(broker.fullName).toBe("Ana Vitrine");
    expect(await prisma.broker.count()).toBe(1);
  });

  it("recusa o cadastro sem o aceite dos Termos", async () => {
    const { state, cookie } = await abrirPedido();
    const convite = cookieDe(await callback({ state, cookie }), "nexlar_cadastro");

    const resposta = await app.inject({
      method: "POST",
      url: "/api/auth/register/google",
      headers: { cookie: `nexlar_cadastro=${convite}` },
      payload: { acceptTerms: false },
    });

    expect(resposta.statusCode).toBe(400);
    expect(await prisma.broker.count()).toBe(0);
  });

  it("recusa o cadastro sem convite nenhum", async () => {
    const resposta = await app.inject({
      method: "POST",
      url: "/api/auth/register/google",
      payload: { acceptTerms: true },
    });

    expect(resposta.statusCode).toBe(401);
    expect(await prisma.broker.count()).toBe(0);
  });

  it("vincula a conta de senha existente e entra direto", async () => {
    const cadastro = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        fullName: "Ana Antiga",
        email: "ana@gmail.com",
        password: "SenhaForte123",
        acceptTerms: true,
      },
    });
    expect(cadastro.statusCode).toBe(201);

    const { state, cookie } = await abrirPedido();
    const resposta = await callback({ state, cookie });

    expect(resposta.headers.location).toContain("/dashboard");
    expect(refreshCookieDe(resposta)).toBeTruthy();

    const broker = await prisma.broker.findUniqueOrThrow({ where: { email: "ana@gmail.com" } });
    expect(broker.googleId).toBe("google-sub-1");
    // A senha antiga continua valendo: vincular o Google acrescenta um jeito de
    // entrar, não tira o que existia.
    expect(broker.passwordHash).not.toBeNull();
    // E o e-mail passa a valer como confirmado, porque o Google confirmou.
    expect(broker.emailVerifiedAt).not.toBeNull();
    expect(await prisma.broker.count()).toBe(1);
  });

  it("barra a conta suspensa também pelo Google", async () => {
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        fullName: "Ana Antiga",
        email: "ana@gmail.com",
        password: "SenhaForte123",
        acceptTerms: true,
      },
    });
    await prisma.broker.update({
      where: { email: "ana@gmail.com" },
      data: { status: "suspenso", suspendedAt: new Date() },
    });

    const { state, cookie } = await abrirPedido();
    const resposta = await callback({ state, cookie });

    expect(resposta.headers.location).toContain("/login?erro=suspensa");
    expect(refreshCookieDe(resposta)).toBeNull();
  });

  it("não aceita quem o Google não confirmou o e-mail", async () => {
    google.falha = new GoogleAuthError("email_nao_verificado");

    const { state, cookie } = await abrirPedido();
    const resposta = await callback({ state, cookie });

    expect(resposta.headers.location).toContain("/login?erro=google_email");
    expect(await prisma.broker.count()).toBe(0);
  });

  it("o pedido é de uso único: o mesmo state não serve duas vezes", async () => {
    const { state, cookie } = await abrirPedido();
    const primeira = await callback({ state, cookie });
    expect(primeira.headers.location).toContain("/criar-conta");

    // O navegador teria perdido o cookie na primeira volta; aqui simulamos
    // alguém que guardou o valor e tenta reapresentá-lo.
    const segunda = await app.inject({
      method: "GET",
      url: `/api/auth/google/callback?code=outro&state=${state}`,
      headers: { cookie: `nexlar_oauth=${cookie}` },
    });
    // O convite anterior é substituído, e nenhuma conta nasce sem passar pelo
    // formulário: o efeito colateral perigoso seria uma sessão, e não há.
    expect(refreshCookieDe(segunda)).toBeNull();
    expect(await prisma.broker.count()).toBe(0);
  });

  it("entra de novo pelo Google depois da conta criada", async () => {
    const primeiro = await abrirPedido();
    const convite = cookieDe(await callback(primeiro), "nexlar_cadastro");
    await app.inject({
      method: "POST",
      url: "/api/auth/register/google",
      headers: { cookie: `nexlar_cadastro=${convite}` },
      payload: { acceptTerms: true },
    });

    const segundo = await abrirPedido();
    const entrada = await callback(segundo);

    expect(entrada.headers.location).toContain("/dashboard");
    const sessao = refreshCookieDe(entrada);
    expect(sessao).toBeTruthy();

    // A sessão precisa valer de verdade, não só existir como cookie.
    const renovada = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: comCookie(sessao),
    });
    expect(renovada.statusCode).toBe(200);
    expect(renovada.json().broker.email).toBe("ana@gmail.com");
    expect(await prisma.broker.count()).toBe(1);
  });

  it("conta do Google não entra por senha, e a resposta não denuncia isso", async () => {
    const { state, cookie } = await abrirPedido();
    const convite = cookieDe(await callback({ state, cookie }), "nexlar_cadastro");
    await app.inject({
      method: "POST",
      url: "/api/auth/register/google",
      headers: { cookie: `nexlar_cadastro=${convite}` },
      payload: { acceptTerms: true },
    });

    const tentativa = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "ana@gmail.com", password: "QualquerSenha123" },
    });

    expect(tentativa.statusCode).toBe(401);
    // Mesma frase de e-mail inexistente: a tela não pode virar um jeito de
    // descobrir quem tem conta e por onde essa pessoa entra.
    expect(tentativa.json().message).toBe("E-mail ou senha incorretos.");
  });
});
