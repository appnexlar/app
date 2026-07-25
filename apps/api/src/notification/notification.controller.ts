import { Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { NotificationListResponse } from "@nexlar/shared";
import { CurrentBroker } from "../common/decorators/current-broker.decorator";
import { NotificationService } from "./notification.service";

/**
 * Avisos do corretor. Tudo aqui fala do dono do token: o broker nunca vem da
 * URL, então não existe "ler a notificação do vizinho" nem por id sorteado.
 */
@ApiTags("notifications")
@Controller("notificacoes")
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  @ApiOperation({ summary: "Notificações do corretor, com o total de não lidas" })
  list(@CurrentBroker("brokerId") brokerId: string): Promise<NotificationListResponse> {
    return this.notifications.listByBroker(brokerId);
  }

  @Post(":id/lida")
  @ApiOperation({ summary: "Marca uma notificação como lida" })
  async markAsRead(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<NotificationListResponse> {
    await this.notifications.markAsRead(brokerId, id);
    // Devolve a lista já atualizada: o sino precisa do novo total, e uma
    // resposta vazia obrigaria o front a uma segunda ida ao servidor.
    return this.notifications.listByBroker(brokerId);
  }

  @Post("marcar-todas-lidas")
  @ApiOperation({ summary: "Marca todas as notificações como lidas" })
  async markAllAsRead(
    @CurrentBroker("brokerId") brokerId: string,
  ): Promise<NotificationListResponse> {
    await this.notifications.markAllAsRead(brokerId);
    return this.notifications.listByBroker(brokerId);
  }
}
