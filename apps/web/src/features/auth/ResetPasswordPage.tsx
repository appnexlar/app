import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { resetPasswordSchema } from "@nexlar/shared";
import { Button } from "../../components/ui/Button";
import { PasswordField } from "../../components/ui/PasswordField";
import { Banner } from "../../components/ui/Banner";
import { AuthLayout } from "./AuthLayout";
import { BackToLogin } from "./BackToLogin";
import { authErrorMessage, resetPassword } from "./api";

// Reusa a regra de senha do schema compartilhado e acrescenta a confirmação.
const resetFormSchema = z
  .object({
    password: resetPasswordSchema.shape.password,
    confirmPassword: z.string().min(1, "Confirme a nova senha"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });

type ResetFormValues = z.infer<typeof resetFormSchema>;

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetFormValues>({
    resolver: zodResolver(resetFormSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const mutation = useMutation({ mutationFn: resetPassword });

  // A tela de sucesso só aparece se a API confirmar. Link vencido ou já usado
  // volta como erro, em vez de dizer que a senha mudou quando não mudou.
  const onSubmit = (data: ResetFormValues) => {
    if (!token) return;
    mutation.mutate({ token, password: data.password }, { onSuccess: () => setDone(true) });
  };

  // Link aberto sem token: não dá para redefinir.
  if (!token) {
    return (
      <AuthLayout>
        <BackToLogin />
        <div className="flex flex-col">
          <h1 className="text-h1 text-text">Link inválido</h1>
          <p className="mt-2 text-body text-text-muted">
            Este link de redefinição está incompleto ou expirou. Peça um novo
            para continuar.
          </p>
          <Link to="/recuperar-senha" className="mt-8 w-full">
            <Button variant="accent" fullWidth type="button">
              Pedir novo link
            </Button>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout>
        <div className="flex flex-col">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-soft">
            <svg className="h-6 w-6 text-[var(--success-fg)]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="mt-5 text-h1 text-text">Senha redefinida</h1>
          <p className="mt-2 text-body text-text-muted">
            Tudo certo! Agora é só entrar com sua nova senha.
          </p>
          <Link to="/login" className="mt-8 w-full">
            <Button variant="accent" fullWidth type="button">
              Ir para entrar
            </Button>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  const bannerMessage = authErrorMessage(mutation.error, "reset");

  return (
    <AuthLayout>
      <BackToLogin />

      <header className="mb-8">
        <h1 className="text-h1 text-text">Criar nova senha</h1>
        <p className="mt-1.5 text-body text-text-muted">
          Escolha uma senha nova para sua conta.
        </p>
      </header>

      {bannerMessage && (
        <div className="mb-5">
          <Banner variant="danger">{bannerMessage}</Banner>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
        <PasswordField
          label="Nova senha"
          autoComplete="new-password"
          placeholder="Crie uma senha"
          hint="Mínimo de 8 caracteres, com ao menos uma letra e um número."
          autoFocus
          error={errors.password?.message}
          {...register("password")}
        />

        <PasswordField
          label="Confirmar nova senha"
          autoComplete="new-password"
          placeholder="Repita a senha"
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />

        <Button type="submit" variant="accent" fullWidth loading={mutation.isPending} className="mt-1">
          Salvar nova senha
        </Button>
      </form>
    </AuthLayout>
  );
}
