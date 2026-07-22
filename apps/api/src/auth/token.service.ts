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
   * Detecta reuso de token já revogado.
   */
  async rotateRefreshToken(rawToken: string): Promise<IssuedTokens & { brokerId: string }> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
    });

    if (!record || record.revokedAt || record.expiresAt.getTime() < Date.now()) {
      throw new Error("refresh_invalido");
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.issueSession(record.brokerId);
    return { ...tokens, brokerId: record.brokerId };
  }

  /** Revoga um refresh token específico (logout). Idempotente. */
  async revokeRefreshToken(rawToken: string): Promise<void> {
    const hash = sha256(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
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

  /** Ao redefinir a senha, revoga todas as sessões abertas do corretor. */
  async revokeAllSessions(brokerId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { brokerId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
