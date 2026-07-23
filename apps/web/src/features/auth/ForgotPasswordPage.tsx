import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { forgotPasswordSchema, type ForgotPasswordDto } from "@nexlar/shared";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/ui/TextField";
import { Banner } from "../../components/ui/Banner";
import { AuthLayout } from "./AuthLayout";
import { BackToLogin } from "./BackToLogin";
import { authErrorMessage, forgotPassword } from "./api";

export function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordDto>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const mutation = useMutation({ mutationFn: forgotPassword });

  // A confirmação só aparece depois que a API responde. A resposta é a mesma
  // exista ou não a conta, então esperar não revela nada, e evita prometer um
  // e-mail que não saiu (limite de tentativas, API fora do ar).
  const onSubmit = (data: ForgotPasswordDto) => {
    mutation.mutate(data, { onSuccess: () => setSentTo(data.email) });
  };

  const errorMessage = authErrorMessage(mutation.error, "forgot");

  if (sentTo) {
    return (
      <AuthLayout>
        <div className="flex flex-col">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-soft">
            <svg className="h-6 w-6 text-[var(--success-fg)]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="mt-5 text-h1 text-text">Confira seu e-mail</h1>
          <p className="mt-2 text-body text-text-muted">
            Se houver uma conta para <span className="font-semibold text-text">{sentTo}</span>,
            enviamos um link para redefinir a senha. Verifique a caixa de entrada
            e também o spam.
          </p>

          {errorMessage && (
            <div className="mt-5">
              <Banner variant="danger">{errorMessage}</Banner>
            </div>
          )}
          {resent && !errorMessage && (
            <div className="mt-5">
              <Banner variant="success">Link reenviado. Confira a caixa de entrada.</Banner>
            </div>
          )}

          <div className="mt-8 flex flex-col gap-3">
            <Link to="/login" className="w-full">
              <Button variant="accent" fullWidth type="button">
                Voltar para entrar
              </Button>
            </Link>
            <button
              type="button"
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate(
                  { email: sentTo },
                  { onSuccess: () => setResent(true) },
                )
              }
              className="text-body-sm text-text-muted transition-colors hover:text-text disabled:opacity-60"
            >
              {mutation.isPending ? (
                "Reenviando..."
              ) : (
                <>
                  Não recebeu? <span className="font-semibold text-accent">Reenviar link</span>
                </>
              )}
            </button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <BackToLogin />

      <header className="mb-8">
        <h1 className="text-h1 text-text">Recuperar senha</h1>
        <p className="mt-1.5 text-body text-text-muted">
          Informe seu e-mail e enviaremos um link para você criar uma nova senha.
        </p>
      </header>

      {errorMessage && (
        <div className="mb-5">
          <Banner variant="danger">{errorMessage}</Banner>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
        <TextField
          label="E-mail"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="voce@imobiliaria.com.br"
          autoFocus
          error={errors.email?.message}
          {...register("email")}
        />

        <Button type="submit" variant="accent" fullWidth loading={mutation.isPending}>
          Enviar link
        </Button>
      </form>

      <p className="mt-7 text-center text-body-sm text-text-muted">
        Lembrou a senha?{" "}
        <Link to="/login" className="font-semibold text-accent transition-colors hover:text-accent-hover">
          Entrar
        </Link>
      </p>
    </AuthLayout>
  );
}
