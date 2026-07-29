import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { LeadSummary } from "@nexlar/shared";
import { Button } from "../../components/ui/Button";
import { Banner } from "../../components/ui/Banner";
import { SearchField } from "../../components/ui/SearchField";
import { FilterChips, type FilterChip } from "../../components/ui/FilterChips";
import { SmartEmptyState } from "../../components/ui/SmartEmptyState";
import { GuidanceInline } from "../guidance/GuidanceInline";
import { useShell } from "../shell/ShellContext";
import { leadPath } from "../../lib/routes";
import { fetchLeads } from "./api";
import {
  INTENT_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
  STATUS_TONE,
  displayCreatedAt,
  displayWhatsapp,
  whatsappLink,
  type StatusTone,
} from "./labels";

/** Faixas do filtro rápido. Espelham o funil enxuto, não os 14 status crus. */
type Faixa = "todos" | StatusTone;

const FAIXA_LABELS: Record<Faixa, string> = {
  todos: "Todos",
  novo: "Novos",
  ativo: "Em atendimento",
  ganho: "Clientes",
  encerrado: "Encerrados",
};

const FAIXA_ORDEM: Faixa[] = ["todos", "novo", "ativo", "ganho", "encerrado"];

/** Tira acento e caixa para a busca não exigir digitação exata. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function matches(lead: LeadSummary, termo: string): boolean {
  const alvo = normalize(
    [lead.fullName, lead.region ?? "", lead.source ? SOURCE_LABELS[lead.source] : ""].join(" "),
  );
  const digitos = termo.replace(/\D/g, "");
  if (digitos.length >= 3 && lead.whatsapp.includes(digitos)) return true;
  return alvo.includes(normalize(termo));
}

/** Lista de leads do corretor, mais recentes primeiro, com busca e filtro. */
export function LeadsPage() {
  const { openNewLead } = useShell();
  const query = useQuery({ queryKey: ["leads"], queryFn: fetchLeads });
  const [termo, setTermo] = useState("");
  const [faixa, setFaixa] = useState<Faixa>("todos");

  const leads = query.data;

  const chips = useMemo<FilterChip<Faixa>[]>(() => {
    const base = leads ?? [];
    return FAIXA_ORDEM.map((value) => ({
      value,
      label: FAIXA_LABELS[value],
      count:
        value === "todos"
          ? base.length
          : base.filter((lead) => STATUS_TONE[lead.status] === value).length,
    }));
  }, [leads]);

  const visiveis = useMemo(() => {
    const base = leads ?? [];
    return base.filter(
      (lead) =>
        (faixa === "todos" || STATUS_TONE[lead.status] === faixa) &&
        (termo.trim() === "" || matches(lead, termo.trim())),
    );
  }, [leads, faixa, termo]);

  if (query.isPending) return <LeadsSkeleton />;

  if (query.isError) {
    return (
      <div className="flex max-w-xl flex-col gap-4">
        <Banner variant="danger">
          Não foi possível carregar seus leads. Verifique a conexão e tente novamente.
        </Banner>
        <Button type="button" variant="ghost" className="self-start" onClick={() => query.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  // Carteira vazia: nada de busca nem filtro, só o próximo passo.
  if (leads!.length === 0) return <CarteiraVazia onNew={openNewLead} />;

  const filtrando = termo.trim() !== "" || faixa !== "todos";

  return (
    <div className="flex flex-col gap-4">
      {/* Orientação contextual da tela: preferências pendentes, follow-up
          vencido. Some sozinha quando não há nada relevante aqui. */}
      <GuidanceInline prefixos={["/leads"]} />

      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <SearchField
            label="Buscar lead por nome, WhatsApp ou bairro"
            placeholder="Buscar por nome, WhatsApp ou bairro"
            value={termo}
            onChange={setTermo}
          />
        </div>
        <FilterChips label="Filtrar por etapa" options={chips} value={faixa} onChange={setFaixa} />
      </div>

      {visiveis.length === 0 ? (
        <SemResultado
          onClear={() => {
            setTermo("");
            setFaixa("todos");
          }}
        />
      ) : (
        <section className="animate-rise overflow-hidden rounded-2xl border border-border bg-surface">
          {/* A contagem encosta na lista, como cabeçalho dela, em vez de flutuar
              solta acima. Sem "toque para ver", que só valia no celular. */}
          <header className="flex items-baseline justify-between border-b border-border px-4 py-3">
            <h2 className="text-body font-semibold text-text">
              {visiveis.length === 1 ? "1 lead" : `${visiveis.length} leads`}
            </h2>
            {!filtrando && (
              <span className="text-caption text-text-subtle">Mais recentes primeiro</span>
            )}
          </header>
          <ul className="divide-y divide-border">
            {visiveis.map((lead) => (
              <LeadRow key={lead.id} lead={lead} />
            ))}
          </ul>
        </section>
      )}

    </div>
  );
}

/**
 * Uma linha por lead, no desenho de uma lista de contatos de app: nome dono
 * da primeira linha inteira, e uma única linha de apoio embaixo (etapa +
 * WhatsApp; origem e região entram só onde há espaço). Nada disputa a mesma
 * linha que o nome.
 */
function LeadRow({ lead }: { lead: LeadSummary }) {
  const tone = STATUS_TONE[lead.status];
  const meta = [
    lead.source ? SOURCE_LABELS[lead.source] : null,
    lead.intent ? INTENT_LABELS[lead.intent] : null,
    lead.region,
  ].filter(Boolean);

  return (
    <li className="group relative flex items-center gap-3 px-3 py-3 transition-colors duration-fast ease-standard hover:bg-surface-hover sm:gap-4 sm:px-4">
      {/* A linha inteira leva à ficha. Antes abria uma folha de ações cuja
          ação principal era "Ver detalhes" e cujas outras duas já estavam
          resolvidas: o WhatsApp está aqui do lado, e excluir é melhor na
          ficha, onde dá para ver o que está sendo apagado. Era um toque a
          mais na ação mais frequente do dia. */}
      <Link
        to={leadPath(lead.code)}
        aria-label={`Abrir a ficha de ${lead.fullName}`}
        className="absolute inset-0 focus-visible:shadow-focus"
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-semibold text-text">{lead.fullName}</p>
        <p className="mt-0.5 truncate text-caption text-text-muted">
          <span className={`font-semibold ${STATUS_TEXT_CLASS[tone]}`}>
            {STATUS_LABELS[lead.status]}
          </span>
          {/* Número cortado no meio não informa nada: no celular fica só a
              etapa, e falar com a lead é o botão verde ao lado. */}
          <span className="hidden sm:inline"> · {displayWhatsapp(lead.whatsapp)}</span>
          {meta.length > 0 && (
            <span className="hidden text-text-subtle sm:inline"> · {meta.join(" · ")}</span>
          )}
        </p>
      </div>

      {/* Ações ficam acima do botão de fundo (z-10) para não abrir a ficha por engano. */}
      <div className="relative z-10 flex shrink-0 items-center gap-2 sm:gap-4">
        <span className="hidden text-caption tabular-nums text-text-subtle sm:block">
          {displayCreatedAt(lead.createdAt)}
        </span>
        <a
          href={whatsappLink(lead.whatsapp)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Conversar com ${lead.fullName} no WhatsApp`}
          title="Conversar no WhatsApp"
          className="flex h-10 w-10 items-center justify-center rounded-full text-success-fg transition-colors duration-fast ease-standard hover:bg-success-soft focus-visible:shadow-focus"
        >
          <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
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

/**
 * Status como texto colorido, não pílula: numa lista, pílula em toda linha vira
 * ruído e rouba a atenção do nome.
 */
const STATUS_TEXT_CLASS: Record<StatusTone, string> = {
  novo: "text-[var(--highlight-fg)]",
  ativo: "text-accent",
  ganho: "text-success-fg",
  encerrado: "text-text-subtle",
};

function CarteiraVazia({ onNew }: { onNew: () => void }) {
  return (
    <SmartEmptyState
      icon={
        <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M16 19v-1.5a3.5 3.5 0 00-3.5-3.5h-5A3.5 3.5 0 004 17.5V19M10 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM17 4.5a3.5 3.5 0 010 6.6M20 19v-1.5a3.5 3.5 0 00-2.5-3.35"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      }
      title="Seus leads começam aqui"
      description="Cada lead é uma pessoa interessada nos seus imóveis. Cadastre o primeiro para acompanhar o atendimento até o fechamento."
      action={{ label: "Cadastrar primeiro lead", onClick: onNew }}
      hint="Só o nome e o WhatsApp são obrigatórios."
    />
  );
}

/** Vazio de busca é diferente de carteira vazia: aqui o próximo passo é limpar. */
function SemResultado({ onClear }: { onClear: () => void }) {
  return (
    <section className="flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-10 text-center">
      <p className="text-body text-text">Nenhum lead encontrado</p>
      <p className="mt-1 max-w-sm text-body-sm text-text-muted">
        Tente outro nome, número ou bairro, ou volte para a lista completa.
      </p>
      <Button type="button" variant="ghost" className="mt-4" onClick={onClear}>
        Limpar busca e filtro
      </Button>
    </section>
  );
}

function LeadsSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Carregando leads">
      <div className="h-11 animate-pulse rounded-xl bg-surface-sunken" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-9 w-24 animate-pulse rounded-full bg-surface-sunken" />
        ))}
      </div>
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-4">
            <div className="flex-1">
              <div className="h-4 w-40 animate-pulse rounded bg-surface-sunken" />
              <div className="mt-2 h-3.5 w-56 animate-pulse rounded bg-surface-sunken" />
            </div>
            <div className="h-10 w-10 animate-pulse rounded-full bg-surface-sunken" />
          </div>
        ))}
      </div>
    </div>
  );
}
