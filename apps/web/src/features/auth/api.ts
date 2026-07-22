import type {
  AuthResponse,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from "@nexlar/shared";
import { ApiError } from "../../lib/http";
import { http } from "../../lib/http";

/** Autentica o corretor. Retorna o perfil e os tokens de sessão. */
export function login(credentials: LoginDto): Promise<AuthResponse> {
  return http.post<AuthResponse>("/auth/login", credentials);
}

/** Cria a conta do corretor e já devolve a sessão. */
export function register(data: RegisterDto): Promise<AuthResponse> {
  return http.post<AuthResponse>("/auth/register", data);
}

/** Dispara o envio do link de redefinição de senha. */
export function forgotPassword(data: ForgotPasswordDto): Promise<void> {
  return http.post<void>("/auth/forgot-password", data);
}

/** Redefine a senha usando o token recebido por e-mail. */
export function resetPassword(data: ResetPasswordDto): Promise<void> {
  return http.post<void>("/auth/reset-password", data);
}

/**
 * Traduz erros da API em mensagens claras para o corretor,
 * sem nunca vazar texto técnico do servidor.
 */
export function authErrorMessage(error: unknown, context: "login" | "register"): string | null {
  if (!error) return null;
  if (error instanceof ApiError) {
    if (error.status === 0) return "Sem conexão com o servidor. Verifique sua internet e tente de novo.";
    if (error.status === 429) return "Muitas tentativas. Aguarde um instante e tente novamente.";
    if (context === "login" && error.status === 401) return "E-mail ou senha incorretos.";
    if (context === "register" && error.status === 409) return "Já existe uma conta com esse e-mail.";
  }
  return context === "login"
    ? "Não foi possível entrar agora. Tente novamente em instantes."
    : "Não foi possível criar a conta agora. Tente novamente em instantes.";
}
