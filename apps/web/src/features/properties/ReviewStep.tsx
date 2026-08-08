import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronRight, Info, Pencil } from "lucide-react";
import type { ReactNode } from "react";
import {
  DETAIL_FIELDS,
  needsRentPrice,
  needsSalePrice,
  publishIssues,
  type PropertyCategory,
  type PublishIssue,
} from "@nexlar/shared";
import { parseMoney } from "../../lib/masks";
import { fetchProperty } from "./api";
import {
  ADDRESS_DISPLAY_LABELS,
  CATEGORY_LABELS,
  ORIGIN_LABELS,
  PURPOSE_LABELS,
  TYPE_LABELS,
  formatMoney,
} from "./labels";

/**
 * Etapa 7: a confirmação final antes de o imóvel ficar disponível.
 *
 * A tela responde quatro perguntas, nessa ordem: está tudo certo, falta
 * alguma coisa, onde eu corrijo e o que acontece quando eu publicar. Por isso
 * as pendências vêm ANTES dos dados, cada seção tem seu próprio "Editar" que
 * pula direto para a etapa certa, e o rótulo fica acima do valor: título e
 * endereço de imóvel são longos e não cabem numa coluna estreita.
 *
 * Só apresenta: nenhuma regra de negócio mora aqui. O que impede publicar é
 * decidido pela API, e a lista de pendências espelha essa regra pelo
 * publishIssues do pacote compartilhado.
 */

export interface ReviewData {
  title: string;
  category: PropertyCategory | "";
  type: string;
  purpose: "" | "venda" | "locacao" | "venda_locacao" | "temporada";
  origin: string;
  street: string;
  addressNumber: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  zip: string;
  addressDisplay: keyof typeof ADDRESS_DISPLAY_LABELS;
  salePrice: string;
  rentPrice: string;
  condoFee: string;
  iptu: string;
  otherFees: string;
  details: Record<string, unknown>;
  features: string[];
}

/** Etapas do wizard que cada seção da revisão edita. */
const STEP = { identificacao: 0, localizacao: 1, caracteristicas: 2, valores: 3 } as const;

