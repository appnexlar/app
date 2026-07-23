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

/**
 * Versão vigente dos Termos e da Política. Sobe quando o texto muda de forma
 * que exija novo aceite. É gravada junto com a data, para a prova de LGPD
 * dizer a que exatamente o corretor concordou.
 */
export const TERMS_VERSION = "2026-07-23";

// --- Registro ---------------------------------------------------------------
export const registerSchema = z.object({
  fullName: z.string().min(2, "Informe seu nome completo").max(160).transform((v) => v.trim()),
  email: emailSchema,
  password: senhaSchema,
  phone: z.string().max(40).trim().optional().or(z.literal("")),
  agencyName: z.string().max(160).trim().optional().or(z.literal("")),
  // O aceite tem que chegar como true: o front não pode criar conta sem ele, e
  // o backend confere de novo, para a regra não morar só na tela.
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: "Aceite os Termos e a Política para continuar." }),
  }),
  marketingOptIn: z.boolean().optional().default(false),
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

// --- Confirmação de e-mail --------------------------------------------------
export const verifyEmailSchema = z.object({
  token: z.string().min(10, "Token inválido"),
});
export type VerifyEmailDto = z.infer<typeof verifyEmailSchema>;

export const resendVerificationSchema = z.object({
  email: emailSchema,
});
export type ResendVerificationDto = z.infer<typeof resendVerificationSchema>;

// --- Perfil (edição) --------------------------------------------------------
/**
 * O corretor edita só o que é dele para editar. CRECI fica de fora de
 * propósito: ele passa por validação manual, então mudá-lo reabriria a
 * verificação e não pode ser um simples PATCH. E-mail também fica de fora,
 * porque trocar o e-mail sem reconfirmar quebraria o gate de confirmação.
 */
export const updateProfileSchema = z
  .object({
    fullName: z.string().min(2, "Informe seu nome completo").max(160).trim().optional(),
    phone: z.string().max(40).trim().optional().or(z.literal("")),
    agencyName: z.string().max(160).trim().optional().or(z.literal("")),
    avatarUrl: z.string().url("URL inválida").max(500).optional().or(z.literal("")),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Nada para atualizar.",
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
  /**
   * Quem responde é o servidor, não o navegador. Enquanto for false, o app
   * mostra o aviso de confirmar o e-mail e a API recusa as rotas privadas.
   */
  emailVerified: boolean;
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
