import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Banner } from "../../components/ui/Banner";
import { AuthLayout } from "./AuthLayout";
import { useAuth } from "./AuthContext";

/**
 * Gate de confirmação de e-mail. O corretor entra aqui logo após o cadastro e
 * só acessa o Dashboard depois de confirmar.
 *
 * TODO(backend): o envio e a verificação reais dependem do endpoint de
 * confirmação (token por e-mail). Enquanto isso, o botão "Já confirmei" simula
 * a confirmação para permitir testar a jornada.
 */
export function ConfirmEmailPage() {
  const { broker, confirmEmail, signOut } = useAuth();
  const navigate = useNavigate();
  const [resent, setResent] = useState(false);

  const proceed = () => {
    confirmEmail();
    navigate("/dashboard", { replace: true });
  };

  return (
    <AuthLayout>
      <div className="flex flex-col">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft shadow-xs">
          <svg className="h-7 w-7 text-accent" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="M4 7l8 6 8-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h1 className="mt-5 text-h1 text-text">Confirme seu e-mail</h1>
        <p className="mt-2 text-body text-text-muted">
          Enviamos um link de confirmação para{" "}
          <span className="font-semibold text-text">{broker?.email}</span>. Abra o
          e-mail e clique no link para ativar sua conta.
        </p>

        {resent && (
          <div className="mt-5">
            <Banner variant="info">Enviamos o link novamente. Verifique também o spam.</Banner>
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setResent(true)}
            className="text-body-sm text-text-muted transition-colors hover:text-text"
          >
            Não recebeu? <span className="font-semibold text-accent">Reenviar link</span>
          </button>
        </div>

        {/* Bloco temporário: some quando a confirmação real por e-mail existir. */}
        <div className="mt-8 rounded-lg border border-dashed border-border-strong bg-surface-sunken p-4">
          <p className="text-caption font-semibold uppercase tracking-wide text-text-subtle">
            Modo demonstração
          </p>
          <p className="mt-1 text-body-sm text-text-muted">
            O envio real de e-mail ainda não está ligado. Use o botão abaixo para
            simular a confirmação e continuar testando a jornada.
          </p>
          <Button variant="accent" type="button" fullWidth className="mt-3" onClick={proceed}>
            Já confirmei meu e-mail
          </Button>
        </div>

        <button
          type="button"
          onClick={signOut}
          className="mt-6 text-center text-body-sm font-semibold text-text-muted transition-colors hover:text-text"
        >
          Sair
        </button>
      </div>
    </AuthLayout>
  );
}
