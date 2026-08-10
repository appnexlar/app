import { z } from "zod";
import { ADMIN_ROLES, type AdminPermission, type AdminRole } from "./permissions";

/** Entrada no Nexlar Admin. Sem cadastro público: admin nasce por convite. */
export const adminLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido"),
  password: z.string().min(1, "Informe a senha"),
});
export type AdminLoginDto = z.infer<typeof adminLoginSchema>;

/**
 * Criação de administrador, feita por quem tem admin.admins.manage.
 * A senha inicial é definida por quem convida e trocada pela pessoa no
 * primeiro acesso; fluxo de convite por e-mail fica para uma fase futura.
 */
export const createAdminSchema = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido"),
  fullName: z.string().trim().min(3, "Informe o nome completo").max(120),
  role: z.enum(ADMIN_ROLES),
  password: z
    .string()
    .min(10, "A senha precisa de pelo menos 10 caracteres")
    .max(128, "Senha longa demais"),
});
export type CreateAdminDto = z.infer<typeof createAdminSchema>;

/**
 * Alteração de papel ou status de um administrador. O motivo é obrigatório:
 * é ele que dá sentido à linha de auditoria.
 */
export const updateAdminSchema = z
  .object({
    role: z.enum(ADMIN_ROLES).optional(),
    status: z.enum(["ativo", "suspenso"]).optional(),
    reason: z.string().trim().min(5, "Descreva o motivo").max(500),
  })
  .refine((dto) => dto.role !== undefined || dto.status !== undefined, {
    message: "Nada para alterar",
  });
export type UpdateAdminDto = z.infer<typeof updateAdminSchema>;

/** Identidade devolvida no login e no /me. O front decide menus por aqui. */
export interface AdminProfile {
  id: string;
  email: string;
  fullName: string;
  role: AdminRole;
  permissions: AdminPermission[];
}

export interface AdminAuthResponse {
  admin: AdminProfile;
  accessToken: string;
  /** Segundos até o access token vencer; o front renova antes disso. */
  expiresIn: number;
}

/** Linha da lista de administradores (tela do super_admin). */
export interface AdminUserSummary {
  id: string;
  email: string;
  fullName: string;
  role: AdminRole;
  status: "ativo" | "suspenso";
  lastLoginAt: string | null;
  createdAt: string;
}
