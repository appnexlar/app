import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { AppModule } from "../src/app.module";
import {
  EmailService,
  type EmailVerificationEmail,
  type PasswordResetEmail,
  type WelcomeEmail,
} from "../src/email/email.service";
import { RateLimitStore } from "../src/common/rate-limit/rate-limit.store";
import { PrismaService } from "../src/prisma/prisma.service";
import { registerPlugins, resetDatabase } from "./e2e-utils";

/**
 * Jornada 1 (autenticação), as três correções de prioridade zero:
 * limite de tentativas, logout que encerra a sessão de verdade e recuperação
 * de senha ponta a ponta. Cada caso verifica o efeito no servidor, e não só o
 * código de resposta.
 */

/** E-mails ficam em memória para o teste ler o link de redefinição. */
class EmailCollector extends EmailService {
  readonly resets: PasswordResetEmail[] = [];
  readonly welcomes: WelcomeEmail[] = [];
  readonly verifications: EmailVerificationEmail[] = [];

  async sendEmailVerification(email: EmailVerificationEmail): Promise<void> {
    this.verifications.push(email);
  }

  async sendPasswordReset(email: PasswordResetEmail): Promise<void> {
    this.resets.push(email);
  }

  async sendWelcome(email: WelcomeEmail): Promise<void> {
    this.welcomes.push(email);
  }

  /** Token cru do último link de redefinição enviado para o e-mail informado. */
  lastTokenFor(to: string): string {
    const email = [...this.resets].reverse().find((e) => e.to === to);
    if (!email) throw new Error(`Nenhum e-mail de redefinição para ${to}`);
    return extrairToken(email.resetUrl);
  }

  /** Token cru do último link de confirmação enviado para o e-mail informado. */
  lastVerificationFor(to: string): string {
    const email = [...this.verifications].reverse().find((e) => e.to === to);
    if (!email) throw new Error(`Nenhum e-mail de confirmação para ${to}`);
    return extrairToken(email.verifyUrl);
  }
}

function extrairToken(url: string): string {
  const token = new URL(url).searchParams.get("token");
  if (!token) throw new Error(`Link sem token: ${url}`);
  return token;
}

const SENHA = "SenhaForte123";
const SENHA_NOVA = "OutraSenha456";

