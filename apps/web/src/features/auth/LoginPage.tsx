import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, Mail } from "lucide-react";
import { loginSchema, type LoginDto } from "@nexlar/shared";
import { useAuth } from "./AuthContext";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/ui/TextField";
import { PasswordField } from "../../components/ui/PasswordField";
import { AuthOptionButton, GoogleMark } from "../../components/ui/AuthOptionButton";
import { Banner } from "../../components/ui/Banner";
import { AuthLayout, OrDivider } from "./AuthLayout";
import { useAuthProviders, useGoogleAuth } from "./useGoogleAuth";
import { authErrorMessage, login } from "./api";

/**
 * Entrar.
 *
 * Duas escolhas, na mesma caixa e do mesmo tamanho: Google e e-mail. O Google
 * vem primeiro e com peso visual maior porque é o caminho que queremos, mas o
 * e-mail continua sendo um botão de verdade, e não um link escondido: quem tem
 * conta antiga precisa ver a saída na primeira olhada, sem procurar.
 *
 * Escolher o e-mail troca as duas opções pelo formulário, em vez de empurrá-lo
 * para baixo. Assim a tela nunca mostra dois caminhos abertos ao mesmo tempo,
 * que é o que faz a pessoa parar para decidir de novo.
 */
export function LoginPage() {
  const { startGoogleAuth, saindo } = useGoogleAuth();
  const { google: temGoogle, pronto } = useAuthProviders();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [comEmail, setComEmail] = useState(false);
  // Enquanto a resposta não chega, o botão fica desabilitado: errar para o
  // lado de bloquear evita o clique que cairia em 404 na janela de carga.
  const googleIndisponivel = !temGoogle;

  const sessionExpired = searchParams.get("sessao") === "expirada";
  // Suspensão descoberta no meio do uso: o corretor foi trazido para cá e
  // precisa entender por que, senão vai achar que é bug e tentar de novo.
  const contaSuspensa = searchParams.get("conta") === "suspensa";
  const erroDeRetorno = mensagemDeRetorno(searchParams.get("erro"));

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

  // Um aviso por vez, do mais grave para o mais banal. Empilhar banner assusta
  // sem informar melhor.
  const aviso = contaSuspensa
    ? { variante: "danger" as const, texto: SUSPENSA }
    : bannerMessage
      ? { variante: "danger" as const, texto: bannerMessage }
      : erroDeRetorno
        ? erroDeRetorno
        : sessionExpired
          ? {
              variante: "info" as const,
              texto: "Sua sessão expirou. Entre novamente para continuar.",
            }
          : null;

  return (
    <AuthLayout legal={!comEmail}>
      {/* Centrado na escolha, alinhado à esquerda no formulário: título
          centralizado sobre campos de formulário desalinha a leitura. */}
      <header className={comEmail ? "mb-8" : "mb-8 text-center"}>
        <h1 className="text-h1 text-text">
          {/* Sem gênero na saudação. "Bem-vindo(a)" resolvia por remendo, e
              parêntese no meio de uma boas-vindas soa a formulário. */}
          {comEmail ? "Entrar com e-mail" : "Que bom ver você por aqui"}
        </h1>
        <p className="mt-2 text-body text-text-muted">
          {comEmail
            ? "Use o e-mail e a senha da sua conta."
            : "Entre e continue de onde parou."}
        </p>
      </header>

      {aviso && (
        <div className="mb-6">
          <Banner variant={aviso.variante}>{aviso.texto}</Banner>
        </div>
      )}

      {!comEmail ? (
        <>
          <div className="flex flex-col gap-4">
            <AuthOptionButton
              label="Continuar com o Google"
              icon={<GoogleMark />}
              loading={saindo}
              disabled={googleIndisponivel}
              onClick={startGoogleAuth}
            />

            <OrDivider />

            <AuthOptionButton
              label="Continuar com e-mail"
              icon={<Mail className="h-5 w-5" aria-hidden="true" />}
              peso="alternativo"
              onClick={() => setComEmail(true)}
            />
          </div>

          {/* Só depois da resposta: dizer "em breve" durante a carga seria
              informação errada por um instante. */}
          {pronto && googleIndisponivel && (
            <p className="mt-6 text-center text-caption leading-relaxed text-text-subtle">
              A entrada pelo Google chega em breve. Por enquanto, use seu e-mail
              e senha.
            </p>
          )}
        </>
      ) : (
        <>
          <form
            onSubmit={handleSubmit(mutation.mutate as (d: LoginDto) => void, clearApiError)}
            onChange={clearApiError}
            noValidate
            className="flex flex-col gap-6"
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

            <div className="flex flex-col gap-2">
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

            <Button type="submit" variant="accent" fullWidth loading={mutation.isPending}>
              {mutation.isPending ? "Entrando..." : "Entrar"}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => {
              setComEmail(false);
              clearApiError();
            }}
            className="mt-6 inline-flex min-h-[var(--tap-target-min)] w-full items-center justify-center gap-2 rounded-lg text-body-sm font-semibold text-text-muted transition-colors duration-fast hover:text-text focus-visible:shadow-focus"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Ver as outras formas de entrar
          </button>
        </>
      )}

      <p className="mt-10 text-center text-body-sm text-text-muted">
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

const SUSPENSA = "Esta conta está suspensa. Fale com o suporte do Nextlar para reativar.";

/**
 * Traduz o código que a API põe na URL ao voltar do Google. O servidor manda um
 * código curto de propósito: o motivo detalhado de uma falha de autenticação é
 * informação útil para quem está sondando, e fica no log.
 */
function mensagemDeRetorno(
  codigo: string | null,
): { variante: "danger" | "info"; texto: string } | null {
  switch (codigo) {
    case "cancelado":
      return {
        variante: "info",
        texto: "Você cancelou a entrada pelo Google. Pode tentar de novo quando quiser.",
      };
    case "google_email":
      return {
        variante: "danger",
        texto:
          "O Google não confirmou o e-mail dessa conta. Confirme o endereço no Google e tente de novo.",
      };
    case "suspensa":
      return { variante: "danger", texto: SUSPENSA };
    case "google":
      return {
        variante: "danger",
        texto: "Não foi possível concluir a entrada pelo Google. Tente novamente.",
      };
    default:
      return null;
  }
}
