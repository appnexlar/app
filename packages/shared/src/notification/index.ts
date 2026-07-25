export interface NotificationDTO {
  id: string;
  type: string;
  title: string;
  body: string;
  actionUrl?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  items: NotificationDTO[];
  unreadCount: number;
}