export function StepReview({
  data,
  propertyId,
  onEditStep,
}: {
  data: ReviewData;
  propertyId: string | null;
  onEditStep: (step: number) => void;
}) {
  // Só para contar as fotos: a etapa 6 grava direto na API, então o form não
  // sabe quantas existem. Leitura pura, sem efeito no cadastro.
  const detail = useQuery({
    queryKey: ["property", propertyId],
    queryFn: () => fetchProperty(propertyId as string),
    enabled: !!propertyId,
  });
  const photoCount =
    detail.data?.media.filter((m) => m.kind === "foto" && m.status !== "removido").length ?? 0;

  const sale = parseMoney(data.salePrice);
  const rent = parseMoney(data.rentPrice);
  // Mesma regra que a API aplica ao publicar (bloqueiosParaPublicar), mais as
  // sugestões que só existem aqui. Isto é aviso, não decisão: quem barra é o
  // servidor, na hora de mudar o status.
  const issues = publishIssues({
    purpose: data.purpose,
    city: data.city,
    neighborhood: data.neighborhood,
    salePrice: sale,
    rentPrice: rent,
    features: data.features,
    photoCount,
  });

  const address = [
    data.street && `${data.street}${data.addressNumber ? `, ${data.addressNumber}` : ""}`,
    data.complement,
  ]
    .filter(Boolean)
    .join(" · ");
  const region = [data.neighborhood, data.city && `${data.city}${data.state ? `/${data.state}` : ""}`]
    .filter(Boolean)
    .join(" · ");

  const detailFields = data.category ? DETAIL_FIELDS[data.category] : [];
  const filledDetails = detailFields.filter((f) => {
    const v = data.details[f.key];
    return v !== undefined && v !== null && v !== "" && v !== false;
  });

  return (
    <div className="flex flex-col gap-6">
      <IssueSummary issues={issues} onGo={onEditStep} />

      <Section title="Informações principais" onEdit={() => onEditStep(STEP.identificacao)}>
        <Field label="Título" value={data.title} block />
        <Field
          label="Categoria e tipo"
          value={
            data.category
              ? `${CATEGORY_LABELS[data.category]} · ${TYPE_LABELS[data.type] ?? data.type}`
              : null
          }
        />
        <Field label="Finalidade" value={data.purpose ? PURPOSE_LABELS[data.purpose] : null} />
        <Field
          label="Origem"
          value={data.origin ? ORIGIN_LABELS[data.origin as keyof typeof ORIGIN_LABELS] : null}
        />
      </Section>

      <Section title="Localização" onEdit={() => onEditStep(STEP.localizacao)}>
        <Field
          label="Endereço"
          value={address || null}
          block
          missing={{ text: "Endereço não informado", action: "Adicionar endereço" }}
        />
        <Field
          label="Bairro e cidade"
          value={region || null}
          block
          issue={issues.find((i) => i.key === "city" || i.key === "neighborhood")}
          missing={{ text: "Bairro e cidade não informados", action: "Adicionar" }}
        />
        <Field label="CEP" value={data.zip || null} />
        <Field label="Na página pública" value={ADDRESS_DISPLAY_LABELS[data.addressDisplay]} />
      </Section>

      <Section title="Valores" onEdit={() => onEditStep(STEP.valores)}>
        {needsSalePrice(data.purpose) && (
          <Field
            label="Valor de venda"
            value={sale != null ? formatMoney(sale) : null}
            issue={issues.find((i) => i.key === "salePrice")}
            missing={{ text: "Valor de venda não informado", action: "Adicionar valor" }}
          />
        )}
        {needsRentPrice(data.purpose) && (
          <Field
            label="Valor mensal"
            value={rent != null ? formatMoney(rent) : null}
            issue={issues.find((i) => i.key === "rentPrice")}
            missing={{ text: "Valor mensal não informado", action: "Adicionar valor" }}
          />
        )}
        {needsRentPrice(data.purpose) && (
          <>
            <Field label="Condomínio" value={money(data.condoFee)} />
            <Field label="IPTU" value={money(data.iptu)} />
          </>
        )}
        {!needsRentPrice(data.purpose) && <Field label="IPTU" value={money(data.iptu)} />}
        <Field label="Outras taxas" value={data.otherFees || null} />
      </Section>

      <Section title="Características" onEdit={() => onEditStep(STEP.caracteristicas)}>
        {filledDetails.length > 0 ? (
          filledDetails.map((f) => (
            <Field
              key={f.key}
              label={f.label}
              value={formatDetail(data.details[f.key], f.suffix)}
            />
          ))
        ) : (
          <Field label="Detalhes do imóvel" value={null} />
        )}
        <Field
          label="Comodidades"
          value={data.features.length > 0 ? data.features.join(", ") : null}
          block
          issue={issues.find((i) => i.key === "features")}
          missing={{ text: "Nenhuma comodidade marcada", action: "Adicionar comodidades" }}
        />
      </Section>

      <p className="flex items-start gap-2 text-body-sm text-text-muted">
        <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        Ao tornar disponível, o imóvel passa a poder entrar nas seleções que você envia às suas
        leads. Você pode voltar para rascunho quando quiser.
      </p>
    </div>
  );
}

// --- Resumo de pendências ----------------------------------------------------

