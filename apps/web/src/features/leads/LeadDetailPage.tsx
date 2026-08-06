import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { House, MoreHorizontal } from "lucide-react";
import type { LeadDetail } from "@nexlar/shared";
import { ICON } from "../../components/ui/icon";
import { Button } from "../../components/ui/Button";
import { Banner } from "../../components/ui/Banner";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { usePageEntityLabel } from "../shell/ShellContext";
import { LeadPropertiesBlock } from "./LeadPropertiesBlock";
import { FinancingBlock } from "../financing/FinancingBlock";
import { SendFromLeadModal } from "../sharing/SendFromLeadModal";
import { StageDialog } from "../funnel/StageDialog";
import { ConvertDialog } from "../clients/ConvertDialog";
import { clientPath, isUuid, leadPath, useCanonicalPath } from "../../lib/routes";
import { deleteLead, fetchLead } from "./api";
import {
  ACTIVITY_LABELS,
  INTENT_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
  STATUS_TONE,
  STATUS_TONE_CLASS,
  displayBudget,
  displayCreatedAt,
  displayDateTime,
  displayWhatsapp,
  whatsappLink,
} from "./labels";

/**
 * Ficha da lead, no padrão de cartão de contato: identidade centralizada,
 * fileira de ações em tiles e listas agrupadas abaixo. O centro do conteúdo
 * é o acompanhamento dos imóveis enviados; a conversão em cliente é ação
 * secundária, nunca automática.
 */
