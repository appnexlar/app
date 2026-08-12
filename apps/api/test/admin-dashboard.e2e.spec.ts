import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import * as argon2 from "argon2";
import { PrismaService } from "../src/prisma/prisma.service";
import { RateLimitStore } from "../src/common/rate-limit/rate-limit.store";
import { createTestApp, registerBroker, resetDatabase } from "./e2e-utils";

/**
 * Dashboard do Nextlar Admin (docs/10, Fase 2): agregados corretos, recorte
 * por permissão feito no SERVIDOR e nenhum dado pessoal de lead no caminho.
 */

const SENHA = "senha-forte-de-teste-123";

describe("Nextlar Admin: dashboard", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  async function adminToken(
    role: "super_admin" | "admin" | "suporte" | "financeiro" = "admin",
  ): Promise<string> {
    const email = `${role}@nextlar.app`;
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

  function resumo(token: string, periodo?: string) {
    return app.inject({
      method: "GET",
      url: `/api/admin/dashboard/summary${periodo ? `?periodo=${periodo}` : ""}`,
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

  it("conta as contas por status, com o pendente derivado do e-mail", async () => {
    await registerBroker(app, "Ana Corretora", "ana@example.com");
    const suspensa = await registerBroker(app, "Bruna Imóveis", "bruna@example.com");
    const semConfirmar = await registerBroker(app, "Carla Nova", "carla@example.com");

    await prisma.broker.update({ where: { id: suspensa.brokerId }, data: { status: "suspenso" } });
    await prisma.broker.update({
      where: { id: semConfirmar.brokerId },
      data: { emailVerifiedAt: null },
    });

    const res = await resumo(await adminToken("admin"));

    expect(res.statusCode).toBe(200);
    const { contas } = res.json();
    expect(contas.total).toBe(3);
    expect(contas.ativas).toBe(2);
    // Pendente é recorte de dentro das ativas, não uma quarta pilha.
    expect(contas.pendentesVerificacao).toBe(1);
    expect(contas.suspensas).toBe(1);
    expect(contas.bloqueadas).toBe(0);
  });

  it("o financeiro não recebe indicador nenhum de contas", async () => {
    await registerBroker(app, "Ana Corretora", "ana@example.com");

    const res = await resumo(await adminToken("financeiro"));

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.contas).toBeNull();
    expect(body.movimento).toBeNull();
    expect(body.uso).toBeNull();
    expect(body.recentes).toEqual([]);
    // O recorte é do servidor: nem o total vaza para quem não alcança contas.
    expect(JSON.stringify(body)).not.toContain("ana@example.com");
  });

  it("alerta só aparece quando há o que fazer, e some quando não há", async () => {
    const corretora = await registerBroker(app, "Ana Corretora", "ana@example.com");
    const token = await adminToken("admin");

    const semNada = await resumo(token);
    expect(semNada.json().alertas).toEqual([]);

    await prisma.broker.update({
      where: { id: corretora.brokerId },
      data: { status: "suspenso" },
    });

    // Conta parada na confirmação: cadastrada há uma semana, e-mail nunca
    // confirmado. Três dias é o limite do alerta.
    const parada = await registerBroker(app, "Carla Nova", "carla@example.com");
    await prisma.broker.update({
      where: { id: parada.brokerId },
      data: {
        emailVerifiedAt: null,
        createdAt: new Date(Date.now() - 7 * 86_400_000),
      },
    });

    const comAlertas = await resumo(token);
    const alertas = comAlertas.json().alertas as { kind: string; count: number }[];
    expect(alertas).toHaveLength(2);
    expect(alertas.find((a) => a.kind === "contas_suspensas")?.count).toBe(1);
    expect(alertas.find((a) => a.kind === "verificacao_parada")?.count).toBe(1);
  });

  it("e-mail que não saiu vira alerta, com o motivo à mão e sem o endereço de ninguém", async () => {
    const token = await adminToken("admin");
    await registerBroker(app, "Ana Corretora", "ana@example.com");

    // Duas falhas recentes e uma velha: o alerta é sobre agora, então a de
    // dois dias atrás não pode entrar na conta.
    await prisma.emailDeliveryFailure.createMany({
      data: [
        {
          kind: "recuperacao_senha",
          recipient: "an*@example.com",
          reason: "403 The nexlar.app domain is not verified",
          createdAt: new Date(Date.now() - 3_600_000),
        },
        { kind: "confirmacao", recipient: "ca***@example.com", reason: "timeout" },
        {
          kind: "boas_vindas",
          recipient: "jo**@example.com",
          reason: "500 antigo",
          createdAt: new Date(Date.now() - 2 * 86_400_000),
        },
      ],
    });

    const body = (await resumo(token)).json();
    const alerta = (body.alertas as { kind: string; count: number; detalhe?: string }[]).find(
      (a) => a.kind === "emails_falhando",
    );

    expect(alerta?.count).toBe(2);
    // O motivo da falha mais recente vem junto: é o que diz à equipe se o caso
    // é domínio fora do ar ou instabilidade passageira.
    expect(alerta?.detalhe).toContain("timeout");

    // O destinatário não sai da tabela de falhas: o alerta responde "quantos"
    // e "por quê", nunca "para quem". Nem o mascarado precisa trafegar.
    const json = JSON.stringify(body);
    expect(json).not.toContain("an*@");
    expect(json).not.toContain("ca***@");
  });

  it("o período recorta o movimento e compara com a janela anterior", async () => {
    const antiga = await registerBroker(app, "Ana Antiga", "ana@example.com");
    await registerBroker(app, "Bruna Nova", "bruna@example.com");

    // Ana entrou há 10 dias: fica fora da janela de 7 dias e dentro da de 30.
    await prisma.broker.update({
      where: { id: antiga.brokerId },
      data: { createdAt: new Date(Date.now() - 10 * 86_400_000) },
    });

    const token = await adminToken("admin");

    const semana = await resumo(token, "7d");
    expect(semana.json().periodo).toBe("7d");
    expect(semana.json().movimento.novasContas).toBe(1);
    // A janela anterior de 7 dias cobre o décimo dia atrás, onde Ana está.
    expect(semana.json().movimento.novasContasAnterior).toBe(1);

    const mes = await resumo(token, "30d");
    expect(mes.json().movimento.novasContas).toBe(2);
    expect(mes.json().movimento.novasContasAnterior).toBe(0);
  });

  it("o uso é contagem e nunca carrega gente da carteira do corretor", async () => {
    const corretora = await registerBroker(app, "Ana Corretora", "ana@example.com");
    await app.inject({
      method: "POST",
      url: "/api/leads",
      headers: { authorization: `Bearer ${corretora.accessToken}` },
      payload: { fullName: "Lead Sigilosa", whatsapp: "11999998888" },
    });

    const res = await resumo(await adminToken("suporte"));

    expect(res.json().uso.leads).toBe(1);
    const corpo = JSON.stringify(res.json());
    expect(corpo).not.toContain("Lead Sigilosa");
    expect(corpo).not.toContain("11999998888");
  });

  it("corretor não entra no dashboard administrativo", async () => {
    const corretora = await registerBroker(app, "Ana Corretora", "ana@example.com");
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/dashboard/summary",
      headers: { authorization: `Bearer ${corretora.accessToken}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("período inválido é recusado antes de virar consulta", async () => {
    const res = await resumo(await adminToken("admin"), "sempre");
    expect(res.statusCode).toBe(400);
  });
});
