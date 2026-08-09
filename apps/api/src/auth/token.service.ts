import { randomBytes, createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";

/** Converte "15m" / "30d" / "3600s" em segundos. */
export function durationToSeconds(input: string): number {
  const match = /^(\d+)([smhd])$/.exec(input.trim());
  if (!match) {
    const asNumber = Number(input);
    if (!Number.isNaN(asNumber)) return asNumber;
    throw new Error(`Duração inválida: ${input}`);
  }
  const value = Number(match[1]);
  const unit = match[2];
  const factor = { s: 1, m: 60, h: 3600, d: 86400 }[unit] ?? 1;
  return value * factor;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Quanto tempo depois de revogado um token ainda é tratado como corrida entre
 * abas, e não como reuso malicioso. Curto de propósito: é o suficiente para
 * duas requisições que saíram juntas, e curto demais para servir a um ataque.
 */
const CORRIDA_TOLERADA_MS = 15_000;

/** Marca do convite de cadastro pelo Google, para não confundir com sessão. */
const TIPO_CONVITE_GOOGLE = "cadastro_google";

/** Tempo para completar o cadastro depois de voltar do Google. */
const CONVITE_GOOGLE_TTL_S = 30 * 60;

/** Motivo pelo qual a renovação falhou. Só o servidor vê o detalhe. */
export type RefreshFailure = "desconhecido" | "expirado" | "corrida" | "reuso";

export class RefreshTokenError extends Error {
  constructor(readonly motivo: RefreshFailure) {
    super(`refresh_${motivo}`);
    this.name = "RefreshTokenError";
  }
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private get accessTtl(): number {
    return durationToSeconds(this.config.get<string>("JWT_ACCESS_TTL", "15m"));
  }

  private get refreshTtl(): number {
    return durationToSeconds(this.config.get<string>("JWT_REFRESH_TTL", "30d"));
  }

  async issueAccessToken(brokerId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: brokerId },
      {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
        expiresIn: this.accessTtl,
      },
    );
  }

  /** Cria e persiste um novo refresh token (opaco, guardado só como hash). */
  async issueRefreshToken(brokerId: string): Promise<string> {
    const raw = randomBytes(48).toString("hex");
    const expiresAt = new Date(Date.now() + this.refreshTtl * 1000);
    await this.prisma.refreshToken.create({
      data: { brokerId, tokenHash: sha256(raw), expiresAt },
    });
    return raw;
  }

  async issueSession(brokerId: string): Promise<IssuedTokens> {
    const [accessToken, refreshToken] = await Promise.all([
      this.issueAccessToken(brokerId),
      this.issueRefreshToken(brokerId),
    ]);
    return { accessToken, refreshToken, expiresIn: this.accessTtl };
  }

  /**
   * Valida o refresh token e faz a rotação: revoga o antigo e emite um novo par.
   *
   * Detecção de reuso: um token já revogado sendo apresentado de novo é sinal
   * de que alguém guardou uma cópia. Não dá para saber quem é o legítimo, então
   * a resposta segura é derrubar TODAS as sessões daquele corretor: quem for
   * dono entra de novo com a senha, quem roubou fica sem nada.
   *
   * A exceção é a corrida honesta: duas abas do mesmo navegador renovando quase
   * ao mesmo tempo. A que perde apresenta o token que a outra acabou de
   * rotacionar, sem nenhum roubo envolvido. Por isso existe a janela de
   * tolerância: dentro dela a chamada é recusada, mas ninguém é expulso, e o
   * cliente tenta de novo já com o cookie novo.
   */
  async rotateRefreshToken(rawToken: string): Promise<IssuedTokens & { brokerId: string }> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
    });

    if (!record) throw new RefreshTokenError("desconhecido");

    if (record.revokedAt) {
      // Só rotação pode ser corrida. Logout e redefinição de senha são
      // encerramentos deliberados: apresentar aquele token de novo nunca é
      // aceitável, nem um segundo depois.
      const foiRotacao = record.revokedReason === "rotacao";
      const desdeRevogado = Date.now() - record.revokedAt.getTime();
      if (foiRotacao && desdeRevogado <= CORRIDA_TOLERADA_MS) {
        throw new RefreshTokenError("corrida");
      }
      if (foiRotacao) {
        // Rotacionado há tempo e voltou: é cópia guardada. Derruba tudo.
        await this.revokeAllSessions(record.brokerId, "reuso_detectado");
        throw new RefreshTokenError("reuso");
      }
      throw new RefreshTokenError("expirado");
    }

    if (record.expiresAt.getTime() < Date.now()) {
      throw new RefreshTokenError("expirado");
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date(), revokedReason: "rotacao" },
    });

    const tokens = await this.issueSession(record.brokerId);
    return { ...tokens, brokerId: record.brokerId };
  }

  /** Revoga um refresh token específico (logout). Idempotente. */
  async revokeRefreshToken(rawToken: string): Promise<void> {
    const hash = sha256(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: "logout" },
    });
  }

  // --- Convite de cadastro pelo Google --------------------------------------
  /**
   * Guarda "o Google confirmou que esta pessoa é dona deste e-mail" enquanto
   * ela preenche o resto do cadastro.
   *
   * É JWT assinado, e não uma linha no banco, porque nada foi criado ainda: a
   * conta só nasce no envio do formulário. O `typ` fixo impede que um access
   * token, assinado com o mesmo segredo, seja apresentado aqui e vire cadastro.
   */
  async signGoogleSignup(identity: {
    googleId: string;
    email: string;
    fullName: string;
  }): Promise<string> {
    return this.jwt.signAsync(
      {
        typ: TIPO_CONVITE_GOOGLE,
        sub: identity.googleId,
        email: identity.email,
        name: identity.fullName,
      },
      {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
        expiresIn: CONVITE_GOOGLE_TTL_S,
      },
    );
  }

  /** Confere o convite. Null para qualquer motivo de recusa. */
  async verifyGoogleSignup(token: string | null): Promise<{
    googleId: string;
    email: string;
    fullName: string;
  } | null> {
    if (!token) return null;
    try {
      const payload = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
      });
      if (payload.typ !== TIPO_CONVITE_GOOGLE) return null;
      const googleId = typeof payload.sub === "string" ? payload.sub : "";
      const email = typeof payload.email === "string" ? payload.email : "";
      const fullName = typeof payload.name === "string" ? payload.name : "";
      if (!googleId || !email || !fullName) return null;
      return { googleId, email, fullName };
    } catch {
      return null;
    }
  }

  // --- Confirmação de e-mail ------------------------------------------------
  /**
   * Prazo longo de propósito: o corretor pode se cadastrar no fim do dia e só
   * abrir o e-mail no dia seguinte. Diferente da senha, aqui não há urgência,
   * e um link vencido cedo demais vira suporte.
   */
  async createEmailVerificationToken(brokerId: string): Promise<string> {
    const raw = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias
    await this.prisma.emailVerificationToken.create({
      data: { brokerId, tokenHash: sha256(raw), expiresAt },
    });
    return raw;
  }

  /** Consome um token de confirmação de uso único. Retorna o brokerId ou null. */
  async consumeEmailVerificationToken(rawToken: string): Promise<string | null> {
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
    });
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      return null;
    }
    await this.prisma.emailVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    return record.brokerId;
  }

  /**
   * Invalida os links de confirmação ainda abertos do corretor. Chamado antes
   * de emitir um novo, para o reenvio não deixar vários links válidos soltos
   * em caixas de e-mail diferentes.
   */
  async revokeEmailVerificationTokens(brokerId: string): Promise<void> {
    await this.prisma.emailVerificationToken.updateMany({
      where: { brokerId, usedAt: null },
      data: { usedAt: new Date() },
    });
  }

  // --- Recuperação de senha -------------------------------------------------
  async createPasswordResetToken(brokerId: string): Promise<string> {
    const raw = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora
    await this.prisma.passwordResetToken.create({
      data: { brokerId, tokenHash: sha256(raw), expiresAt },
    });
    return raw;
  }

  /** Consome um token de reset de uso único. Retorna o brokerId ou null. */
  async consumePasswordResetToken(rawToken: string): Promise<string | null> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
    });
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      return null;
    }
    await this.prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    return record.brokerId;
  }

  /**
   * Derruba todas as sessões abertas do corretor. Usada ao redefinir a senha e
   * quando se detecta reuso de token.
   */
  async revokeAllSessions(
    brokerId: string,
    motivo: "senha_redefinida" | "reuso_detectado" = "senha_redefinida",
  ): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { brokerId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: motivo },
    });
  }
}
