import type { NotificationListResponse } from "@nexlar/shared";
import { http } from "../../lib/http";

export function fetchNotifications(): Promise<NotificationListResponse> {
  return http.get<NotificationListResponse>("/notificacoes");
}

export function markNotificationRead(id: string): Promise<NotificationListResponse> {
  return http.post<NotificationListResponse>(`/notificacoes/${id}/lida`, {});
}

export function markAllNotificationsRead(): Promise<NotificationListResponse> {
  return http.post<NotificationListResponse>("/notificacoes/marcar-todas-lidas", {});
}
