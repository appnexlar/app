import { createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../../prisma/prisma.service";
import { durationToSeconds, RefreshTokenError } from "../../auth/token.service";
import { TIPO_TOKEN_ADMIN } from "../rbac/admin-auth.guard";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Mesma janela de corrida entre abas do TokenService do corretor. */
const CORRIDA_TOLERADA_MS = 15_000;

export interface AdminIssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Sessão do Nexlar Admin. Mesma mecânica do TokenService do corretor
 * (refresh opaco só como hash, rotação, reuso derruba tudo), com duas
 * diferenças de política, as duas por ser sessão privilegiada:
 *
 * 1. TTLs curtos: access de 10 minutos, sessão de 8 horas.
 * 2. Teto ABSOLUTO: a rotação carrega o vencimento original em vez de
 *    renovar. A sessão do corretor se estende com o uso (30 dias rolantes);
 *    a administrativa acaba no horário marcado, ativa ou não, e a pessoa
 *    entra de novo. Um cookie administrativo roubado vale no máximo o resto
 *    do expediente, nunca um mês.
 */
@Injectable()
export class AdminTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private get accessTtl(): number {
    return durationToSeconds(this.config.get<string>("JWT_ADMIN_ACCESS_TTL", "10m"));
  }

  private get sessionTtl(): number {
    return durationToSeconds(this.config.get<string>("JWT_ADMIN_SESSION_TTL", "8h"));
  }

  private async issueAccessToken(adminId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: adminId, typ: TIPO_TOKEN_ADMIN },
      {
        secret: this.config.getOrThrow<string>("JWT_ADMIN_SECRET"),
        expiresIn: this.accessTtl,
      },
    );
  }

  /** Abre uma sessão nova, com o teto de 8h contado a partir de agora. */
  async issueSession(adminId: string): Promise<AdminIssuedTokens> {
    const raw = randomBytes(48).toString("hex");
    const expiresAt = new Date(Date.now() + this.sessionTtl * 1000);
    const [accessToken] = await Promise.all([
      this.issueAccessToken(adminId),
      this.prisma.adminRefreshToken.create({
        data: { adminUserId: adminId, tokenHash: sha256(raw), expiresAt },
      }),
    ]);
    return { accessToken, refreshToken: raw, expiresIn: this.accessTtl };
  }

  /**
   * Rotaciona o refresh. O token novo herda o expires_at do antigo: é isso
   * que faz o teto ser absoluto. Reuso de token revogado derruba todas as
   * sessões do administrador, igual ao corretor.
   */
  async rotate(rawToken: string): Promise<AdminIssuedTokens & { adminId: string }> {
    const record = await this.prisma.adminRefreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
    });
    if (!record) throw new RefreshTokenError("desconhecido");

    if (record.revokedAt) {
      const foiRotacao = record.revokedReason === "rotacao";
      const desdeRevogado = Date.now() - record.revokedAt.getTime();
      if (foiRotacao && desdeRevogado <= CORRIDA_TOLERADA_MS) {
        throw new RefreshTokenError("corrida");
      }
      if (foiRotacao) {
        await this.revokeAllSessions(record.adminUserId, "reuso_detectado");
        throw new RefreshTokenError("reuso");
      }
      throw new RefreshTokenError("expirado");
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new RefreshTokenError("expirado");
    }

    const raw = randomBytes(48).toString("hex");
    const [accessToken] = await Promise.all([
      this.issueAccessToken(record.adminUserId),
      this.prisma.$transaction([
        this.prisma.adminRefreshToken.update({
          where: { id: record.id },
          data: { revokedAt: new Date(), revokedReason: "rotacao" },
        }),
        this.prisma.adminRefreshToken.create({
          data: {
            adminUserId: record.adminUserId,
            tokenHash: sha256(raw),
            // Herda o vencimento: o teto da sessão não se move.
            expiresAt: record.expiresAt,
          },
        }),
      ]),
    ]);
    return {
      accessToken,
      refreshToken: raw,
      expiresIn: this.accessTtl,
      adminId: record.adminUserId,
    };
  }

  /** Logout: revoga só o token apresentado. Idempotente. */
  async revoke(rawToken: string): Promise<void> {
    await this.prisma.adminRefreshToken.updateMany({
      where: { tokenHash: sha256(rawToken), revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: "logout" },
    });
  }

  /** Derruba todas as sessões de um administrador (suspensão, reuso). */
  async revokeAllSessions(
    adminId: string,
    motivo: "senha_redefinida" | "reuso_detectado" | "logout" = "logout",
  ): Promise<void> {
    await this.prisma.adminRefreshToken.updateMany({
      where: { adminUserId: adminId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: motivo },
    });
  }
}
