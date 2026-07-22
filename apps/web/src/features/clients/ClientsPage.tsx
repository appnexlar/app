import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { ClientPurpose, ListClientsQuery } from "@nexlar/shared";
import { Banner } from "../../components/ui/Banner";
import { Button } from "../../components/ui/Button";
import { STATUS_LABELS, STATUS_TONE, STATUS_TONE_CLASS, displayWhatsapp } from "../leads/labels";
import { fetchClients } from "./api";
import { PURPOSE_LABELS, displayDate } from "./labels";

export function ClientsPage() {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState<ListClientsQuery>({});

  const clientsQuery = useQuery({
    queryKey: ["clients", query],
    queryFn: () => fetchClients(query),
  });

  function applySearch() {
    setQuery((q) => ({ ...q, q: term.trim() || undefined }));
  }

  const purposeFilter = query.purpose;
  function setPurpose(p: ClientPurpose | undefined) {
    setQuery((q) => ({ ...q, purpose: p }));
  }

  const clients = clientsQuery.data ?? [];
  const hasFilters = Boolean(query.q || query.purpose);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      {/* Busca + filtro de finalidade */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-text-subtle">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applySearch()}
              placeholder="Buscar por nome, WhatsApp, e-mail ou CPF"
              className="w-full min-h-[var(--tap-target-min)] rounded-md border border-border bg-surface pl-10 pr-3.5 text-body text-text placeholder:text-text-subtle focus-visible:shadow-focus focus-visible:border-[var(--border-focus)]"
            />
          </div>
          <Button type="button" variant="accent" onClick={applySearch}>
            Buscar
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterChip active={!purposeFilter} onClick={() => setPurpose(undefined)}>
            Todas
          </FilterChip>
          <FilterChip active={purposeFilter === "compra"} onClick={() => setPurpose("compra")}>
            Compra
          </FilterChip>
          <FilterChip active={purposeFilter === "locacao"} onClick={() => setPurpose("locacao")}>
            Locação
          </FilterChip>
        </div>
      </div>

      {clientsQuery.isPending ? (
        <ListSkeleton />
      ) : clientsQuery.isError ? (
        <div className="flex flex-col gap-3">
          <Banner variant="danger">
            Não foi possível carregar os clientes. Verifique a conexão e tente novamente.
          </Banner>
          <Button type="button" variant="ghost" className="self-start" onClick={() => clientsQuery.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : clients.length === 0 && !hasFilters ? (
        <EmptyState onSeeLeads={() => navigate("/leads")} />
      ) : clients.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-4 py-6 text-center text-body-sm text-text-muted">
          Nenhum cliente encontrado com esses filtros.
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          <header className="flex items-center gap-2.5 border-b border-border/70 px-4 py-3">
            <h2 className="text-body font-bold text-text">Clientes</h2>
            <span className="flex h-6 min-w-[24px] items-center justify-center rounded-full bg-accent px-1.5 text-caption font-bold tabular-nums text-accent-on">
              {clients.length}
            </span>
          </header>
          <ul className="divide-y divide-border/70">
            {clients.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/clientes/${c.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-sunken/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-body-sm font-semibold text-text">{c.fullName}</p>
                      {c.purpose && (
                        <span className="shrink-0 rounded-full bg-surface-sunken px-2 py-0.5 text-caption text-text-muted">
                          {PURPOSE_LABELS[c.purpose]}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-caption text-text-subtle">
                      <span className="tabular-nums">{displayWhatsapp(c.whatsapp)}</span>
                      {c.relatedPropertyTitle && <span> · {c.relatedPropertyTitle}</span>}
                    </p>
                  </div>
                  <div className="hidden shrink-0 text-right sm:block">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-caption font-semibold ${STATUS_TONE_CLASS[STATUS_TONE[c.status as keyof typeof STATUS_TONE]] ?? ""}`}
                    >
                      {STATUS_LABELS[c.status as keyof typeof STATUS_LABELS] ?? c.status}
                    </span>
                    <p className="mt-0.5 text-caption text-text-subtle">
                      Cliente desde {displayDate(c.convertedAt)}
                    </p>
                  </div>
                  <svg className="h-4 w-4 shrink-0 text-text-subtle" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-3.5 py-1.5 text-body-sm font-medium transition-colors " +
        (active ? "border-accent bg-accent text-accent-on" : "border-border text-text-muted hover:bg-surface-sunken")
      }
    >
      {children}
    </button>
  );
}

function EmptyState({ onSeeLeads }: { onSeeLeads: () => void }) {
  return (
    <section className="animate-rise mx-auto mt-4 flex max-w-xl flex-col items-center rounded-2xl border border-border bg-surface px-6 py-12 text-center shadow-sm">
      <h2 className="text-h2 text-text">Nenhum cliente ainda</h2>
      <p className="mt-2 max-w-sm text-body text-text-muted">
        As leads que avançarem para documentação, financiamento, proposta ou negociação aparecerão
        automaticamente nesta área.
      </p>
      <Button type="button" variant="accent" className="mt-6" onClick={onSeeLeads}>
        Ver leads
      </Button>
    </section>
  );
}

function ListSkeleton() {
  return (
    <div role="status" aria-label="Carregando clientes" className="flex flex-col gap-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-sunken" />
      ))}
    </div>
  );
}
