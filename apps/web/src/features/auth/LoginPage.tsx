import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { loginSchema, type LoginDto } from "@nexlar/shared";
import { useAuth } from "./AuthContext";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/ui/TextField";
import { PasswordField } from "../../components/ui/PasswordField";
import { GoogleButton } from "../../components/ui/GoogleButton";
import { Banner } from "../../components/ui/Banner";
import { AuthLayout, OrDivider } from "./AuthLayout";
import { useGoogleAuth } from "./useGoogleAuth";
import { authErrorMessage, login } from "./api";

export function LoginPage() {
  const { startGoogleAuth, pendingNotice } = useGoogleAuth();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionExpired = searchParams.get("sessao") === "expirada";

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginDto>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: (session) => {
      signIn(session);
      navigate("/dashboard", { replace: true });
    },
  });

  const bannerMessage = authErrorMessage(mutation.error, "login");

  const clearApiError = () => {
    if (mutation.error) mutation.reset();
  };

  return (
    <AuthLayout>
      <header className="mb-8">
        <h1 className="text-h1 text-text">Bem-vindo de volta</h1>
        <p className="mt-1.5 text-body text-text-muted">
          Entre para continuar de onde parou.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <GoogleButton label="Entrar com o Google" onClick={startGoogleAuth} />
        {pendingNotice && (
          <Banner variant="info">
            A entrada com Google fica pronta junto com a autenticação. Por
            enquanto, entre com seu e-mail.
          </Banner>
        )}
      </div>

      <OrDivider />

      {sessionExpired && !bannerMessage && (
        <div className="mb-5">
          <Banner variant="info">Sua sessão expirou. Entre novamente para continuar.</Banner>
        </div>
      )}

      {bannerMessage && (
        <div className="mb-5">
          <Banner variant="danger">{bannerMessage}</Banner>
        </div>
      )}

      <form
        onSubmit={handleSubmit(mutation.mutate as (d: LoginDto) => void, clearApiError)}
        onChange={clearApiError}
        noValidate
        className="flex flex-col gap-5"
      >
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

        <div className="flex flex-col gap-1.5">
          <PasswordField
            label="Senha"
            autoComplete="current-password"
            placeholder="Sua senha"
            error={errors.password?.message}
            {...register("password")}
          />
          <div className="flex justify-end">
            <Link
              to="/recuperar-senha"
              className="text-body-sm font-semibold text-accent transition-colors hover:text-accent-hover"
            >
              Esqueci minha senha
            </Link>
          </div>
        </div>

        <Button type="submit" variant="accent" fullWidth loading={mutation.isPending} className="mt-1">
          {mutation.isPending ? "Entrando..." : "Entrar"}
        </Button>
      </form>

      <p className="mt-7 text-center text-body-sm text-text-muted">
        Ainda não tem conta?{" "}
        <Link
          to="/criar-conta"
          className="font-semibold text-accent transition-colors hover:text-accent-hover"
        >
          Criar conta
        </Link>
      </p>
    </AuthLayout>
  );
}
