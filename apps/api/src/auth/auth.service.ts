import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import * as argon2 from "argon2";
import type { Broker } from "@prisma/client";
import { Prisma } from "@prisma/client";
import type {
  AuthResponse,
  BrokerProfile,
  LoginDto,
  RefreshDto,
  RegisterDto,
} from "@nexlar/shared";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { TokenService } from "./token.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly email: EmailService,
  ) {}

  /** Cria a conta do corretor e já devolve a sessão. */
  async register(dto: RegisterDto): Promise<AuthResponse> {
    const passwordHash = await this.hash(dto.password);

    let broker: Broker;
    try {
      broker = await this.prisma.broker.create({
        data: {
          fullName: dto.fullName,
          email: dto.email,
          passwordHash,
          phone: dto.phone ? dto.phone : null,
          agencyName: dto.agencyName ? dto.agencyName : null,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Já existe uma conta com esse e-mail.");
      }
      throw error;
    }

    await this.email.sendWelcome({ to: broker.email, fullName: broker.fullName });

    return this.buildSession(broker);
  }

  /** Autentica o corretor por e-mail e senha. */
  async login(dto: LoginDto): Promise<AuthResponse> {
    const broker = await this.prisma.broker.findUnique({
      where: { email: dto.email },
    });

    // Mesma resposta para e-mail inexistente e senha errada (não revela qual).
    const invalid = new UnauthorizedException("E-mail ou senha incorretos.");
    if (!broker) {
      // Verifica um hash fixo mesmo assim, para não vazar tempo de resposta.
      await argon2.verify(DUMMY_HASH, dto.password).catch(() => false);
      throw invalid;
    }

    const ok = await argon2.verify(broker.passwordHash, dto.password).catch(() => false);
    if (!ok) throw invalid;

    return this.buildSession(broker);
  }

  /**
   * Renova a sessão sem pedir a senha de novo: valida o refresh token,
   * rotaciona (o antigo é revogado) e devolve um novo par de tokens.
   */
  async refresh(dto: RefreshDto): Promise<AuthResponse> {
    let rotated: Awaited<ReturnType<TokenService["rotateRefreshToken"]>>;
    try {
      rotated = await this.tokens.rotateRefreshToken(dto.refreshToken);
    } catch {
      throw new UnauthorizedException("Sessão expirada. Entre novamente.");
    }

    const broker = await this.prisma.broker.findUnique({ where: { id: rotated.brokerId } });
    if (!broker) throw new UnauthorizedException("Sessão expirada. Entre novamente.");

    const { brokerId: _brokerId, ...tokens } = rotated;
    return { broker: toProfile(broker), tokens };
  }

  private hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  private async buildSession(broker: Broker): Promise<AuthResponse> {
    const tokens = await this.tokens.issueSession(broker.id);
    return { broker: toProfile(broker), tokens };
  }
}

/** Hash descartável para equalizar o tempo de resposta no login inválido. */
const DUMMY_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHR2YWx1ZQ$3S2p1G0m2Yl0vJ0mQ2s4Xh1n8Z0aQ2s4Xh1n8Z0aQ2s";

/** Converte a entidade do banco no perfil público compartilhado com o front. */
function toProfile(broker: Broker): BrokerProfile {
  return {
    id: broker.id,
    fullName: broker.fullName,
    email: broker.email,
    phone: broker.phone,
    creci: broker.creci,
    agencyName: broker.agencyName,
    avatarUrl: broker.avatarUrl,
    createdAt: broker.createdAt.toISOString(),
    updatedAt: broker.updatedAt.toISOString(),
  };
}
