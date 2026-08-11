import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AdminAuditActorOption, AdminAuditPage as AuditPage } from "@nexlar/shared";
import { ADMIN_AUDIT_ACTION_LIST, rotuloDaAcao } from "@nexlar/shared";
import { Button } from "../../../components/ui/Button";
import { Pagination } from "../../../components/ui/Pagination";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { Select } from "../../../components/ui/Select";
import { Spinner } from "../../../components/ui/Spinner";
import { adminHttp } from "../api/http";
import { AuditTimeline } from "./AuditTimeline";

/**
 * Tela de auditoria (docs/10, Fase 5). Somente leitura, por desenho: não
 * existe botão para editar nem para apagar uma linha, e nem endpoint por
 * trás. Auditoria que se apaga não serve para auditar ninguém.
 */

const JANELAS = [
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "tudo", label: "Tudo" },
];

export function AdminAuditPage() {
  const [janela, setJanela] = useState("30");
  const [ator, setAtor] = useState("");
  const [acao, setAcao] = useState("");
  const [pagina, setPagina] = useState(1);

  const { data: atores } = useQuery({
    queryKey: ["admin", "audit", "actors"],
    queryFn: () => adminHttp.get<AdminAuditActorOption[]>("/audit/actors"),
    staleTime: 5 * 60 * 1000,
  });

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["admin", "audit", { janela, ator, acao, pagina }],
    queryFn: () => {
      const params = new URLSearchParams({ pagina: String(pagina) });
      if (ator) params.set("ator", ator);
      if (acao) params.set("acao", acao);
      if (janela !== "tudo") {
        const de = new Date(Date.now() - Number(janela) * 86_400_000);
        params.set("de", de.toISOString());
      }
      return adminHttp.get<AuditPage>(`/audit?${params.toString()}`);
    },
    placeholderData: (anterior) => anterior,
  });

  function aoFiltrar(mudar: () => void) {
    mudar();
    // Recorte novo recomeça da primeira página, senão a pessoa cai numa
    // página que não existe mais no recorte novo.
    setPagina(1);
  }

  const filtrando = Boolean(ator || acao) || janela !== "30";

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-8">
        <h1 className="text-h1 text-text">Auditoria</h1>
        <p className="mt-2 text-body text-text-muted">
          Tudo que a equipe fez no painel, na ordem em que aconteceu. O registro é permanente e
          sobrevive à exclusão da conta afetada.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <SegmentedControl
          label="Período da trilha"
          value={janela}
          onChange={(v) => aoFiltrar(() => setJanela(v))}
          options={JANELAS}
        />
        {/* min-w com flex-1: no celular os dois ficam do mesmo tamanho em
            vez de cada um seguir o texto da opção escolhida. */}
        <Select
          className="min-w-40 flex-1 sm:max-w-52"
          label="Quem fez"
          value={ator}
          onValueChange={(v) => aoFiltrar(() => setAtor(v))}
          options={[
            { value: "", label: "Qualquer pessoa" },
            ...(atores ?? []).map((a) => ({ value: a.id, label: a.fullName })),
          ]}
        />
        <Select
          className="min-w-40 flex-1 sm:max-w-52"
          label="O que aconteceu"
          value={acao}
          onValueChange={(v) => aoFiltrar(() => setAcao(v))}
          options={[
            { value: "", label: "Qualquer ação" },
            ...ADMIN_AUDIT_ACTION_LIST.map((a) => ({ value: a, label: rotuloDaAcao(a) })),
          ]}
        />
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}

      {isError && (
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-body text-text">Não foi possível carregar a trilha.</p>
          <div className="mt-4 flex justify-center">
            <Button type="button" variant="ghost" onClick={() => void refetch()}>
              Tentar de novo
            </Button>
          </div>
        </div>
      )}

      {data && data.items.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
          <p className="text-body text-text">
            {filtrando ? "Nada neste recorte." : "Nenhuma ação registrada ainda."}
          </p>
          <p className="mt-1 text-caption text-text-subtle">
            {filtrando
              ? "Amplie o período ou limpe os filtros."
              : "Assim que alguém agir sobre uma conta, a ação aparece aqui."}
          </p>
          {filtrando && (
            <div className="mt-4 flex justify-center">
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  aoFiltrar(() => {
                    setAtor("");
                    setAcao("");
                    setJanela("tudo");
                  })
                }
              >
                Limpar filtros
              </Button>
            </div>
          )}
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className={isFetching ? "opacity-70" : ""}>
          <AuditTimeline items={data.items} />
          <div className="mt-6 flex items-center justify-between gap-4">
            <p className="text-caption tabular-nums text-text-subtle">
              {data.total} {data.total === 1 ? "registro" : "registros"}
            </p>
            <Pagination
              page={data.pagina}
              totalPages={Math.max(1, Math.ceil(data.total / data.porPagina))}
              onChange={setPagina}
            />
          </div>
        </div>
      )}
    </div>
  );
}
