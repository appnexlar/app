import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { PasswordField } from "../../components/ui/PasswordField";
import { TextField } from "../../components/ui/TextField";
import { ApiError } from "../../lib/http";
import { useAdminAuth } from "./AdminAuthContext";

/**
 * Entrada do Nexlar Admin. Sóbria de propósito: isto é uma porta de serviço,
 * não uma página de produto. O Google vem primeiro porque é a porta
 * preferida (a conta Google da equipe carrega 2FA e anti-phishing que senha
 * nossa não tem); e-mail e senha ficam como contingência. Sem criar conta:
 * no Admin, o Google autentica quem já existe, nunca cadastra.
 */

/** Mensagens dos códigos que o callback do Google devolve na URL. */
const ERROS_DO_RETORNO: Record<string, string> = {
  cancelado: "Você cancelou a entrada com o Google.",
  sem_acesso: "Esta conta Google não tem acesso ao Nexlar Admin.",
  google: "Não foi possível entrar com o Google. Tente novamente.",
};

export function AdminLoginPage() {
  const { admin, login } = useAdminAuth();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sending, setSending] = useState(false);
  const [googleDisponivel, setGoogleDisponivel] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    const codigo = params.get("erro");
    return codigo ? (ERROS_DO_RETORNO[codigo] ?? ERROS_DO_RETORNO.google) : null;
  });

  // O botão só aparece se o ambiente tiver a credencial do Google. Sem ela,
  // a rota responde 404 e mostrar o botão seria porta quebrada.
  useEffect(() => {
    let ativo = true;
    fetch("/api/admin/auth/providers")
      .then((res) => (res.ok ? res.json() : { google: false }))
      .then((data: { google: boolean }) => {
        if (ativo) setGoogleDisponivel(data.google);
      })
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, []);

  if (admin) return <Navigate to="/admin" replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setError(null);
    try {
      await login(email, password);
    } catch (erro) {
      setError(
        erro instanceof ApiError ? erro.message : "Não foi possível entrar. Tente novamente.",
      );
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--brand-navy-950)] px-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-8 shadow-lg">
        <header className="mb-6">
          <span className="text-[22px] font-bold tracking-tight text-[var(--brand-navy-900)]">
            nex<span className="text-accent">lar</span>
          </span>
          <h1 className="mt-4 text-h2 text-text">Administração da plataforma</h1>
          <p className="mt-2 text-body text-text-muted">Acesso restrito à equipe Nexlar.</p>
        </header>

        {error && (
          <p role="alert" className="mb-4 text-caption text-[var(--danger-fg)]">
            {error}
          </p>
        )}

        {googleDisponivel && (
          <>
            {/* Navegação de topo, não fetch: o fluxo OAuth é uma viagem da
                página inteira até o Google e de volta. */}
            <a
              href="/api/admin/auth/google"
              className="flex min-h-[var(--tap-target-min)] w-full items-center justify-center gap-3 rounded-md border border-border bg-surface px-[18px] text-[15px] font-semibold text-text transition-colors hover:bg-bg"
            >
              <GoogleIcon />
              Continuar com o Google
            </a>
            <div className="my-6 flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-border" />
              <span className="text-caption text-text-subtle">ou</span>
              <span className="h-px flex-1 bg-border" />
            </div>
          </>
        )}

        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <TextField
            label="E-mail"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <PasswordField
            label="Senha"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button type="submit" variant={googleDisponivel ? "ghost" : "accent"} loading={sending} fullWidth>
            Entrar com e-mail
          </Button>
        </form>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
