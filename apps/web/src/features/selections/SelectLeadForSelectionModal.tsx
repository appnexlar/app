import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { LeadSummary } from "@nexlar/shared";
import { Modal } from "../../components/ui/Modal";
import { Banner } from "../../components/ui/Banner";
import { SearchField } from "../../components/ui/SearchField";
import { initials } from "../../lib/name";
import { selectionPath } from "../../lib/routes";
import { fetchLeads } from "../leads/api";
import {
  STATUS_LABELS as LEAD_STATUS_LABELS,
  STATUS_TONE,
  STATUS_TONE_CLASS,
  displayWhatsapp,
} from "../leads/labels";
import { createSelection } from "./api";

/**
 * Fecha o fluxo que nasce na carteira: o corretor marcou imóveis em /imoveis
 * e agora escolhe PARA QUEM vai a seleção. Um toque na lead cria o rascunho
 * já com os imóveis e cai no montador, onde ele organiza e ativa. Nada é
 * enviado aqui: quem decide o envio continua sendo o corretor, no montador.
 */
export function SelectLeadForSelectionModal({
  propertyIds,
  onClose,
}: {
  /** Imóveis marcados, na ordem em que o corretor escolheu. Null = fechado. */
  propertyIds: string[] | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const open = Boolean(propertyIds && propertyIds.length > 0);

  const leadsQuery = useQuery({
    queryKey: ["leads"],
    queryFn: fetchLeads,
    enabled: open,
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const all = (leadsQuery.data ?? []).filter((l) => !l.isClient);
    if (!term) return all;
    const digits = term.replace(/\D/g, "");
    return all.filter(
      (l) =>
        l.fullName.toLowerCase().includes(term) ||
        (digits.length >= 3 && l.whatsapp.includes(digits)),
    );
  }, [leadsQuery.data, search]);

  const create = useMutation({
    mutationFn: (lead: LeadSummary) => createSelection(lead.id, propertyIds ?? []),
    onSuccess: (selection) => {
      onClose();
      navigate(selectionPath(selection.leadCode, selection.code));
    },
  });

  if (!open) return null;

  const quantos =
    propertyIds!.length === 1 ? "1 imóvel marcado" : `${propertyIds!.length} imóveis marcados`;

  return (
    <Modal open onClose={onClose} title="Enviar seleção para qual lead?">
      <p className="text-body-sm text-text-muted">
        {quantos}. A seleção nasce como rascunho: você ainda organiza, destaca e escolhe o prazo
        antes de gerar o link.
      </p>

      <div className="mt-3">
        <SearchField
          label="Buscar lead"
          placeholder="Buscar por nome ou WhatsApp"
          value={search}
          onChange={setSearch}
        />
      </div>

      {create.isError && (
        <Banner variant="danger">Não foi possível criar a seleção agora. Tente novamente.</Banner>
      )}

      {leadsQuery.isPending ? (
        <div className="mt-3 flex flex-col gap-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-sunken" />
          ))}
        </div>
      ) : leadsQuery.isError ? (
        <p className="mt-3 text-body-sm text-text-muted">
          Não foi possível carregar as leads.{" "}
          <button type="button" className="font-semibold text-accent" onClick={() => leadsQuery.refetch()}>
            Tentar novamente
          </button>
        </p>
      ) : filtered.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-center text-body-sm text-text-muted">
          {search ? "Nenhuma lead com esse nome ou WhatsApp." : "Cadastre uma lead para enviar seleções."}
        </p>
      ) : (
        <ul className="mt-2 flex max-h-80 flex-col divide-y divide-border overflow-y-auto">
          {filtered.map((lead) => {
            const tone = STATUS_TONE[lead.status];
            return (
              <li key={lead.id}>
                <button
                  type="button"
                  disabled={create.isPending}
                  onClick={() => create.mutate(lead)}
                  className="flex w-full items-center gap-3 py-2.5 text-left transition-colors duration-fast hover:bg-surface-sunken disabled:opacity-60 sm:rounded-lg sm:px-2"
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-caption font-bold ${STATUS_TONE_CLASS[tone]}`}
                  >
                    {initials(lead.fullName)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-sm font-semibold text-text">
                      {lead.fullName}
                    </span>
                    <span className="block truncate text-caption text-text-muted">
                      {LEAD_STATUS_LABELS[lead.status]} · {displayWhatsapp(lead.whatsapp)}
                    </span>
                  </span>
                  <svg
                    className="h-4 w-4 shrink-0 text-text-subtle"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
