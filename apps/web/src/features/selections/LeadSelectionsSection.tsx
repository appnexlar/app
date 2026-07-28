import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { SelectionSummary } from "@nexlar/shared";
import { Button } from "../../components/ui/Button";
import { Banner } from "../../components/ui/Banner";
import { selectionPath } from "../../lib/routes";
import { createSelection, fetchLeadSelections } from "./api";
import { SELECTION_STATUS_LABELS, SELECTION_STATUS_TONE_CLASS } from "./labels";

interface LeadSelectionsSectionProps {
  leadId: string;
  /** Código curto da lead: é ele que vai para a URL do montador. */
  leadCode: number;
}

const dataCurta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });

/**
 * Seleções de imóveis na ficha da lead. A entrada principal da jornada:
 * daqui o corretor cria a curadoria e acompanha o que a lead respondeu.
 */
export function LeadSelectionsSection({ leadId, leadCode }: LeadSelectionsSectionProps) {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["lead-selections", leadId],
    queryFn: () => fetchLeadSelections(leadId),
  });

  const create = useMutation({
    mutationFn: () => createSelection(leadId),
    onSuccess: (selection) => navigate(selectionPath(leadCode, selection.code)),
  });

  const selections = query.data ?? [];

  return (
    <section className="animate-rise rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-label uppercase tracking-wide text-text-subtle">Seleções de imóveis</h2>
        <Button
          type="button"
          variant="ghost"
          className="-my-1 shrink-0"
          loading={create.isPending}
          onClick={() => create.mutate()}
        >
          + Criar seleção
        </Button>
      </div>

      {create.isError && (
        <Banner variant="danger">Não foi possível criar a seleção agora. Tente novamente.</Banner>
      )}

      {query.isPending ? (
        <div className="mt-3 h-14 animate-pulse rounded-xl bg-surface-sunken" />
      ) : query.isError ? (
        <p className="mt-3 text-body-sm text-text-muted">
          Não foi possível carregar as seleções.{" "}
          <button type="button" className="font-semibold text-accent" onClick={() => query.refetch()}>
            Tentar novamente
          </button>
        </p>
      ) : selections.length === 0 ? (
        <p className="mt-3 text-body-sm text-text-muted">
          Monte uma seleção com os imóveis certos para esta lead e envie um link exclusivo. As
          respostas dela aparecem aqui.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-border">
          {selections.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => navigate(selectionPath(leadCode, s.code))}
                className="flex w-full items-center gap-3 py-3 text-left transition-colors duration-fast hover:bg-surface-sunken sm:rounded-lg sm:px-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-body-sm font-semibold text-text">
                    {s.itemCount === 1 ? "1 imóvel" : `${s.itemCount} imóveis`}
                    <span className="font-normal text-text-subtle">
                      {" "}
                      · {dataCurta.format(new Date(s.createdAt))}
                    </span>
                  </p>
                  <p className="mt-0.5 truncate text-caption text-text-muted">{resumo(s)}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-caption font-semibold ${SELECTION_STATUS_TONE_CLASS[s.status]}`}
                >
                  {SELECTION_STATUS_LABELS[s.status]}
                </span>
                <svg className="h-4 w-4 shrink-0 text-text-subtle" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Uma linha honesta sobre o andamento: aberturas e respostas, sem enfeite. */
function resumo(s: SelectionSummary): string {
  if (s.status === "rascunho") return "Rascunho: continue a montagem e ative para enviar";
  const partes: string[] = [];
  partes.push(s.viewCount > 0 ? `${s.viewCount} ${s.viewCount === 1 ? "visualização" : "visualizações"}` : "Ainda não visualizada");
  if (s.likedCount > 0) partes.push(`${s.likedCount} gostou`);
  if (s.dismissedCount > 0) partes.push(`${s.dismissedCount} descartou`);
  if (s.visitRequestedCount > 0) partes.push(`${s.visitRequestedCount} quer visitar`);
  return partes.join(" · ");
}
