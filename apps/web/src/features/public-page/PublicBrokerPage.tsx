import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BrokerStorefront } from "./BrokerStorefront";
import { fetchPublicBrokerPage } from "./publicApi";

/**
 * Rota pública /corretor/:slug. Três destinos possíveis: a vitrine, a página
 * indisponível (sem expor o motivo) e o esqueleto enquanto carrega. Erro de
 * rede cai em indisponível com ação de tentar de novo.
 */
export function PublicBrokerPage() {
  const { slug = "" } = useParams();

  const consulta = useQuery({
    queryKey: ["vitrine", slug],
    queryFn: () => fetchPublicBrokerPage(slug),
    staleTime: 60_000,
    retry: 1,
  });

  if (consulta.isLoading) return <Esqueleto />;

  if (consulta.isError) {
    return <Indisponivel onRetry={() => consulta.refetch()} erroDeRede />;
  }

  const dados = consulta.data;
  if (!dados?.available || !dados.page) return <Indisponivel />;

  return <BrokerStorefront page={dados.page} />;
}

/**
 * Espelha a estrutura real: faixa escura no topo e a grade de cards abaixo,
 * para a página não "pular" quando os dados chegam.
 */
function Esqueleto() {
  return (
    <div className="min-h-dvh bg-bg" aria-busy="true">
      <div className="bg-primary px-5 pb-14 pt-16 sm:px-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-5 sm:flex-row sm:items-center sm:gap-10">
          <div className="h-28 w-28 flex-none animate-pulse rounded-2xl bg-white/10 sm:h-40 sm:w-40" />
          <div className="flex flex-col gap-3">
            <div className="h-10 w-56 animate-pulse rounded-md bg-white/10" />
            <div className="h-4 w-72 animate-pulse rounded-sm bg-white/10" />
          </div>
        </div>
      </div>
      <div className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-6 px-5 sm:grid-cols-2 sm:px-8">
        <div className="h-72 animate-pulse rounded-xl bg-surface-sunken" />
        <div className="hidden h-72 animate-pulse rounded-xl bg-surface-sunken sm:block" />
      </div>
    </div>
  );
}

/**
 * Página fechada, pausada ou endereço errado: para o visitante é tudo o
 * mesmo aviso educado. O motivo real é assunto do corretor.
 */
function Indisponivel({ onRetry, erroDeRede = false }: { onRetry?: () => void; erroDeRede?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-6 text-center font-sans">
      <span className="text-h3 font-extrabold tracking-tight text-text-muted">
        ne<span className="text-accent">x</span>tlar
      </span>
      <h1 className="mt-6 text-h1 text-text">
        {erroDeRede ? "Não conseguimos carregar a página" : "Esta página não está disponível"}
      </h1>
      <p className="mt-2 max-w-sm text-body text-text-muted">
        {erroDeRede
          ? "Verifique sua conexão e tente de novo."
          : "O endereço pode ter mudado ou a página pode ter sido pausada pelo corretor."}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 min-h-12 rounded-md bg-accent px-6 text-body font-bold text-accent-on transition-colors duration-fast hover:bg-accent-hover"
        >
          Tentar de novo
        </button>
      )}
    </div>
  );
}
