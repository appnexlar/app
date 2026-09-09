import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { LeadDetail } from "@nexlar/shared";
import { Button } from "../../components/ui/Button";
import { fetchLeadPreferences } from "../selections/api";
import { preferencePills } from "../selections/labels";
import { PreferencesModal } from "../selections/PreferencesModal";

interface PreferencesCardProps {
  lead: LeadDetail;
}

/**
 * "O que o cliente procura", na ficha (entidade única, set 2026). É o mesmo
 * registro que o cadastro rápido grava e que o montador da seleção usa para
 * filtrar: um lugar só para anotar e editar. Vazio orienta, nunca cobra.
 * As observações soltas do cadastro ficam aqui embaixo, porque na conversa
 * elas andam juntas ("quer perto da escola do filho").
 */
export function PreferencesCard({ lead }: PreferencesCardProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const preferences = useQuery({
    queryKey: ["lead-preferences", lead.id],
    queryFn: () => fetchLeadPreferences(lead.id),
  });

  const pref = preferences.data ?? null;
  const pills = preferencePills(pref);
  if (pref?.region) pills.unshift(pref.region);
  const temAlgo = pills.length > 0 || Boolean(pref?.restrictions);
  const primeiroNome = lead.fullName.split(" ")[0];

  return (
    <section className="animate-rise rounded-2xl border border-border bg-surface p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-label font-semibold text-text">O que {primeiroNome} procura</h2>
          {preferences.isPending ? (
            <div className="mt-3 h-6 w-2/3 animate-pulse rounded-full bg-surface-sunken" aria-hidden="true" />
          ) : preferences.isError ? (
            <p className="mt-2 text-body-sm text-text-muted">Não foi possível carregar as preferências.</p>
          ) : temAlgo ? (
            <>
              {pills.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {pills.map((pill) => (
                    <span
                      key={pill}
                      className="rounded-full bg-surface-sunken px-2.5 py-0.5 text-caption font-medium text-text"
                    >
                      {pill}
                    </span>
                  ))}
                </div>
              )}
              {pref?.restrictions && (
                <p className="mt-2 text-caption text-[var(--danger-fg)]">Não aceita: {pref.restrictions}</p>
              )}
            </>
          ) : (
            <p className="mt-2 text-body-sm text-text-muted">
              Anote região, faixa de valor e o que não pode faltar. Isso vira filtro na hora de escolher
              os imóveis.
            </p>
          )}
        </div>
        {!preferences.isPending && (
          <Button type="button" variant="ghost" className="-my-1 shrink-0" onClick={() => setOpen(true)}>
            {temAlgo ? "Editar" : "Preencher"}
          </Button>
        )}
      </div>

      {lead.notes && (
        <div className="mt-4 border-t border-border pt-4">
          <dt className="text-caption text-text-subtle">Observações</dt>
          <dd className="mt-1 whitespace-pre-line text-body text-text">{lead.notes}</dd>
        </div>
      )}

      {open && (
        <PreferencesModal
          leadId={lead.id}
          leadName={primeiroNome}
          current={pref}
          onClose={() => setOpen(false)}
          onSaved={() => {
            // A região e a faixa também aparecem no cabeçalho, na lista e no
            // funil. A ficha é consultada pelo código curto da URL, não pelo
            // id, então o prefixo cobre as duas chaves.
            queryClient.invalidateQueries({ queryKey: ["lead"] });
            queryClient.invalidateQueries({ queryKey: ["leads"] });
            queryClient.invalidateQueries({ queryKey: ["guidance"] });
          }}
        />
      )}
    </section>
  );
}
