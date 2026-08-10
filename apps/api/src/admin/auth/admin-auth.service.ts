import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import * as argon2 from "argon2";
import { permissionsForRole, type AdminLoginDto, type AdminProfile } from "@nexlar/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { LoginAttemptService } from "../../auth/login-attempt.service";
import type { GoogleIdentity } from "../../auth/google-oauth.service";
import { AdminAuditService } from "../audit/admin-audit.service";
import { AdminTokenService, type AdminIssuedTokens } from "./admin-token.service";

/**
 * Hash descartável para igualar o tempo de resposta quando o e-mail não
 * existe. Mesmo raciocínio do login do corretor: sem isso, a resposta rápida
 * denunciaria quais e-mails têm conta administrativa, que é exatamente a
 * lista que um atacante quer montar.
 */
const DUMMY_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$WCzeeJZpresent0aInvalid00000000000000000000000";

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: AdminTokenService,
    private readonly attempts: LoginAttemptService,
    private readonly audit: AdminAuditService,
  ) {}

  /**
   * A trava de tentativas é a mesma do corretor, com chave prefixada: os
   * contadores não se misturam, e cinco erros na conta administrativa não
   * dependem de quantos houve na conta de corretor do mesmo e-mail.
   */
  private chaveDeTentativa(email: string): string {
    return `admin:${email}`;
  }

  async login(dto: AdminLoginDto): Promise<{ profile: AdminProfile; tokens: AdminIssuedTokens }> {
    this.attempts.assertNotBlocked(this.chaveDeTentativa(dto.email));

    const invalid = new UnauthorizedException("E-mail ou senha incorretos.");
    const admin = await this.prisma.adminUser.findUnique({ where: { email: dto.email } });

    if (!admin) {
      await argon2.verify(DUMMY_HASH, dto.password).catch(() => false);
      this.attempts.registerFailure(this.chaveDeTentativa(dto.email));
      throw invalid;
    }

    const ok = await argon2.verify(admin.passwordHash, dto.password).catch(() => false);
    if (!ok) {
      this.attempts.registerFailure(this.chaveDeTentativa(dto.email));
      throw invalid;
    }

    // Suspenso responde igual a senha errada: quem foi desligado da equipe
    // não precisa de confirmação de que a conta ainda existe.
    if (admin.status === "suspenso") {
      this.attempts.registerFailure(this.chaveDeTentativa(dto.email));
      throw invalid;
    }

    this.attempts.clear(this.chaveDeTentativa(dto.email));

    const [tokens] = await Promise.all([
      this.tokens.issueSession(admin.id),
      this.prisma.adminUser.update({
        where: { id: admin.id },
        data: { lastLoginAt: new Date() },
      }),
    ]);

    return { profile: this.toProfile(admin), tokens };
  }

  /**
   * Entrada pelo Google. A regra que inverte o app do corretor: aqui o
   * Google AUTENTICA, nunca cadastra. O caminho feliz é achar um admin já
   * vinculado (google_id); o primeiro login vincula pelo e-mail, que o
   * GoogleOAuthService só entrega com email_verified; e-mail desconhecido é
   * recusado SEM criar nada e sem dizer se a conta existe.
   */
  async googleSignIn(identity: GoogleIdentity): Promise<{ adminId: string }> {
    const semAcesso = new ForbiddenException("Esta conta Google não tem acesso.");

    const porVinculo = await this.prisma.adminUser.findUnique({
      where: { googleId: identity.googleId },
    });
    if (porVinculo) {
      if (porVinculo.status === "suspenso") throw semAcesso;
      await this.prisma.adminUser.update({
        where: { id: porVinculo.id },
        data: { lastLoginAt: new Date() },
      });
      return { adminId: porVinculo.id };
    }

    const porEmail = await this.prisma.adminUser.findUnique({
      where: { email: identity.email },
    });
    if (!porEmail) throw semAcesso;
    if (porEmail.status === "suspenso") throw semAcesso;
    // E-mail de admin já preso a OUTRA conta Google: alguém está tentando
    // entrar com uma conta diferente da vinculada. Caso raro e legítimo
    // (troca de conta Google) se resolve por um super_admin, não sozinho.
    if (porEmail.googleId) throw semAcesso;

    // Primeiro login pelo Google: grava o vínculo e audita na mesma
    // transação. Vincular credencial é mudança de segurança, não detalhe.
    await this.prisma.$transaction(async (tx) => {
      await tx.adminUser.update({
        where: { id: porEmail.id },
        data: { googleId: identity.googleId, lastLoginAt: new Date() },
      });
      await this.audit.record(
        {
          adminId: porEmail.id,
          role: porEmail.role,
          permissions: permissionsForRole(porEmail.role),
        },
        {
          action: "admin_google_vinculado",
          resourceType: "admin_user",
          resourceId: porEmail.id,
          newState: { email: porEmail.email, googleEmail: identity.email },
        },
        tx,
      );
    });
    return { adminId: porEmail.id };
  }

  async profileOf(adminId: string): Promise<AdminProfile> {
    const admin = await this.prisma.adminUser.findUnique({ where: { id: adminId } });
    // O guard acabou de validar; sumir aqui é corrida com uma exclusão.
    if (!admin) throw new UnauthorizedException("Sessão expirada ou inválida");
    return this.toProfile(admin);
  }

  private toProfile(admin: {
    id: string;
    email: string;
    fullName: string;
    role: AdminProfile["role"];
  }): AdminProfile {
    return {
      id: admin.id,
      email: admin.email,
      fullName: admin.fullName,
      role: admin.role,
      permissions: [...permissionsForRole(admin.role)],
    };
  }
}
