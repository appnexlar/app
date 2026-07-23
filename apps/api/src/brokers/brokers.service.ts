import { Injectable, NotFoundException } from "@nestjs/common";
import type { Broker } from "@prisma/client";
import type { BrokerProfile, UpdateProfileDto } from "@nexlar/shared";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Perfil do corretor logado. Sempre opera sobre o broker do token, nunca sobre
 * um id vindo do payload: não há como um corretor ler ou editar o perfil de
 * outro, porque o id nem entra na conversa.
 */
@Injectable()
export class BrokersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(brokerId: string): Promise<BrokerProfile> {
    const broker = await this.prisma.broker.findUnique({ where: { id: brokerId } });
    // O guard já garantiu que a conta existe; isto cobre a corrida rara de a
    // conta ser apagada entre o guard e aqui.
    if (!broker) throw new NotFoundException("Conta não encontrada.");
    return toProfile(broker);
  }

  async updateMe(brokerId: string, dto: UpdateProfileDto): Promise<BrokerProfile> {
    // Campo vazio (string "") vira null no banco, para "apagar" a imobiliária
    // não gravar uma string em branco. Campo ausente não é tocado.
    const data: Record<string, string | null> = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.phone !== undefined) data.phone = dto.phone || null;
    if (dto.agencyName !== undefined) data.agencyName = dto.agencyName || null;
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl || null;

    const broker = await this.prisma.broker.update({ where: { id: brokerId }, data });
    return toProfile(broker);
  }
}

/** Mesma forma do perfil devolvido pelo auth, para o front ter um só formato. */
function toProfile(broker: Broker): BrokerProfile {
  return {
    id: broker.id,
    fullName: broker.fullName,
    email: broker.email,
    phone: broker.phone,
    creci: broker.creci,
    agencyName: broker.agencyName,
    avatarUrl: broker.avatarUrl,
    emailVerified: broker.emailVerifiedAt !== null,
    createdAt: broker.createdAt.toISOString(),
    updatedAt: broker.updatedAt.toISOString(),
  };
}