export function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const onClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [moreOpen]);

  const query = useQuery({
    queryKey: ["lead", id],
    queryFn: () => fetchLead(id as string),
    enabled: Boolean(id),
  });
  usePageEntityLabel(query.data?.fullName);

  // Chegou por link com uuid: troca para a URL com código curto assim que os
  // dados chegam. Quem já virou cliente é redirecionado logo abaixo, então
  // aqui não mexemos para não brigar com aquele redirecionamento.
  const dadosDaLead = query.data;
  useCanonicalPath(
    Boolean(dadosDaLead) && !dadosDaLead?.isClient && isUuid(id),
    leadPath(dadosDaLead?.code ?? ""),
  );

  const remove = useMutation({
    mutationFn: () => deleteLead(id as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      navigate("/leads");
    },
  });

  if (query.isPending) return <DetailSkeleton />;

  if (query.isError) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <Banner variant="danger">
          Não foi possível carregar esta ficha. Verifique a conexão e tente novamente.
        </Banner>
        <Button type="button" variant="ghost" className="self-start" onClick={() => query.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const lead = query.data;

  // Pessoa convertida vive na área Clientes: link antigo de lead cai na ficha
  // do cliente (mesma pessoa, outra fase da jornada).
  if (lead.isClient) return <Navigate to={clientPath(lead.code)} replace />;

  const lastActivity = lead.activities[0]?.createdAt ?? lead.lastContactAt ?? lead.createdAt;
  const meta = [
    lead.source ? SOURCE_LABELS[lead.source] : null,
    lead.intent ? INTENT_LABELS[lead.intent] : null,
    lead.region,
  ].filter(Boolean);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      {remove.isError && (
        <Banner variant="danger">Não foi possível concluir a ação agora. Tente novamente.</Banner>
      )}

      {/* Cartão de contato: identidade central + tiles de ação. O z-20 com o
          menu aberto evita que as seções seguintes (animate-rise cria stacking
          context) cubram o dropdown. */}
      <header
        className={`animate-rise flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm ${moreOpen ? "relative z-20" : ""}`}
      >
        {/* O nome já é o título da página, no cabeçalho. Aqui ficam só os dados
            de contato e as ações, sem repetir identidade nem avatar. */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-0.5 text-caption font-semibold ${STATUS_TONE_CLASS[STATUS_TONE[lead.status]]}`}
              >
                {STATUS_LABELS[lead.status]}
              </span>
              <span className="text-body tabular-nums text-text">
                {displayWhatsapp(lead.whatsapp)}
              </span>
            </div>
            {meta.length > 0 && (
              <p className="mt-1 text-body-sm text-text-subtle">{meta.join(" · ")}</p>
            )}
          </div>

          {/* Tiles de ação, estilo cartão de contato. */}
          <div className="grid w-full grid-cols-3 gap-2.5 sm:ml-auto sm:flex sm:w-auto">
          <a
            href={whatsappLink(lead.whatsapp)}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl bg-[var(--success-soft)] px-2 py-2.5 text-[var(--success-fg)] transition-[transform,box-shadow] duration-fast ease-standard hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 active:scale-[0.98] focus-visible:shadow-focus sm:w-[104px]"
          >
            <WhatsAppIcon />
            <span className="text-caption font-semibold">WhatsApp</span>
          </a>

          <button
            type="button"
            onClick={() => setSendOpen(true)}
            className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl bg-accent-soft px-2 py-2.5 text-accent transition-[transform,box-shadow] duration-fast ease-standard hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 active:scale-[0.98] focus-visible:shadow-focus sm:w-[104px]"
          >
            <House size={ICON.action} aria-hidden="true" />
            <span className="text-caption font-semibold">Enviar imóvel</span>
          </button>

          <div className="relative sm:w-[104px]" ref={moreRef}>
            <button
              type="button"
              aria-label="Mais ações"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((v) => !v)}
              className="flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-xl bg-surface-sunken px-2 py-2.5 text-text transition-[transform,box-shadow,background-color] duration-fast ease-standard hover:-translate-y-0.5 hover:bg-[var(--neutral-200,#e5e5e5)] hover:shadow-sm active:translate-y-0 active:scale-[0.98] focus-visible:shadow-focus"
            >
              <MoreHorizontal size={ICON.action} aria-hidden="true" />
              <span className="text-caption font-semibold">Mais</span>
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-full z-20 mt-1.5 w-60 overflow-hidden rounded-xl border border-border bg-surface py-1.5 shadow-md">
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    setStageOpen(true);
                  }}
                  className="block w-full px-4 py-2.5 text-left text-body-sm text-text hover:bg-surface-sunken"
                >
                  Alterar etapa no funil
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    setConvertOpen(true);
                  }}
                  className="block w-full px-4 py-2.5 text-left text-body-sm text-text hover:bg-surface-sunken"
                >
                  Converter em cliente
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    setConfirmDelete(true);
                  }}
                  className="block w-full px-4 py-2.5 text-left text-body-sm font-semibold text-[var(--danger-fg)] hover:bg-surface-sunken"
                >
                  Excluir lead
                </button>
              </div>
            )}
          </div>
          </div>
        </div>

        {/* Só mostra o que foi preenchido: campo vazio é ruído, não informação. */}
        <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-2.5 border-t border-border pt-4 sm:grid-cols-3">
          {lead.email && <Field label="E-mail" value={lead.email} />}
          <Field label="Cadastrada" value={displayCreatedAt(lead.createdAt)} />
          <Field label="Última atividade" value={displayCreatedAt(lastActivity)} />
        </dl>
      </header>

      {/* Seleções e imóveis enviados. Sem histórico, viram uma decisão só. */}
      <LeadPropertiesBlock
        lead={{ id: lead.id, code: lead.code, whatsapp: lead.whatsapp }}
        onSend={() => setSendOpen(true)}
      />

      <FinancingBlock lead={{ id: lead.id, name: lead.fullName, email: lead.email ?? null }} />

      <InfoCard lead={lead} />

      <Timeline lead={lead} />

      <ConfirmDialog
        open={confirmDelete}
        title="Excluir lead"
        description={`Excluir ${lead.fullName} apaga a lead e todo o histórico dela. Essa ação não pode ser desfeita.`}
        confirmLabel={remove.isPending ? "Excluindo..." : "Excluir lead"}
        danger
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />

      {sendOpen && (
        <SendFromLeadModal
          lead={{ id: lead.id, fullName: lead.fullName, whatsapp: lead.whatsapp }}
          onClose={() => setSendOpen(false)}
        />
      )}

      {stageOpen && (
        <StageDialog
          lead={{ id: lead.id, fullName: lead.fullName, status: lead.status }}
          onClose={() => setStageOpen(false)}
        />
      )}

      {convertOpen && (
        <ConvertDialog
          lead={{ id: lead.id, fullName: lead.fullName }}
          onClose={() => setConvertOpen(false)}
          onConverted={(clientId) => {
            setConvertOpen(false);
            navigate(`/clientes/${clientId}`);
          }}
        />
      )}
    </div>
  );
}

/**
 * Exceção consciente ao Lucide: a biblioteca não tem ícones de marca, e trocar
 * este glifo por um balão genérico custaria o reconhecimento imediato, que é o
 * que faz o corretor achar o botão sem ler. Marca fica com o desenho da marca.
 *
 * Duas escolhas deliberadas aqui:
 * 1. ICON.brand, e não ICON.action: com a mesma medida dos vizinhos a marca
 *    parece encolhida, porque forma circular cheia lê menor que contorno.
 * 2. Verde oficial do WhatsApp, não o verde do sistema. Metade do
 *    reconhecimento de uma marca é a cor dela; pintada com a paleta do app,
 *    ela vira só "um ícone verde".
 */
function WhatsAppIcon() {
  return (
    <svg
      width={ICON.brand}
      height={ICON.brand}
      viewBox="0 0 24 24"
      fill="#25D366"
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.611-.916-2.206-.242-.58-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12.05 21.785h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885" />
    </svg>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-caption text-text-subtle">{label}</dt>
      <dd className="truncate text-body-sm text-text">{value}</dd>
    </div>
  );
}

function InfoCard({ lead }: { lead: LeadDetail }) {
  const budget = displayBudget(lead.budgetMin, lead.budgetMax);
  if (!budget && !lead.notes) return null;
  return (
    <section className="animate-rise rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <h2 className="text-label uppercase tracking-wide text-text-subtle">
        Preferências e observações
      </h2>
      {budget && (
        <div className="mt-3">
          <dt className="text-caption text-text-subtle">Orçamento</dt>
          <dd className="text-body text-text">{budget}</dd>
        </div>
      )}
      {lead.notes && (
        <div className="mt-3">
          <dt className="text-caption text-text-subtle">Observações</dt>
          <dd className="mt-0.5 whitespace-pre-line text-body text-text">{lead.notes}</dd>
        </div>
      )}
    </section>
  );
}

function Timeline({ lead }: { lead: LeadDetail }) {
  return (
    <section className="animate-rise rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <h2 className="text-label uppercase tracking-wide text-text-subtle">Linha do tempo</h2>
      {lead.activities.length === 0 ? (
        <p className="mt-3 text-body-sm text-text-muted">
          Ainda não há registros. As ações que você fizer aqui aparecem nesta linha do tempo.
        </p>
      ) : (
        <ol className="mt-4 flex flex-col gap-4">
          {lead.activities.map((activity) => (
            <li key={activity.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-accent" />
                <span className="mt-1 w-px flex-1 bg-border" />
              </div>
              <div className="min-w-0 pb-1">
                <p className="text-body-sm font-semibold text-text">{ACTIVITY_LABELS[activity.type]}</p>
                <p className="text-body-sm text-text-muted">{activity.description}</p>
                <p className="mt-0.5 text-caption tabular-nums text-text-subtle">
                  {displayDateTime(activity.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-3xl" role="status" aria-label="Carregando ficha">
      <div className="flex flex-col items-center rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="h-16 w-16 animate-pulse rounded-full bg-surface-sunken" />
        <div className="mt-3 h-5 w-44 animate-pulse rounded bg-surface-sunken" />
        <div className="mt-2 h-4 w-32 animate-pulse rounded bg-surface-sunken" />
        <div className="mt-5 grid w-full grid-cols-3 gap-2.5">
          <div className="h-16 animate-pulse rounded-xl bg-surface-sunken" />
          <div className="h-16 animate-pulse rounded-xl bg-surface-sunken" />
          <div className="h-16 animate-pulse rounded-xl bg-surface-sunken" />
        </div>
      </div>
      <div className="mt-5 h-48 animate-pulse rounded-2xl bg-surface-sunken" />
    </div>
  );
}
