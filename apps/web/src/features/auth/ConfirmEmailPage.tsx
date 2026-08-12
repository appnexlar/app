import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Button } from "../../components/ui/Button";
import { Banner } from "../../components/ui/Banner";
import { AuthLayout } from "./AuthLayout";
import { useAuth } from "./AuthContext";
import { ApiError } from "../../lib/http";
import { authErrorMessage, resendVerification, verifyEmail } from "./api";

/**
 * Uma tela, dois papéis, porque é o mesmo endereço nos dois casos:
 *
 * 1. Com `?token=` na URL, veio do link do e-mail. Confirma sozinha, sem pedir
 *    nada, e pode acontecer num celular onde a pessoa nunca entrou.
 * 2. Sem token, é o gate: o corretor acabou de se cadastrar e está esperando
 *    o e-mail chegar.
 */
export function ConfirmEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  return token ? <ConfirmacaoPeloLink token={token} /> : <GateDeEspera />;
}

/**
 * Uma confirmação por token, e uma só, valha o que valer o ciclo de vida do
 * componente.
 *
 * O token é de uso único: a segunda chamada sempre volta 400, e a tela diria
 * "Link inválido" numa confirmação que acabou de dar certo. Guardar a promessa
 * fora do React resolve de uma vez, porque sobrevive ao remonte do modo
 * estrito e a qualquer re-render: a segunda tentativa recebe o mesmo resultado
 * da primeira, em vez de bater na API de novo. Um `useRef` não daria conta,
 * já que o remonte devolve um ref novo.
 */
const confirmacoesEmCurso = new Map<string, Promise<void>>();

function confirmarUmaVez(token: string): Promise<void> {
  const emCurso = confirmacoesEmCurso.get(token);
  if (emCurso) return emCurso;

  const promessa = verifyEmail({ token });
  confirmacoesEmCurso.set(token, promessa);
  return promessa;
}