function IssueSummary({
  issues,
  onGo,
}: {
  issues: PublishIssue[];
  onGo: (step: number) => void;
}) {
  const blocking = issues.filter((i) => i.level === "bloqueante");

  if (issues.length === 0) {
    return (
      <div
        role="status"
        className="flex items-center gap-3 rounded-xl border border-[var(--success)]/30 bg-[var(--success-soft)] px-4 py-4"
      >
        <CheckCircle2 size={20} className="shrink-0 text-[var(--success-fg)]" aria-hidden="true" />
        <p className="text-body-sm font-semibold text-[var(--success-fg)]">
          Tudo pronto para tornar o imóvel disponível.
        </p>
      </div>
    );
  }

  const critico = blocking.length > 0;
  return (
    <div
      role="status"
      className={
        "rounded-xl border px-4 py-4 " +
        (critico
          ? "border-[var(--warning)]/40 bg-[var(--warning-soft)]"
          : "border-border bg-surface-sunken")
      }
    >
      <p className="flex items-center gap-2 text-body-sm font-semibold text-text">
        <AlertTriangle
          size={18}
          className={"shrink-0 " + (critico ? "text-[var(--warning-fg)]" : "text-text-muted")}
          aria-hidden="true"
        />
        {critico
          ? `${plural(blocking.length, "informação impede", "informações impedem")} a publicação`
          : `${plural(issues.length, "sugestão para", "sugestões para")} deixar o anúncio melhor`}
      </p>
      <ul className="mt-3 flex flex-col">
        {issues.map((issue) => (
          <li key={issue.key}>
            <button
              type="button"
              onClick={() => onGo(issue.step)}
              className="flex min-h-[var(--tap-target-min)] w-full items-center gap-3 rounded-md px-2 -mx-2 text-left transition-colors duration-fast hover:bg-surface/60 focus-visible:shadow-focus"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-body-sm text-text">{issue.label}</span>
                {/* O peso não depende só da cor: bloqueante diz por escrito,
                    em linha própria para não quebrar no meio da frase. */}
                {issue.level === "bloqueante" && (
                  <span className="mt-0.5 block text-caption font-semibold text-[var(--warning-fg)]">
                    Obrigatório para publicar
                  </span>
                )}
              </span>
              <ChevronRight size={16} className="shrink-0 text-text-subtle" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

// --- Blocos ------------------------------------------------------------------

function Section({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface px-4 py-4 sm:px-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="text-h3 text-text">{title}</h3>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Editar ${title.toLowerCase()}`}
          className="-mr-2 inline-flex min-h-[var(--tap-target-min)] shrink-0 items-center gap-1.5 rounded-md px-2 text-body-sm font-semibold text-accent transition-colors duration-fast hover:text-accent-hover focus-visible:shadow-focus"
        >
          <Pencil size={15} aria-hidden="true" />
          Editar
        </button>
      </div>
      {/* Duas colunas só no desktop e só para valores curtos: quem é `block`
          atravessa a grade inteira, para título e endereço não quebrarem. */}
      <dl className="grid gap-4 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Field({
  label,
  value,
  block = false,
  issue,
  missing,
}: {
  label: string;
  value: string | null;
  /** Ocupa a linha inteira: textos longos (título, endereço, comodidades). */
  block?: boolean;
  /** Pendência ligada a este campo, quando houver. */
  issue?: PublishIssue;
  /** Texto e ação quando o campo vazio merece atenção. */
  missing?: { text: string; action: string };
}) {
  const span = block ? "sm:col-span-2" : "";

  if (value) {
    return (
      <div className={span}>
        <dt className="text-body-sm text-text-muted">{label}</dt>
        <dd className="mt-1 text-body font-medium text-text">{value}</dd>
      </div>
    );
  }

  // Vazio com pendência: fala o que falta, não repete o rótulo.
  if (issue && missing) {
    return (
      <div className={span}>
        <dt className="sr-only">{label}</dt>
        <dd className="flex items-start gap-2">
          <AlertTriangle
            size={16}
            className="mt-0.5 shrink-0 text-[var(--warning-fg)]"
            aria-hidden="true"
          />
          <span className="text-body-sm font-medium text-text">{missing.text}</span>
        </dd>
      </div>
    );
  }

  // Vazio e opcional: neutro, sem alarde.
  return (
    <div className={span}>
      <dt className="text-body-sm text-text-muted">{label}</dt>
      <dd className="mt-1 text-body text-text-subtle">Não informado</dd>
    </div>
  );
}

// --- Formatação --------------------------------------------------------------

function money(raw: string): string | null {
  const value = parseMoney(raw);
  return value != null ? formatMoney(value) : null;
}

function formatDetail(value: unknown, suffix?: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") return value ? "Sim" : null;
  const text = String(value);
  return suffix ? `${text} ${suffix}` : text;
}
