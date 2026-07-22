import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LeadSummary } from "@nexlar/shared";
import { Button } from "../../components/ui/Button";
import { Banner } from "../../components/ui/Banner";
import { initials } from "../../lib/name";
import { useShell } from "../shell/ShellContext";
import { LeadActionSheet } from "./LeadActionSheet";
import { fetchLeads } from "./api";
import {
  INTENT_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
  STATUS_TONE,
  STATUS_TONE_CLASS,
  displayCreatedAt,
  displayWhatsapp,
  whatsappLink,
} from "./labels";

/** Lista de leads do corretor, mais recentes primeiro. Busca e filtros vêm na próxima fatia. */
export function LeadsPage() {
  const { openNewLead } = useShell();
  const query = useQuery({ queryKey: ["leads"], queryFn: fetchLeads });
  const [selected, setSelected] = useState<LeadSummary | null>(null);

  if (query.isPending) return <LeadsSkeleton />;

  if (query.isError) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <Banner variant="danger">
          Não foi possível carregar seus leads. Verifique a conexão e tente novamente.
        </Banner>
        <Button type="button" variant="ghost" className="self-start" onClick={() => query.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const leads = query.data;

  if (leads.length === 0) {
    return (
      <section className="animate-rise mx-auto mt-4 flex max-w-xl flex-col items-center rounded-2xl border border-border bg-surface px-6 py-12 text-center shadow-sm">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M16 19v-1.5a3.5 3.5 0 00-3.5-3.5h-5A3.5 3.5 0 004 17.5V19M10 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM17 4.5a3.5 3.5 0 010 6.6M20 19v-1.5a3.5 3.5 0 00-2.5-3.35"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 className="mt-5 text-h2 text-text">Nenhum lead cadastrado</h2>
        <p className="mt-2 max-w-sm text-body text-text-muted">
          Cadastre seu primeiro contato em segundos: só o nome e o WhatsApp são obrigatórios.
        </p>
        <Button type="button" variant="accent" className="mt-6" onClick={openNewLead}>
          Cadastrar primeiro lead
        </Button>
      </section>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col">
      <p className="text-body-sm text-text-muted">
        {leads.length === 1 ? "1 lead" : `${leads.length} leads`}, do mais recente para o mais
        antigo. Toque para ver os detalhes.
      </p>
      <ul className="animate-rise mt-4 flex flex-col gap-2">
        {leads.map((lead) => (
          <LeadRow key={lead.id} lead={lead} onOpen={() => setSelected(lead)} />
        ))}
      </ul>
      <LeadActionSheet lead={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function LeadRow({ lead, onOpen }: { lead: LeadSummary; onOpen: () => void }) {
  const meta = [
    lead.source ? SOURCE_LABELS[lead.source] : null,
    lead.intent ? INTENT_LABELS[lead.intent] : null,
    lead.region,
  ].filter(Boolean);

  return (
    <li className="group relative flex items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-3 shadow-xs transition-[border-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-0.5 hover:border-border-strong hover:shadow-sm sm:px-4 sm:py-3.5">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Ver detalhes de ${lead.fullName}`}
        className="absolute inset-0 rounded-2xl focus-visible:shadow-focus"
      />

      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-body-sm font-bold text-primary">
        {initials(lead.fullName)}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-semibold text-text">{lead.fullName}</p>
        <div className="mt-1 flex min-w-0 items-center gap-2">
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-caption font-semibold ${STATUS_TONE_CLASS[STATUS_TONE[lead.status]]}`}
          >
            {STATUS_LABELS[lead.status]}
          </span>
          <span className="truncate text-body-sm text-text-muted">
            {displayWhatsapp(lead.whatsapp)}
            {meta.length > 0 && <span className="text-text-subtle"> · {meta.join(" · ")}</span>}
          </span>
        </div>
      </div>

      {/* Ações ficam acima do botão de fundo (z-10) para não abrir a ficha por engano. */}
      <div className="relative z-10 flex shrink-0 items-center gap-2 sm:gap-3">
        <span className="hidden text-caption tabular-nums text-text-subtle sm:block">
          {displayCreatedAt(lead.createdAt)}
        </span>
        <a
          href={whatsappLink(lead.whatsapp)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Conversar com ${lead.fullName} no WhatsApp`}
          title="Conversar no WhatsApp"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-success-soft text-success-fg shadow-xs transition-[background-color,color,transform,box-shadow] duration-fast ease-standard hover:-translate-y-0.5 hover:bg-success hover:text-white hover:shadow-sm active:translate-y-0 active:scale-95 focus-visible:shadow-focus"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.611-.916-2.206-.242-.58-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
        </a>
        <svg
          className="h-5 w-5 shrink-0 text-text-subtle transition-transform duration-fast ease-standard group-hover:translate-x-0.5"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </li>
  );
}

function LeadsSkeleton() {
  return (
    <div className="mx-auto max-w-3xl" role="status" aria-label="Carregando leads">
      <div className="h-4 w-56 animate-pulse rounded bg-surface-sunken" />
      <div className="mt-4 flex flex-col gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-3.5 shadow-xs sm:px-4"
          >
            <div className="h-11 w-11 animate-pulse rounded-full bg-surface-sunken" />
            <div className="flex-1">
              <div className="h-4 w-36 animate-pulse rounded bg-surface-sunken" />
              <div className="mt-2 h-3.5 w-52 animate-pulse rounded bg-surface-sunken" />
            </div>
            <div className="h-11 w-11 animate-pulse rounded-full bg-surface-sunken" />
          </div>
        ))}
      </div>
    </div>
  );
}
