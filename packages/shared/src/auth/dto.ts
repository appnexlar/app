import { z } from "zod";

/**
 * DTOs de autenticação — fonte única de validação, compartilhada entre
 * o front (React Hook Form + Zod) e a API (NestJS + zod).
 * Mensagens em português do Brasil.
 */

const senhaSchema = z
  .string()
  .min(8, "A senha precisa de pelo menos 8 caracteres")
  .max(128, "A senha é longa demais")
  .regex(/[A-Za-z]/, "Inclua ao menos uma letra")
  .regex(/[0-9]/, "Inclua ao menos um número");

const emailSchema = z
  .string()
  .min(1, "Informe o e-mail")
  .email("E-mail inválido")
  .transform((v) => v.trim().toLowerCase());

// --- Registro ---------------------------------------------------------------
export const registerSchema = z.object({
  fullName: z.string().min(2, "Informe seu nome completo").max(160).transform((v) => v.trim()),
  email: emailSchema,
  password: senhaSchema,
  phone: z.string().max(40).trim().optional().or(z.literal("")),
  agencyName: z.string().max(160).trim().optional().or(z.literal("")),
});
export type RegisterDto = z.infer<typeof registerSchema>;

// --- Login ------------------------------------------------------------------
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe a senha"),
});
export type LoginDto = z.infer<typeof loginSchema>;

// --- Refresh ----------------------------------------------------------------
export const refreshSchema = z.object({
  refreshToken: z.string().min(10, "Token de renovação ausente"),
});
export type RefreshDto = z.infer<typeof refreshSchema>;

// --- Recuperação de senha ---------------------------------------------------
export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(10, "Token inválido"),
  password: senhaSchema,
});
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;

// --- Perfil (edição) --------------------------------------------------------
export const updateProfileSchema = z.object({
  fullName: z.string().min(2, "Informe seu nome completo").max(160).trim().optional(),
  phone: z.string().max(40).trim().optional().or(z.literal("")),
  agencyName: z.string().max(160).trim().optional().or(z.literal("")),
  creci: z.string().max(40).trim().optional().or(z.literal("")),
  avatarUrl: z.string().url("URL inválida").max(500).optional().or(z.literal("")),
});
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;

// --- Respostas --------------------------------------------------------------
export interface BrokerProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  creci: string | null;
  agencyName: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** validade do access token em segundos */
  expiresIn: number;
}

export interface AuthResponse {
  broker: BrokerProfile;
  tokens: AuthTokens;
}
