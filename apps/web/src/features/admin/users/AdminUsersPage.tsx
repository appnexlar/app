import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { AdminUsersPage as UsersPage } from "@nexlar/shared";
import { USER_LIST_STATUS_FILTERS } from "@nexlar/shared";
import { Button } from "../../../components/ui/Button";
import { Pagination } from "../../../components/ui/Pagination";
import { SearchField } from "../../../components/ui/SearchField";
import { Select } from "../../../components/ui/Select";
import { Spinner } from "../../../components/ui/Spinner";
import { useDebounced } from "../../../lib/useDebounced";
import { adminHttp } from "../api/http";
import { StatusDaConta, dataCurta } from "./status";

const FILTROS_DE_STATUS = [
  { value: "todos", label: "Todos os status" },
  { value: "ativo", label: "Ativas" },
  { value: "pendente_verificacao", label: "Pendentes de verificação" },
  { value: "suspenso", label: "Suspensas" },
  { value: "bloqueado", label: "Bloqueadas" },
  { value: "desativado", label: "Desativadas" },
];

/**
 * Lista de contas de corretor (Tasks 11 a 13 da épica). Busca ao vivo com
 * debounce, filtro de status (incluindo o derivado "pendente"), paginação
 * no servidor. A linha inteira leva ao perfil administrativo.
 */
export function AdminUsersPage() {
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const buscaEstavel = useDebounced(busca.trim());

  // O status mora na URL porque outras telas apontam para um recorte pronto
  // (os alertas do dashboard fazem isso). Valor estranho na barra de endereço
  // cai em "todos" em vez de virar uma requisição inválida.
  const [searchParams, setSearchParams] = useSearchParams();
  const statusDaUrl = searchParams.get("status") ?? "todos";
  const status = (USER_LIST_STATUS_FILTERS as readonly string[]).includes(statusDaUrl)
    ? statusDaUrl
    : "todos";

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["admin", "users", { busca: buscaEstavel, status, pagina }],
    queryFn: () => {
      const params = new URLSearchParams({ pagina: String(pagina), status });
      if (buscaEstavel) params.set("busca", buscaEstavel);
      return adminHttp.get<UsersPage>(`/users?${params.toString()}`);
    },
    placeholderData: (anterior) => anterior,
  });

  function aoFiltrar(novo: { busca?: string; status?: string }) {
    if (novo.busca !== undefined) setBusca(novo.busca);
    if (novo.status !== undefined) {
      // replace: trocar de filtro não empilha histórico, senão o botão voltar
      // percorre cada clique em vez de sair da tela.
      setSearchParams(novo.status === "todos" ? {} : { status: novo.status }, { replace: true });
    }
    // Filtro novo recomeça da primeira página, senão a pessoa cai numa
    // página que não existe mais no recorte novo.
    setPagina(1);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8">
        <h1 className="text-h1 text-text">Usuários</h1>
        <p className="mt-2 text-body text-text-muted">
          Todas as contas de corretor da plataforma.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="min-w-64 flex-1">
          <SearchField
            label="Buscar por nome, e-mail ou telefone"
            placeholder="Nome, e-mail ou telefone"
            value={busca}
            onChange={(valor) => aoFiltrar({ busca: valor })}
          />
        </div>
        <Select
          label="Status"
          hideLabel
          value={status}
          onValueChange={(valor) => aoFiltrar({ status: valor })}
          options={FILTROS_DE_STATUS}
        />
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}

      {isError && (
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-body text-text">Não foi possível carregar as contas.</p>
          <div className="mt-4 flex justify-center">
            <Button type="button" variant="ghost" onClick={() => void refetch()}>
              Tentar de novo
            </Button>
          </div>
        </div>
      )}

      {data && data.items.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
          <p className="text-body text-text">Nenhuma conta com esse recorte.</p>
          <p className="mt-1 text-caption text-text-subtle">
            Ajuste a busca ou o filtro de status.
          </p>
        </div>
      )}

      {data && data.items.length > 0 && (
        <>
          <div
            className={`overflow-x-auto rounded-xl border border-border bg-surface ${
              isFetching ? "opacity-70" : ""
            }`}
          >
            <table className="w-full min-w-[760px] text-left text-[14px]">
              <thead>
                <tr className="border-b border-border text-caption text-text-subtle">
                  <th className="px-4 py-3 font-medium">Conta</th>
                  <th className="px-4 py-3 font-medium">Telefone</th>
                  <th className="px-4 py-3 font-medium">Imobiliária</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Cadastro</th>
                  <th className="px-4 py-3 font-medium">Último acesso</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((conta) => (
                  <tr key={conta.id} className="border-b border-border last:border-b-0 hover:bg-bg">
                    <td className="px-4 py-3">
                      <Link to={`/admin/usuarios/${conta.id}`} className="block">
                        <p className="font-medium text-text">{conta.fullName}</p>
                        <p className="text-caption text-text-subtle">{conta.email}</p>
                      </Link>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-text-muted">
                      {conta.phone ?? "Não informado"}
                    </td>
                    <td className="px-4 py-3 text-text-muted">{conta.agencyName ?? "Autônomo"}</td>
                    <td className="px-4 py-3">
                      <StatusDaConta status={conta.status} emailVerified={conta.emailVerified} />
                    </td>
                    <td className="px-4 py-3 tabular-nums text-text-muted">
                      {dataCurta.format(new Date(conta.createdAt))}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-text-muted">
                      {conta.lastLoginAt ? dataCurta.format(new Date(conta.lastLoginAt)) : "Nunca"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6 flex items-center justify-between gap-4">
            <p className="text-caption text-text-subtle tabular-nums">
              {data.total} conta{data.total === 1 ? "" : "s"}
            </p>
            <Pagination
              page={data.pagina}
              totalPages={Math.max(1, Math.ceil(data.total / data.porPagina))}
              onChange={setPagina}
            />
          </div>
        </>
      )}
    </div>
  );
}
