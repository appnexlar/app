import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import type { LeadActivitySummary, LeadDetail } from "@nexlar/shared";
import { ICON } from "../../components/ui/icon";
import { Button } from "../../components/ui/Button";
import { Banner } from "../../components/ui/Banner";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { FilterChips, type FilterChip } from "../../components/ui/FilterChips";
import { Modal } from "../../components/ui/Modal";
import { usePageEntityLabel } from "../shell/ShellContext";
import { EscolhaDeEnvio, LeadPropertiesBlock } from "./LeadPropertiesBlock";
import { NextActionCard } from "./NextActionCard";
import { FinancingBlock } from "../financing/FinancingBlock";
import { SendFromLeadModal } from "../sharing/SendFromLeadModal";
import { StageDialog } from "../funnel/StageDialog";
import { ConvertDialog } from "../clients/ConvertDialog";
import { clientPath, isUuid, leadPath, useCanonicalPath } from "../../lib/routes";
import { deleteLead, fetchLead } from "./api";
import {
  ACTIVITY_CATEGORY,
  ACTIVITY_LABELS,
  INTENT_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
  STATUS_TONE,
  STATUS_TONE_CLASS,
  TIMELINE_CATEGORY_LABELS,
  type TimelineCategory,
  displayBudget,
  displayCreatedAt,
  displayWhatsapp,
  whatsappLink,
} from "./labels";

/**
 * Ficha da lead, orientada a decisão (não a inventário): cabeçalho enxuto,
 * a próxima ação recomendada logo abaixo, e só então o material de apoio
 * (imóveis, financiamento, preferências, histórico). A regra de peso visual:
 * um destaque por tela, e ele fica com a ação, nunca com o cadastro.
 */
