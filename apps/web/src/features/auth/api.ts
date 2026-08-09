import type {
  AuthProviders,
  AuthResponse,
  ForgotPasswordDto,
  GooglePendingSignup,
  LoginDto,
  RegisterDto,
  RegisterWithGoogleDto,
  ResendVerificationDto,
  ResetPasswordDto,
  VerifyEmailDto,
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

/** Quais formas de entrada este ambiente oferece. */
export function authProviders(): Promise<AuthProviders> {
  return http.get<AuthProviders>("/auth/providers");
}

/**
 * Quem é o dono do cadastro pelo Google em aberto. A identidade vive num
 * cookie assinado no servidor, então esta chamada não leva nada: é o servidor
 * que sabe quem voltou do Google.
 */
export function googlePendingSignup(): Promise<GooglePendingSignup> {
  return http.get<GooglePendingSignup>("/auth/google/pending");
}

/** Conclui o cadastro pelo Google. Nome e e-mail vêm do cookie, não daqui. */
export function registerWithGoogle(data: RegisterWithGoogleDto): Promise<AuthResponse> {
  return http.post<AuthResponse>("/auth/register/google", data);
}

/**
 * Encerra a sessão no servidor: revoga o refresh token e apaga o cookie. Sem
 * corpo, porque o token vive num cookie httpOnly e o JavaScript não o conhece.
 */
export function logout(): Promise<void> {
  return http.post<void>("/auth/logout");
}

/** Confirma o e-mail com o token que veio no link. */
export function verifyEmail(data: VerifyEmailDto): Promise<void> {
  return http.post<void>("/auth/verify-email", data);
}

/** Pede um novo link de confirmação. Invalida o anterior. */
export function resendVerification(data: ResendVerificationDto): Promise<void> {
  return http.post<void>("/auth/resend-verification", data);
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
export type AuthErrorContext = "login" | "register" | "forgot" | "reset" | "verify";

const FALLBACK: Record<AuthErrorContext, string> = {
  login: "Não foi possível entrar agora. Tente novamente em instantes.",
  register: "Não foi possível criar a conta agora. Tente novamente em instantes.",
  forgot: "Não foi possível enviar o link agora. Tente novamente em instantes.",
  reset: "Não foi possível salvar a nova senha agora. Tente novamente em instantes.",
  verify: "Não foi possível confirmar o e-mail agora. Tente novamente em instantes.",
};

export function authErrorMessage(error: unknown, context: AuthErrorContext): string | null {
  if (!error) return null;
  if (error instanceof ApiError) {
    if (error.status === 0) return "Sem conexão com o servidor. Verifique sua internet e tente de novo.";
    // A API já devolve a espera em português ("Tente novamente em 12 minutos").
    if (error.status === 429) {
      return error.message || "Muitas tentativas. Aguarde um instante e tente novamente.";
    }
    if (context === "login" && error.status === 401) return "E-mail ou senha incorretos.";
    // Conta suspensa: a API já manda o texto certo, e não há o que reformular.
    if (context === "login" && error.status === 403) return error.message;
    if (context === "register" && error.status === 409) return "Já existe uma conta com esse e-mail.";
    // Cadastro pelo Google que demorou demais: a identidade precisa ser
    // reconfirmada, e a tela oferece o botão para recomeçar.
    if (context === "register" && error.status === 401) {
      return "Seu cadastro pelo Google expirou. Entre com o Google de novo para continuar.";
    }
    // Link vencido ou já usado: a mensagem da API é a certa.
    if ((context === "reset" || context === "verify") && error.status === 400) {
      return error.message;
    }
  }
  return FALLBACK[context];
}