describe("Autenticação: tentativas, logout e recuperação de senha", () => {
  let app: NestFastifyApplication;
  let emails: EmailCollector;
  let limites: RateLimitStore;

  beforeAll(async () => {
    emails = new EmailCollector();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue(emails)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await registerPlugins(app);
    app.setGlobalPrefix("api");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    limites = app.get(RateLimitStore);
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    // Os contadores vivem no processo: sem isto um caso puniria o seguinte.
    limites.clearAll();
  });

  // --- Helpers --------------------------------------------------------------
  const post = (url: string, payload: Record<string, unknown>) =>
    app.inject({ method: "POST", url: `/api/${url}`, payload });

  async function criarConta(email: string) {
    const response = await post("auth/register", {
      fullName: "Corretor de Teste",
      email,
      password: SENHA,
      acceptTerms: true,
    });
    expect(response.statusCode).toBe(201);
    return response.json() as {
      broker: { id: string; emailVerified: boolean };
      tokens: { accessToken: string; refreshToken: string };
    };
  }


  /**
   * Envia o CRECI como multipart. Montado à mão porque o inject do Fastify não
   * tem helper de formulário: campos de texto primeiro, arquivo por último,
   * que é a ordem em que o servidor lê.
   */
  async function enviarCreci(
    accessToken: string,
    creci: string,
    creciUf: string,
    arquivo: { filename: string; contentType: string } = {
      filename: "creci.png",
      contentType: "image/png",
    },
  ) {
    const boundary = "----NexlarTeste123456";
    const campo = (nome: string, valor: string) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="${nome}"\r\n\r\n${valor}\r\n`;

    const corpo = Buffer.concat([
      Buffer.from(campo("creci", creci) + campo("creciUf", creciUf)),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${arquivo.filename}"\r\n` +
          `Content-Type: ${arquivo.contentType}\r\n\r\n`,
      ),
      // Conteúdo irrelevante: o que se testa aqui é a regra, não a imagem.
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    return app.inject({
      method: "POST",
      url: "/api/brokers/me/creci",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: corpo,
    });
  }

  // --- Fatia 6: aceite de Termos (LGPD) ------------------------------------
  it("recusa o cadastro sem o aceite dos Termos", async () => {
    const semAceite = await post("auth/register", {
      fullName: "Sem Aceite",
      email: "sem.aceite@teste.com",
      password: SENHA,
    });
    expect(semAceite.statusCode).toBe(400);

    const recusando = await post("auth/register", {
      fullName: "Recusou",
      email: "recusou@teste.com",
      password: SENHA,
      acceptTerms: false,
    });
    expect(recusando.statusCode).toBe(400);
  });

  it("grava a prova do aceite: data + versão do texto", async () => {
    const email = "prova.aceite@teste.com";
    const sessao = await criarConta(email);

    const broker = await app.get(PrismaService).broker.findUnique({
      where: { id: sessao.broker.id },
      select: { termsAcceptedAt: true, termsVersion: true, marketingOptIn: true },
    });
    expect(broker?.termsAcceptedAt).toBeInstanceOf(Date);
    expect(broker?.termsVersion).toBeTruthy();
    // Opt-in de marketing é separado e default false.
    expect(broker?.marketingOptIn).toBe(false);
  });

  it("guarda o opt-in de marketing quando aceito", async () => {
    const resposta = await post("auth/register", {
      fullName: "Quer Marketing",
      email: "marketing@teste.com",
      password: SENHA,
      acceptTerms: true,
      marketingOptIn: true,
    });
    expect(resposta.statusCode).toBe(201);

    const broker = await app.get(PrismaService).broker.findUnique({
      where: { id: resposta.json().broker.id },
      select: { marketingOptIn: true },
    });
    expect(broker?.marketingOptIn).toBe(true);
  });

  // --- Fatia 7: editar o próprio perfil ------------------------------------
  it("edita o próprio perfil pelo PATCH /brokers/me", async () => {
    const email = "edita.perfil@teste.com";
    const sessao = await criarConta(email);
    await post("auth/verify-email", {
      token: emails.lastVerificationFor(email),
    });

    const patch = await app.inject({
      method: "PATCH",
      url: "/api/brokers/me",
      headers: { authorization: `Bearer ${sessao.tokens.accessToken}` },
      payload: { fullName: "Nome Novo", phone: "11988887777", agencyName: "Imobiliária X" },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().fullName).toBe("Nome Novo");
    expect(patch.json().phone).toBe("11988887777");

    const me = await app.inject({
      method: "GET",
      url: "/api/brokers/me",
      headers: { authorization: `Bearer ${sessao.tokens.accessToken}` },
    });
    expect(me.json().fullName).toBe("Nome Novo");
  });

  it("não deixa editar e-mail nem CRECI por essa rota", async () => {
    const email = "campos.travados@teste.com";
    const sessao = await criarConta(email);
    await post("auth/verify-email", { token: emails.lastVerificationFor(email) });

    const patch = await app.inject({
      method: "PATCH",
      url: "/api/brokers/me",
      headers: { authorization: `Bearer ${sessao.tokens.accessToken}` },
      // Campos que não estão no schema são ignorados pelo Zod (strip), não
      // gravam. O e-mail continua o mesmo.
      payload: { email: "outro@teste.com", creci: "999999", fullName: "Só o Nome" },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().email).toBe(email);
    expect(patch.json().fullName).toBe("Só o Nome");
  });

  it("perfil de outro corretor é inacessível: a rota só conhece o do token", async () => {
    // Não há rota /brokers/:id de propósito. O id vem sempre do JWT, então não
    // existe forma de pedir o perfil alheio.
    const semToken = await app.inject({ method: "GET", url: "/api/brokers/me" });
    expect(semToken.statusCode).toBe(401);
  });

  // --- Fatia 1: limite de tentativas ---------------------------------------
  it("bloqueia a conta após 5 senhas erradas e responde 429", async () => {
    const email = "tentativas@teste.com";
    await criarConta(email);

    for (let i = 0; i < 5; i += 1) {
      const errada = await post("auth/login", { email, password: "SenhaErrada1" });
      expect(errada.statusCode).toBe(401);
    }

    // A sexta tentativa nem chega a conferir a senha: com a senha CERTA
    // continua barrada, prova de que o bloqueio é da conta e não do palpite.
    const bloqueada = await post("auth/login", { email, password: SENHA });
    expect(bloqueada.statusCode).toBe(429);
    expect(bloqueada.json().message).toMatch(/Muitas tentativas/);
  });

  it("conta as falhas mesmo para e-mail inexistente, sem revelar que não existe", async () => {
    const email = "fantasma@teste.com";
    for (let i = 0; i < 5; i += 1) {
      const response = await post("auth/login", { email, password: "SenhaErrada1" });
      expect(response.statusCode).toBe(401);
      expect(response.json().message).toBe("E-mail ou senha incorretos.");
    }
    const bloqueada = await post("auth/login", { email, password: "SenhaErrada1" });
    expect(bloqueada.statusCode).toBe(429);
  });

  it("acertar a senha zera o contador de falhas", async () => {
    const email = "zera@teste.com";
    await criarConta(email);

    for (let i = 0; i < 4; i += 1) {
      await post("auth/login", { email, password: "SenhaErrada1" });
    }
    expect((await post("auth/login", { email, password: SENHA })).statusCode).toBe(200);

    // Depois do acerto o corretor tem as 5 chances de novo.
    for (let i = 0; i < 5; i += 1) {
      const response = await post("auth/login", { email, password: "SenhaErrada1" });
      expect(response.statusCode).toBe(401);
    }
  });

  it("limita o volume de pedidos de recuperação por IP", async () => {
    const payload = { email: "limite.forgot@teste.com" };
    for (let i = 0; i < 5; i += 1) {
      expect((await post("auth/forgot-password", payload)).statusCode).toBe(204);
    }
    const excedeu = await post("auth/forgot-password", payload);
    expect(excedeu.statusCode).toBe(429);
    expect(excedeu.headers["retry-after"]).toBeDefined();
  });

  // --- Fatia 2: logout ------------------------------------------------------
  it("logout revoga o refresh token no servidor", async () => {
    const email = "logout@teste.com";
    const sessao = await criarConta(email);

    const saida = await post("auth/logout", { refreshToken: sessao.tokens.refreshToken });
    expect(saida.statusCode).toBe(204);

    const renovar = await post("auth/refresh", { refreshToken: sessao.tokens.refreshToken });
    expect(renovar.statusCode).toBe(401);
  });

  it("logout é idempotente e não confirma se o token existia", async () => {
    const email = "logout.repetido@teste.com";
    const sessao = await criarConta(email);
    const token = sessao.tokens.refreshToken;

    expect((await post("auth/logout", { refreshToken: token })).statusCode).toBe(204);
    expect((await post("auth/logout", { refreshToken: token })).statusCode).toBe(204);
    expect(
      (await post("auth/logout", { refreshToken: "token-que-nunca-existiu-0123456789" }))
        .statusCode,
    ).toBe(204);
  });

  // --- Fatia 3: recuperação de senha ---------------------------------------
  it("responde igual para e-mail cadastrado e não cadastrado", async () => {
    const cadastrado = "neutro@teste.com";
    await criarConta(cadastrado);

    expect((await post("auth/forgot-password", { email: cadastrado })).statusCode).toBe(204);
    expect(
      (await post("auth/forgot-password", { email: "nao.existe@teste.com" })).statusCode,
    ).toBe(204);

    // O e-mail só sai para quem tem conta, mas a resposta HTTP não muda.
    expect(emails.resets.some((e) => e.to === cadastrado)).toBe(true);
    expect(emails.resets.some((e) => e.to === "nao.existe@teste.com")).toBe(false);
  });

  it("redefine a senha pelo link, invalida a antiga e derruba as sessões abertas", async () => {
    const email = "reset@teste.com";
    const sessao = await criarConta(email);

    expect((await post("auth/forgot-password", { email })).statusCode).toBe(204);
    const token = emails.lastTokenFor(email);

    const reset = await post("auth/reset-password", { token, password: SENHA_NOVA });
    expect(reset.statusCode).toBe(204);

    // A senha antiga não vale mais.
    expect((await post("auth/login", { email, password: SENHA })).statusCode).toBe(401);
    // A nova vale.
    expect((await post("auth/login", { email, password: SENHA_NOVA })).statusCode).toBe(200);
    // E quem já estava dentro foi desconectado.
    const renovar = await post("auth/refresh", { refreshToken: sessao.tokens.refreshToken });
    expect(renovar.statusCode).toBe(401);
  });

  it("recusa token de redefinição inválido ou já usado", async () => {
    const email = "reset.uso-unico@teste.com";
    await criarConta(email);
    await post("auth/forgot-password", { email });
    const token = emails.lastTokenFor(email);

    expect((await post("auth/reset-password", { token, password: SENHA_NOVA })).statusCode).toBe(204);

    const repetido = await post("auth/reset-password", { token, password: "MaisUmaSenha789" });
    expect(repetido.statusCode).toBe(400);
    expect(repetido.json().message).toMatch(/expirou ou já foi usado/);

    const inventado = await post("auth/reset-password", {
      token: "token-inventado-0123456789",
      password: "MaisUmaSenha789",
    });
    expect(inventado.statusCode).toBe(400);
  });

  // --- Fatia 4: confirmação de e-mail --------------------------------------
  it("conta nova nasce sem e-mail confirmado e não acessa rota privada", async () => {
    const email = "gate@teste.com";
    const sessao = await criarConta(email);

    expect(sessao.broker.emailVerified).toBe(false);

    const leads = await app.inject({
      method: "GET",
      url: "/api/leads",
      headers: { authorization: `Bearer ${sessao.tokens.accessToken}` },
    });
    expect(leads.statusCode).toBe(403);
    expect(leads.json().message).toMatch(/Confirme seu e-mail/);
  });

  it("o link de confirmação libera o acesso e o perfil passa a dizer confirmado", async () => {
    const email = "confirma@teste.com";
    const sessao = await criarConta(email);
    const token = emails.lastVerificationFor(email);

    expect((await post("auth/verify-email", { token })).statusCode).toBe(204);

    const leads = await app.inject({
      method: "GET",
      url: "/api/leads",
      headers: { authorization: `Bearer ${sessao.tokens.accessToken}` },
    });
    expect(leads.statusCode).toBe(200);

    // O mesmo token de sessão agora devolve o perfil com o e-mail confirmado.
    const renovado = await post("auth/refresh", { refreshToken: sessao.tokens.refreshToken });
    expect(renovado.json().broker.emailVerified).toBe(true);

    // E as boas-vindas só saem depois da confirmação.
    expect(emails.welcomes.some((e) => e.to === email)).toBe(true);
  });

  it("recusa token de confirmação inválido ou já usado", async () => {
    const email = "confirma.uso-unico@teste.com";
    await criarConta(email);
    const token = emails.lastVerificationFor(email);

    expect((await post("auth/verify-email", { token })).statusCode).toBe(204);

    const repetido = await post("auth/verify-email", { token });
    expect(repetido.statusCode).toBe(400);
    expect(repetido.json().message).toMatch(/expirou ou já foi usado/);

    expect(
      (await post("auth/verify-email", { token: "token-inventado-0123456789" })).statusCode,
    ).toBe(400);
  });

  it("reenviar confirmação invalida o link anterior", async () => {
    const email = "reenvio@teste.com";
    await criarConta(email);
    const primeiro = emails.lastVerificationFor(email);

    expect((await post("auth/resend-verification", { email })).statusCode).toBe(204);
    const segundo = emails.lastVerificationFor(email);
    expect(segundo).not.toBe(primeiro);

    // O link velho não vale mais: quem tiver acesso a um e-mail antigo não entra.
    expect((await post("auth/verify-email", { token: primeiro })).statusCode).toBe(400);
    expect((await post("auth/verify-email", { token: segundo })).statusCode).toBe(204);
  });

  it("reenvio responde igual para conta inexistente e para conta já confirmada", async () => {
    const confirmada = "reenvio.confirmada@teste.com";
    await criarConta(confirmada);
    await post("auth/verify-email", { token: emails.lastVerificationFor(confirmada) });
    const antes = emails.verifications.length;

    expect((await post("auth/resend-verification", { email: confirmada })).statusCode).toBe(204);
    expect(
      (await post("auth/resend-verification", { email: "ninguem@teste.com" })).statusCode,
    ).toBe(204);

    // Resposta igual, mas nenhum e-mail novo saiu em nenhum dos dois casos.
    expect(emails.verifications.length).toBe(antes);
  });

  // --- Fatia 5: status da conta --------------------------------------------
  it("conta suspensa não entra, não renova e perde as rotas privadas", async () => {
    const email = "suspensa@teste.com";
    const sessao = await criarConta(email);
    await post("auth/verify-email", { token: emails.lastVerificationFor(email) });

    await app.get(PrismaService).broker.update({
      where: { id: sessao.broker.id },
      data: { status: "suspenso", suspendedAt: new Date(), suspendedReason: "teste" },
    });

    // Rota privada cai na hora, sem esperar o token vencer.
    const leads = await app.inject({
      method: "GET",
      url: "/api/leads",
      headers: { authorization: `Bearer ${sessao.tokens.accessToken}` },
    });
    expect(leads.statusCode).toBe(403);
    expect(leads.json().message).toMatch(/suspensa/);

    // Não renova a sessão.
    expect(
      (await post("auth/refresh", { refreshToken: sessao.tokens.refreshToken })).statusCode,
    ).toBe(403);

    // E não entra de novo, mesmo com a senha certa.
    const entrar = await post("auth/login", { email, password: SENHA });
    expect(entrar.statusCode).toBe(403);
    expect(entrar.json().message).toMatch(/suspensa/);
  });

  it("suspensão não vaza o motivo guardado no banco", async () => {
    const email = "suspensa.motivo@teste.com";
    const sessao = await criarConta(email);
    await app.get(PrismaService).broker.update({
      where: { id: sessao.broker.id },
      data: { status: "suspenso", suspendedReason: "fraude confirmada pelo jurídico" },
    });

    const resposta = await post("auth/login", { email, password: SENHA });
    expect(resposta.body).not.toContain("fraude");
    expect(resposta.body).not.toContain("jurídico");
  });

  it("libera o bloqueio de tentativas quando a senha é redefinida", async () => {
    const email = "reset.desbloqueia@teste.com";
    await criarConta(email);

    for (let i = 0; i < 5; i += 1) {
      await post("auth/login", { email, password: "SenhaErrada1" });
    }
    expect((await post("auth/login", { email, password: SENHA })).statusCode).toBe(429);

    await post("auth/forgot-password", { email });
    const token = emails.lastTokenFor(email);
    expect((await post("auth/reset-password", { token, password: SENHA_NOVA })).statusCode).toBe(204);

    expect((await post("auth/login", { email, password: SENHA_NOVA })).statusCode).toBe(200);
  });

  // --- Verificação de CRECI -------------------------------------------------
  it("conta nova nasce sem CRECI enviado, e isso não impede nada", async () => {
    const email = "creci.novo@teste.com";
    const sessao = await criarConta(email);
    await post("auth/verify-email", { token: emails.lastVerificationFor(email) });

    const perfil = await app.inject({
      method: "GET",
      url: "/api/brokers/me",
      headers: { authorization: `Bearer ${sessao.tokens.accessToken}` },
    });
    expect(perfil.statusCode).toBe(200);
    expect(perfil.json().creciStatus).toBe("nao_enviado");
    expect(perfil.json().creci).toBeNull();

    // Sem CRECI o corretor usa o sistema inteiro: o selo é prêmio, não pedágio.
    const leads = await app.inject({
      method: "GET",
      url: "/api/leads",
      headers: { authorization: `Bearer ${sessao.tokens.accessToken}` },
    });
    expect(leads.statusCode).toBe(200);
  });

  it("enviar o CRECI põe a conta em análise, e o corretor não se aprova sozinho", async () => {
    const email = "creci.envio@teste.com";
    const sessao = await criarConta(email);
    await post("auth/verify-email", { token: emails.lastVerificationFor(email) });

    const enviado = await enviarCreci(sessao.tokens.accessToken, "12345-F", "PR");
    expect(enviado.statusCode).toBe(201);
    expect(enviado.json().creciStatus).toBe("pendente");

    // Reenviar durante a análise é recusado: não se troca o documento embaixo
    // de quem está conferindo.
    const denovo = await enviarCreci(sessao.tokens.accessToken, "99999-F", "SP");
    expect(denovo.statusCode).toBe(400);
    expect(denovo.json().message).toMatch(/já está em análise/);

    // E não existe caminho para o próprio corretor virar "aprovado".
    const tentativa = await app.inject({
      method: "PATCH",
      url: "/api/brokers/me",
      headers: { authorization: `Bearer ${sessao.tokens.accessToken}` },
      payload: { creciStatus: "aprovado", creci: "00000-X" },
    });
    const depois = await app.inject({
      method: "GET",
      url: "/api/brokers/me",
      headers: { authorization: `Bearer ${sessao.tokens.accessToken}` },
    });
    expect([200, 400]).toContain(tentativa.statusCode);
    expect(depois.json().creciStatus).toBe("pendente");
    expect(depois.json().creci).toBe("12345-F");
  });

  it("recusa documento de tipo ou tamanho inválido", async () => {
    const email = "creci.arquivo@teste.com";
    const sessao = await criarConta(email);
    await post("auth/verify-email", { token: emails.lastVerificationFor(email) });

    const executavel = await enviarCreci(
      sessao.tokens.accessToken,
      "12345-F",
      "PR",
      { filename: "virus.exe", contentType: "application/x-msdownload" },
    );
    expect(executavel.statusCode).toBe(400);
    expect(executavel.json().message).toMatch(/JPG, PNG ou WEBP/);
  });

  it("o selo só aparece na página pública depois de aprovado", async () => {
    const email = "creci.selo@teste.com";
    const sessao = await criarConta(email);
    await post("auth/verify-email", { token: emails.lastVerificationFor(email) });
    const auth = { authorization: `Bearer ${sessao.tokens.accessToken}` };

    const lead = await app.inject({
      method: "POST",
      url: "/api/leads",
      headers: auth,
      payload: { fullName: "Lead do selo", whatsapp: "11966660001" },
    });
    const imovel = await app.inject({
      method: "POST",
      url: "/api/properties",
      headers: auth,
      payload: {
        title: "Imóvel do selo",
        purpose: "venda",
        category: "residencial",
        type: "apartamento",
        origin: "captacao_propria",
      },
    });
    const envio = await app.inject({
      method: "POST",
      url: `/api/properties/${imovel.json().id}/shares`,
      headers: auth,
      payload: { leadId: lead.json().id },
    });
    const token = envio.json().token ?? envio.json().publicToken;

    await enviarCreci(sessao.tokens.accessToken, "12345-F", "PR");

    // Pendente: sem selo, e o número do CRECI não vaza. Um CRECI que ninguém
    // conferiu não pode aparecer como se tivesse autoridade.
    const antes = await app.inject({ method: "GET", url: `/api/public/shares/${token}` });
    expect(antes.json().broker.verified).toBe(false);
    expect(antes.json().broker.creci).toBeNull();

    // Aprovação é manual, direto no banco.
    await app.get(PrismaService).broker.update({
      where: { id: sessao.broker.id },
      data: { creciStatus: "aprovado", creciReviewedAt: new Date() },
    });

    const depois = await app.inject({ method: "GET", url: `/api/public/shares/${token}` });
    expect(depois.json().broker.verified).toBe(true);
    expect(depois.json().broker.creci).toBe("12345-F");
    expect(depois.json().broker.creciUf).toBe("PR");

    // Nem verificado nem não verificado expõe dado interno do corretor.
    expect(depois.body).not.toContain(email);
    expect(depois.body).not.toContain(sessao.broker.id);
  });
});