export function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
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
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {remove.isError && (
        <Banner variant="danger">Não foi possível concluir a ação agora. Tente novamente.</Banner>
      )}

      {/* Cabeçalho compacto: identidade e contato, sem disputar com a ação.
          O nome já é o título da página no shell; aqui não se repete. O z-20
          com o menu aberto evita que as seções seguintes (animate-rise cria
          stacking context) cubram o dropdown. */}
      <header
        className={`animate-rise rounded-2xl border border-border bg-surface p-4 sm:p-6 ${moreOpen ? "relative z-20" : ""}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className={`rounded-full px-2 py-1 text-caption font-semibold ${STATUS_TONE_CLASS[STATUS_TONE[lead.status]]}`}
              >
                {STATUS_LABELS[lead.status]}
              </span>
              <span className="text-body-sm text-text-muted">
                última atividade {displayCreatedAt(lastActivity).toLowerCase()}
              </span>
            </div>
            <a
              href={whatsappLink(lead.whatsapp)}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block w-fit text-body-lg font-semibold tabular-nums text-text transition-colors hover:text-accent"
            >
              {displayWhatsapp(lead.whatsapp)}
            </a>
            {meta.length > 0 && (
              <p className="mt-1 text-body-sm text-text-subtle">{meta.join(" · ")}</p>
            )}
          </div>

          {/* Duas ações rápidas de 44px: falar agora e o resto no menu. */}
          <div className="flex flex-none items-center gap-2">
            <a
              href={whatsappLink(lead.whatsapp)}
              target="_blank"
              rel="noreferrer"
              aria-label="Conversar no WhatsApp"
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--success-soft)] text-[var(--success-fg)] transition-colors hover:brightness-95 focus-visible:shadow-focus"
            >
              <WhatsAppIcon />
            </a>
            <div className="relative" ref={moreRef}>
              <button
                type="button"
                aria-label="Mais ações"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((v) => !v)}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-sunken text-text transition-colors hover:bg-[var(--neutral-200)] focus-visible:shadow-focus"
              >
                <MoreHorizontal size={ICON.action} aria-hidden="true" />
              </button>
              {moreOpen && (
                <div className="absolute right-0 top-full z-20 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-md">
                  <MenuItem
                    onClick={() => {
                      setMoreOpen(false);
                      setStageOpen(true);
                    }}
                  >
                    Alterar etapa no funil
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setMoreOpen(false);
                      setConvertOpen(true);
                    }}
                  >
                    Converter em cliente
                  </MenuItem>
                  <MenuItem
                    danger
                    onClick={() => {
                      setMoreOpen(false);
                      setConfirmDelete(true);
                    }}
                  >
                    Excluir lead
                  </MenuItem>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Só mostra o que foi preenchido: campo vazio é ruído, não informação. */}
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-4">
          {lead.email && <Field label="E-mail" value={lead.email} />}
          <Field label="Cadastrada" value={displayCreatedAt(lead.createdAt)} />
        </dl>
      </header>

      {/* A única seção com sombra forte: o destaque é da decisão. */}
      <NextActionCard
        lead={{ id: lead.id, code: lead.code, fullName: lead.fullName, whatsapp: lead.whatsapp }}
        onShare={() => setShareOpen(true)}
      />

      <LeadPropertiesBlock
        lead={{ id: lead.id, code: lead.code, fullName: lead.fullName, whatsapp: lead.whatsapp }}
        onSend={() => setSendOpen(true)}
        onShare={() => setShareOpen(true)}
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

      {/* A folha da escolha de envio: aberta pelo card "Próxima ação" e pelo
          "Compartilhar" das seções, sempre a mesma porta. */}
      {shareOpen && (
        <Modal open onClose={() => setShareOpen(false)} title="Compartilhar imóveis">
          <EscolhaDeEnvio
            lead={{ id: lead.id, code: lead.code, fullName: lead.fullName, whatsapp: lead.whatsapp }}
            onSend={() => {
              setShareOpen(false);
              setSendOpen(true);
            }}
          />
        </Modal>
      )}

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

function MenuItem({
  children,
  onClick,
  danger = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "block w-full px-4 py-2 text-left text-body-sm transition-colors hover:bg-surface-sunken " +
        (danger ? "font-semibold text-[var(--danger-fg)]" : "text-text")
      }
    >
      {children}
    </button>
  );
}

/**
 * Exceção consciente ao Lucide: a biblioteca não tem ícones de marca, e trocar
 * este glifo por um balão genérico custaria o reconhecimento imediato. A cor
 * fica com o contexto (verde escuro do sistema), não com a marca: o verde
 * oficial sobre o fundo suave dá 1,75:1 de contraste e some no sol. A forma
 * carrega o reconhecimento; a cor carrega a leitura.
 */
function WhatsAppIcon() {
  return (
    <svg width={ICON.action} height={ICON.action} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.611-.916-2.206-.242-.58-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12.05 21.785h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885" />
    </svg>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-caption text-text-subtle">{label}</dt>
      <dd className="truncate text-body-sm text-text">{value}</dd>
    </div>
  );
}

function InfoCard({ lead }: { lead: LeadDetail }) {
  const budget = displayBudget(lead.budgetMin, lead.budgetMax);
  if (!budget && !lead.notes) return null;
  return (
    <section className="animate-rise rounded-2xl border border-border bg-surface p-4 sm:p-6">
      <h2 className="text-label font-semibold text-text">Preferências e observações</h2>
      {budget && (
        <div className="mt-4">
          <dt className="text-caption text-text-subtle">Orçamento</dt>
          <dd className="text-body text-text">{budget}</dd>
        </div>
      )}
      {lead.notes && (
        <div className="mt-4">
          <dt className="text-caption text-text-subtle">Observações</dt>
          <dd className="mt-1 whitespace-pre-line text-body text-text">{lead.notes}</dd>
        </div>
      )}
    </section>
  );
}

/** Quantos registros aparecem antes de expandir. */
const TIMELINE_PREVIEW = 5;
/** Teto de atividades que a API devolve (leads.service.ts, take: 50). */
const LIMITE_API = 50;

/**
 * Linha do tempo com filtro por assunto e dobra: os últimos registros à mão,
 * o resto sob demanda. Sem isso a ficha de uma lead ativa viraria um rolo em
 * que a informação nova mora no meio de vinte linhas antigas.
 */
function Timeline({ lead }: { lead: LeadDetail }) {
  const [filtro, setFiltro] = useState<TimelineCategory | "tudo">("tudo");
  const [completa, setCompleta] = useState(false);

  const contagens = useMemo(() => {
    const c = new Map<TimelineCategory, number>();
    for (const a of lead.activities) {
      const cat = ACTIVITY_CATEGORY[a.type];
      c.set(cat, (c.get(cat) ?? 0) + 1);
    }
    return c;
  }, [lead.activities]);

  // Chips só para assuntos que existem nesta lead: filtro vazio é beco.
  const chips: FilterChip<TimelineCategory | "tudo">[] = [
    { value: "tudo", label: "Tudo", count: lead.activities.length },
    ...(Object.keys(TIMELINE_CATEGORY_LABELS) as TimelineCategory[])
      .filter((c) => (contagens.get(c) ?? 0) > 0)
      .map((c) => ({ value: c, label: TIMELINE_CATEGORY_LABELS[c], count: contagens.get(c) })),
  ];

  const filtradas =
    filtro === "tudo"
      ? lead.activities
      : lead.activities.filter((a) => ACTIVITY_CATEGORY[a.type] === filtro);
  const visiveis = completa ? filtradas : filtradas.slice(0, TIMELINE_PREVIEW);
  const ocultas = filtradas.length - visiveis.length;

  // Agrupa por dia: a data vira cabeçalho e cada linha fica só com a hora,
  // em vez de repetir "6 de ago." em cada item.
  const grupos = useMemo(() => {
    const out: Array<{ dia: string; itens: LeadActivitySummary[] }> = [];
    for (const a of visiveis) {
      const dia = displayCreatedAt(a.createdAt);
      const ultimo = out[out.length - 1];
      if (ultimo && ultimo.dia === dia) ultimo.itens.push(a);
      else out.push({ dia, itens: [a] });
    }
    return out;
  }, [visiveis]);

  return (
    <section className="animate-rise rounded-2xl border border-border bg-surface p-4 sm:p-6">
      <h2 className="text-label font-semibold text-text">Histórico</h2>

      {lead.activities.length === 0 ? (
        <p className="mt-4 text-body-sm text-text-muted">
          Ainda não há registros. As ações que você fizer aqui aparecem neste histórico.
        </p>
      ) : (
        <>
          {chips.length > 2 && (
            <div className="mt-4">
              <FilterChips
                label="Filtrar histórico"
                options={chips}
                value={filtro}
                onChange={(v) => {
                  setFiltro(v);
                  setCompleta(false);
                }}
              />
            </div>
          )}

          <div className="mt-4 flex flex-col gap-4">
            {grupos.map((grupo) => (
              <div key={grupo.dia + grupo.itens[0].id}>
                <p className="text-caption font-semibold text-text-subtle">{grupo.dia}</p>
                <ol className="mt-2 flex flex-col gap-4">
                  {grupo.itens.map((activity) => (
                    <li key={activity.id} className="flex gap-4">
                      {/* Marcador neutro: laranja é reservado a ação, e
                          histórico é registro, não chamada. */}
                      <div className="flex flex-col items-center">
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--border-strong)]" />
                        <span className="mt-1 w-px flex-1 bg-border" />
                      </div>
                      <div className="min-w-0 pb-1">
                        <p className="text-body-sm font-semibold text-text">
                          {ACTIVITY_LABELS[activity.type]}
                          <span className="ml-2 font-normal tabular-nums text-text-subtle">
                            {hora(activity.createdAt)}
                          </span>
                        </p>
                        <p className="text-body-sm text-text-muted">{activity.description}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>

          {ocultas > 0 && (
            <button
              type="button"
              onClick={() => setCompleta(true)}
              className="mt-4 flex min-h-[var(--tap-target-min)] w-full items-center justify-center rounded-xl border border-border text-body-sm font-semibold text-text-muted transition-colors hover:bg-surface-sunken hover:text-text"
            >
              Ver mais {ocultas} {ocultas === 1 ? "registro" : "registros"}
            </button>
          )}
          {/* A API entrega no máximo LIMITE_API registros. Dizer "completo"
              sem isso seria promessa falsa para uma lead antiga. */}
          {completa && lead.activities.length >= LIMITE_API && (
            <p className="mt-2 text-caption text-text-subtle">
              Mostrando os {LIMITE_API} registros mais recentes.
            </p>
          )}
          {completa && filtradas.length > TIMELINE_PREVIEW && (
            <button
              type="button"
              onClick={() => setCompleta(false)}
              className="mt-4 flex min-h-[var(--tap-target-min)] w-full items-center justify-center rounded-xl border border-border text-body-sm font-semibold text-text-muted transition-colors hover:bg-surface-sunken hover:text-text"
            >
              Mostrar menos
            </button>
          )}
        </>
      )}
    </section>
  );
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function DetailSkeleton() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4" role="status" aria-label="Carregando ficha">
      <div className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="h-6 w-40 animate-pulse rounded-full bg-surface-sunken" />
            <div className="mt-4 h-6 w-44 animate-pulse rounded bg-surface-sunken" />
            <div className="mt-2 h-4 w-32 animate-pulse rounded bg-surface-sunken" />
          </div>
          <div className="flex gap-2">
            <div className="h-11 w-11 animate-pulse rounded-xl bg-surface-sunken" />
            <div className="h-11 w-11 animate-pulse rounded-xl bg-surface-sunken" />
          </div>
        </div>
      </div>
      <div className="h-40 animate-pulse rounded-2xl bg-surface-sunken" />
      <div className="h-48 animate-pulse rounded-2xl bg-surface-sunken" />
    </div>
  );
}