// --- 1. Chegou pelo link do e-mail -----------------------------------------
function ConfirmacaoPeloLink({ token }: { token: string }) {
  const { isAuthenticated, recarregarConta } = useAuth();
  const navigate = useNavigate();

  const mutation = useMutation({ mutationFn: confirmarUmaVez });

  // A sessão deste navegador, se existir, precisa saber que o e-mail agora
  // está confirmado, senão o app devolveria a pessoa ao gate.
  //
  // Fica num efeito à parte de propósito. Dentro do onSuccess, o TanStack só
  // dá a mutação por concluída depois que a promessa devolvida ali resolve, e
  // uma renovação lenta ou emperrada deixava a tela em "Confirmando..." para
  // sempre, mesmo com a confirmação já gravada no servidor.
  useEffect(() => {
    if (mutation.isSuccess && isAuthenticated) void recarregarConta();
  }, [mutation.isSuccess, isAuthenticated, recarregarConta]);

  // Confirma na hora que a tela abre. Sem botão: quem clicou no link do
  // e-mail já disse o que queria, pedir de novo seria burocracia. Chamar duas
  // vezes é inofensivo, porque confirmarUmaVez reaproveita a mesma promessa.
  useEffect(() => {
    mutation.mutate(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (mutation.isPending || mutation.isIdle) {
    return (
      <AuthLayout>
        <div role="status" className="flex flex-col items-center py-10 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
          <p className="mt-4 text-body text-text-muted">Confirmando seu e-mail...</p>
        </div>
      </AuthLayout>
    );
  }

  if (mutation.isError) {
    // "Link inválido" só quando o link é realmente o problema (400). Excesso
    // de tentativas, queda de rede e erro do servidor não são culpa do link, e
    // dizer que é manda a pessoa pedir outro à toa.
    const linkRuim = mutation.error instanceof ApiError && mutation.error.status === 400;
    return (
      <AuthLayout>
        <div className="flex flex-col">
          <h1 className="text-h1 text-text">
            {linkRuim ? "Link inválido" : "Não foi possível confirmar"}
          </h1>
          <p className="mt-2 text-body text-text-muted">
            {authErrorMessage(mutation.error, "verify")}
          </p>
          {linkRuim ? (
            <Link to={isAuthenticated ? "/confirmar-email" : "/login"} className="mt-8 w-full">
              <Button variant="accent" fullWidth type="button">
                {isAuthenticated ? "Pedir novo link" : "Ir para entrar"}
              </Button>
            </Link>
          ) : (
            // O link ainda vale: recarregar tenta de novo com ele mesmo.
            <Button
              variant="accent"
              fullWidth
              type="button"
              className="mt-8"
              onClick={() => window.location.reload()}
            >
              Tentar de novo
            </Button>
          )}
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="flex flex-col">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-soft">
          <svg className="h-6 w-6 text-[var(--success-fg)]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="mt-5 text-h1 text-text">E-mail confirmado</h1>
        <p className="mt-2 text-body text-text-muted">
          Sua conta está pronta. Agora é só começar a organizar seus atendimentos.
        </p>
        <Button
          variant="accent"
          fullWidth
          type="button"
          className="mt-8"
          onClick={() => navigate(isAuthenticated ? "/dashboard" : "/login", { replace: true })}
        >
          {isAuthenticated ? "Ir para o Nextlar" : "Entrar"}
        </Button>
      </div>
    </AuthLayout>
  );
}

// --- 2. Esperando o e-mail chegar ------------------------------------------
function GateDeEspera() {
  const { broker, isAuthenticated, emailVerified, recarregarConta, signOut } = useAuth();
  const navigate = useNavigate();
  const [conferindo, setConferindo] = useState(false);
  const [aindaNaoConfirmado, setAindaNaoConfirmado] = useState(false);

  const reenvio = useMutation({ mutationFn: resendVerification });

  // Confirmar no celular e voltar para o computador é o caminho mais comum,
  // então a tela se pergunta sozinha, de tempos em tempos, se já deu certo.
  useEffect(() => {
    if (!isAuthenticated || emailVerified) return;
    const id = setInterval(() => {
      void recarregarConta().then((ok) => {
        if (ok) navigate("/dashboard", { replace: true });
      });
    }, 15_000);
    return () => clearInterval(id);
  }, [isAuthenticated, emailVerified, recarregarConta, navigate]);

  // A rota é livre, então o desvio mora aqui, depois dos hooks: sem sessão não
  // há o que esperar, e com o e-mail já confirmado esta tela não tem razão de
  // existir.
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (emailVerified) return <Navigate to="/dashboard" replace />;

  const conferirAgora = async () => {
    setConferindo(true);
    setAindaNaoConfirmado(false);
    const ok = await recarregarConta();
    setConferindo(false);
    if (ok) navigate("/dashboard", { replace: true });
    else setAindaNaoConfirmado(true);
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

        {reenvio.isSuccess && !reenvio.isPending && (
          <div className="mt-5">
            <Banner variant="success">
              Enviamos o link novamente. Verifique também o spam. O link anterior deixou de valer.
            </Banner>
          </div>
        )}
        {reenvio.isError && (
          <div className="mt-5">
            <Banner variant="danger">{authErrorMessage(reenvio.error, "verify")}</Banner>
          </div>
        )}
        {aindaNaoConfirmado && (
          <div className="mt-5">
            <Banner variant="info">
              Ainda não recebemos a confirmação. Abra o link do e-mail e volte aqui.
            </Banner>
          </div>
        )}

        <div className="mt-8 flex flex-col gap-4">
          <Button
            variant="accent"
            fullWidth
            type="button"
            loading={conferindo}
            onClick={() => void conferirAgora()}
          >
            Já confirmei, continuar
          </Button>

          <button
            type="button"
            disabled={reenvio.isPending || !broker?.email}
            onClick={() => broker?.email && reenvio.mutate({ email: broker.email })}
            className="text-body-sm text-text-muted transition-colors hover:text-text disabled:opacity-60"
          >
            {reenvio.isPending ? (
              "Reenviando..."
            ) : (
              <>
                Não recebeu? <span className="font-semibold text-accent">Reenviar link</span>
              </>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-8 text-center text-body-sm font-semibold text-text-muted transition-colors hover:text-text"
        >
          Sair
        </button>
      </div>
    </AuthLayout>
  );
}
