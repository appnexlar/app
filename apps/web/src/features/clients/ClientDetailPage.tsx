import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Banner } from "../../components/ui/Banner";
import { Button } from "../../components/ui/Button";
import { clientPath, isUuid, useCanonicalPath } from "../../lib/routes";
import { usePageEntityLabel } from "../shell/ShellContext";
import { EventFormModal } from "../agenda/EventFormModal";
import { ACTIVITY_LABELS, displayWhatsapp, whatsappLink } from "../leads/labels";
import { fetchClient } from "./api";
import { FinancialFormModal, NegotiationFormModal, ProfileFormModal } from "./ClientEditModals";
import { ParticipantsSection } from "./ClientParticipants";
import { DeletionDialog } from "./DeletionDialog";
import {
  DELETION_STATUS_LABELS,
  INCOME_LABELS,
  MARITAL_LABELS,
  NEXT_STEP_LABELS,
  PAYMENT_LABELS,
  PURPOSE_LABELS,
  REASON_LABELS,
  STAGE_LABELS,
  SUGGESTED_ACTION_LABELS,
  boolLabel,
  displayDate,
  displayDateOnly,
  displayDateTime,
  formatCep,
  formatCpf,
  formatMoney,
} from "./labels";

const SECTIONS = [
  { id: "visao-geral", label: "Visão geral" },
  { id: "dados-pessoais", label: "Dados pessoais" },
  { id: "negociacao", label: "Negociação" },
  { id: "financeiro", label: "Financeiro" },
  { id: "participantes", label: "Participantes" },
  { id: "timeline", label: "Timeline" },
  { id: "privacidade", label: "Privacidade" },
];

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [editProfile, setEditProfile] = useState(false);
  const [editNegotiation, setEditNegotiation] = useState(false);
  const [editFinancial, setEditFinancial] = useState(false);
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [tab, setTab] = useState("visao-geral");
  const moreRef = useRef<HTMLDivElement>(null);
  const query = useQuery({
    queryKey: ["client", id],
    queryFn: () => fetchClient(id as string),
    enabled: Boolean(id),
  });
  usePageEntityLabel(query.data?.fullName);

  // Mesma regra da ficha de lead: a URL mostra o código curto do cliente.
  useCanonicalPath(Boolean(query.data) && isUuid(id), clientPath(query.data?.code ?? ""));

  useEffect(() => {
    if (!moreOpen) return;
    const onClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [moreOpen]);

  if (query.isPending) return <Skeleton />;
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

  const client = query.data;
  const conv = client.conversion;
  const lastActivity = client.activities[0]?.createdAt ?? client.lastContactAt ?? client.createdAt;
  const stageLabel = conv ? STAGE_LABELS[conv.nextStep] : "Cliente";
  const suggestedAction = conv ? SUGGESTED_ACTION_LABELS[conv.nextStep] : null;

  const hasPersonal = Boolean(client.profile?.cpf || client.profile?.birthDate);
  const progress: { label: string; status: "concluido" | "pendente" | "nao_iniciado" }[] = [
    { label: "Dados básicos", status: "concluido" },
    { label: "Dados pessoais", status: hasPersonal ? "concluido" : "pendente" },
    { label: "Consentimento", status: client.consents.length > 0 ? "concluido" : "pendente" },
    { label: "Documentos", status: "nao_iniciado" },
    { label: "Simulação", status: "nao_iniciado" },
    { label: "Proposta", status: "nao_iniciado" },
  ];

  // Campos essenciais de dados pessoais que ainda faltam (coleta progressiva).
  const missingPersonal = client.profile
    ? (
        [
          [client.profile.cpf, "CPF"],
          [client.profile.birthDate, "Data de nascimento"],
          [client.profile.maritalStatus, "Estado civil"],
          [client.profile.street, "Endereço"],
          [client.profile.nationality, "Nacionalidade"],
          [client.profile.rg, "Documento de identificação"],
        ] as const
      )
        .filter(([v]) => !v)
        .map(([, label]) => label)
    : ["CPF", "Data de nascimento", "Estado civil", "Endereço", "Nacionalidade", "Documento de identificação"];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      {/* Cabeçalho */}
      <header className={`animate-rise flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm ${moreOpen ? "relative z-20" : ""}`}>
        {/* O nome já é o título da página, no cabeçalho. Aqui ficam só o estado,
            o contato e as ações, sem repetir identidade nem avatar: a ficha da
            lead já segue esse padrão e as duas telas precisam se parecer. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="rounded-full bg-[var(--success-soft)] px-2.5 py-0.5 text-caption font-semibold text-[var(--success-fg)]">
            Cliente
          </span>
          <span className="text-body tabular-nums text-text">{displayWhatsapp(client.whatsapp)}</span>
          {client.email && (
            <span className="min-w-0 truncate text-body-sm text-text-subtle">{client.email}</span>
          )}
        </div>

        {/* Foco de agora: o que orienta o corretor para a próxima etapa. */}
        <div className="flex flex-col gap-2 rounded-xl border border-accent/40 bg-accent-soft/60 p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-caption font-semibold uppercase tracking-wide text-[var(--accent-active)]">
              Próxima ação
            </p>
            <p className="mt-0.5 text-body font-semibold text-text">
              {client.nextActionAt
                ? `Agendada para ${displayDateTime(client.nextActionAt)}`
                : (suggestedAction ?? "Defina a próxima ação com o cliente")}
            </p>
          </div>
          {!client.nextActionAt && (
            <Button
              type="button"
              variant="accent"
              className="!min-h-10 shrink-0"
              onClick={() => setCreateTaskOpen(true)}
            >
              Criar tarefa
            </Button>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-x-5 gap-y-2.5 border-t border-border pt-4 sm:grid-cols-3">
          <Field label="Etapa atual">
            <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-caption font-semibold text-[var(--primary)]">
              {stageLabel}
            </span>
          </Field>
          <Field label="Cliente desde">{displayDate(client.convertedAt)}</Field>
          {conv?.propertyTitle && <Field label="Imóvel relacionado">{conv.propertyTitle}</Field>}
          <Field label="Última atividade">{displayDate(lastActivity)}</Field>
        </dl>

        <div className="flex flex-wrap gap-2">
          <a
            href={whatsappLink(client.whatsapp)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--success-soft)] px-4 text-body-sm font-semibold text-[var(--success-fg)] transition-colors hover:brightness-95"
          >
            Conversar no WhatsApp
          </a>
          <button
            type="button"
            onClick={() => setEditProfile(true)}
            className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-body-sm font-semibold text-text transition-colors hover:bg-surface-sunken"
          >
            Editar dados
          </button>
          <button
            type="button"
            onClick={() => setCreateTaskOpen(true)}
            className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-body-sm font-semibold text-text transition-colors hover:bg-surface-sunken"
          >
            Criar tarefa
          </button>
          <div className="relative" ref={moreRef}>
            <button
              type="button"
              aria-label="Mais ações"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((v) => !v)}
              className="inline-flex min-h-10 items-center rounded-md border border-border px-3 text-body-sm font-semibold text-text transition-colors hover:bg-surface-sunken"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="1.9" />
                <circle cx="12" cy="12" r="1.9" />
                <circle cx="19" cy="12" r="1.9" />
              </svg>
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-full z-20 mt-1.5 w-60 overflow-hidden rounded-xl border border-border bg-surface py-1.5 shadow-md">
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    setTab("privacidade");
                  }}
                  className="block w-full px-4 py-2.5 text-left text-body-sm text-text hover:bg-surface-sunken"
                >
                  Privacidade e consentimentos
                </button>
                {!client.deletionRequest && (
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      setDeletionOpen(true);
                    }}
                    className="block w-full px-4 py-2.5 text-left text-body-sm font-semibold text-[var(--danger-fg)] hover:bg-surface-sunken"
                  >
                    Solicitar exclusão de dados
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Navegação em abas: uma seção por vez, sem paredão de scroll */}
      <div className="sticky top-16 z-10 -mx-4 border-b border-border bg-bg/90 px-4 backdrop-blur-md sm:top-0">
        <div className="-mb-px flex gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setTab(s.id)}
              className={
                "shrink-0 whitespace-nowrap border-b-2 px-3.5 py-3 text-body-sm font-medium transition-colors " +
                (tab === s.id
                  ? "border-accent text-text"
                  : "border-transparent text-text-muted hover:text-text")
              }
            >
              {s.label}
              {s.id === "participantes" && client.participants.length > 0 && (
                <span className="ml-1.5 rounded-full bg-surface-sunken px-1.5 text-caption tabular-nums text-text-muted">
                  {client.participants.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Visão geral */}
      {tab === "visao-geral" && (
        <>
          <Card id="progresso" title="Progresso do atendimento">
            <ul className="flex flex-col divide-y divide-border/70">
              {progress.map((p) => (
                <li key={p.label} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-body-sm text-text">{p.label}</span>
                  <ProgressPill status={p.status} />
                </li>
              ))}
            </ul>
          </Card>

          <Card id="visao-geral" title="Visão geral">
            {conv ? (
              <dl className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
                <Field label="Motivo da conversão">{REASON_LABELS[conv.reason]}</Field>
                {conv.reasonDetail && <Field label="Detalhe">{conv.reasonDetail}</Field>}
                <Field label="Data da conversão">{displayDate(conv.convertedAt)}</Field>
                <Field label="Próxima etapa">{NEXT_STEP_LABELS[conv.nextStep]}</Field>
                <Field label="Finalidade">{PURPOSE_LABELS[conv.purpose]}</Field>
                <Field label="Imóvel relacionado">{conv.propertyTitle ?? "Nenhum"}</Field>
              </dl>
            ) : (
              <p className="text-body-sm text-text-muted">Sem dados de conversão.</p>
            )}
          </Card>
        </>
      )}

      {/* Dados pessoais: coleta progressiva, nada obrigatório */}
      {tab === "dados-pessoais" && (
      <Card
        id="dados-pessoais"
        title="Dados pessoais"
        action={
          <Button type="button" variant="ghost" className="!min-h-9 !px-3.5 text-body-sm" onClick={() => setEditProfile(true)}>
            {client.profile ? "Editar" : "Preencher"}
          </Button>
        }
      >
        <ProtectedNotice />
        {client.profile ? (
          <dl className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
            <Field label="CPF">{formatCpf(client.profile.cpf)}</Field>
            <Field label="RG">{client.profile.rg ?? "Não informado"}</Field>
            <Field label="Nascimento">{displayDateOnly(client.profile.birthDate)}</Field>
            <Field label="Estado civil">
              {client.profile.maritalStatus ? MARITAL_LABELS[client.profile.maritalStatus] : "Não informado"}
            </Field>
            <Field label="Nacionalidade">{client.profile.nationality ?? "Não informado"}</Field>
            <Field label="País de residência">{client.profile.residenceCountry ?? "Não informado"}</Field>
            <Field label="Endereço">
              {[
                client.profile.street,
                client.profile.addressNumber,
                client.profile.complement,
                client.profile.neighborhood,
                client.profile.city && client.profile.state
                  ? `${client.profile.city}/${client.profile.state}`
                  : client.profile.city ?? client.profile.state,
                formatCep(client.profile.cep),
              ]
                .filter(Boolean)
                .join(", ") || "Não informado"}
            </Field>
            <Field label="Telefone alternativo">{client.profile.altPhone ?? "Não informado"}</Field>
          </dl>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="text-body-sm text-text-muted">
              Nenhum dado pessoal registrado ainda. Preencha só o necessário para a etapa atual
              (nada aqui é obrigatório).
            </p>
            <Button type="button" variant="accent" className="!min-h-10" onClick={() => setEditProfile(true)}>
              Completar dados pessoais
            </Button>
          </div>
        )}
        {missingPersonal.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <p className="text-caption font-semibold uppercase tracking-wide text-text-subtle">
              Ainda faltam
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {missingPersonal.map((f) => (
                <span key={f} className="rounded-full bg-surface-sunken px-2.5 py-1 text-caption text-text-muted">
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>
      )}

      {/* Negociação: estado atual, editável */}
      {tab === "negociacao" && (
      <Card
        id="negociacao"
        title="Dados da negociação"
        action={
          <Button type="button" variant="ghost" className="!min-h-9 !px-3.5 text-body-sm" onClick={() => setEditNegotiation(true)}>
            {client.negotiation ? "Editar" : "Preencher"}
          </Button>
        }
      >
        <dl className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
          {conv && <Field label="Finalidade">{PURPOSE_LABELS[conv.purpose]}</Field>}
          {conv && <Field label="Imóvel relacionado">{conv.propertyTitle ?? "Nenhum"}</Field>}
          <Field label="Etapa atual">{stageLabel}</Field>
          {client.negotiation && (
            <>
              <Field label="Valor do imóvel">{formatMoney(client.negotiation.propertyValue)}</Field>
              <Field label="Data de interesse">{displayDateOnly(client.negotiation.interestDate)}</Field>
              <Field label="Prazo esperado">{client.negotiation.expectedTerm ?? "Não informado"}</Field>
              <Field label="Forma de pagamento">
                {client.negotiation.paymentMethod
                  ? PAYMENT_LABELS[client.negotiation.paymentMethod]
                  : "Não informado"}
              </Field>
              <Field label="Precisa de financiamento?">
                {client.negotiation.needsFinancing == null
                  ? "Não informado"
                  : client.negotiation.needsFinancing
                    ? "Sim"
                    : "Não"}
              </Field>
              {client.negotiation.notes && <Field label="Observações">{client.negotiation.notes}</Field>}
            </>
          )}
        </dl>
      </Card>
      )}

      {/* Financeiro (sensível) */}
      {tab === "financeiro" && (
      <Card
        id="financeiro"
        title="Dados financeiros"
        action={
          <Button type="button" variant="ghost" className="!min-h-9 !px-3.5 text-body-sm" onClick={() => setEditFinancial(true)}>
            {client.financial ? "Editar" : "Preencher"}
          </Button>
        }
      >
        <ProtectedNotice />
        {client.financial ? (
          <dl className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
            <Field label="Tipo de renda">
              {client.financial.incomeType ? INCOME_LABELS[client.financial.incomeType] : "Não informado"}
            </Field>
            <Field label="Renda mensal">{formatMoney(client.financial.monthlyIncome)}</Field>
            <Field label="Empresa ou atividade">{client.financial.occupation ?? "Não informado"}</Field>
            <Field label="Tempo de atividade">{client.financial.activityTime ?? "Não informado"}</Field>
            <Field label="Entrada disponível">{formatMoney(client.financial.downPayment)}</Field>
            <Field label="Possui FGTS">{boolLabel(client.financial.hasFgts)}</Field>
            <Field label="Composição de renda">{boolLabel(client.financial.hasIncomeComposition)}</Field>
            <Field label="Dependentes">
              {client.financial.dependentsCount != null ? String(client.financial.dependentsCount) : "Não informado"}
            </Field>
            <Field label="Instituição preferencial">{client.financial.preferredBank ?? "Não informado"}</Field>
            {client.financial.notes && <Field label="Observações">{client.financial.notes}</Field>}
          </dl>
        ) : (
          <div className="flex flex-col gap-2.5">
            <p className="text-body-sm text-text-muted">
              Nenhum dado financeiro registrado. Área sensível (LGPD): não aparece em listagens nem
              no Dashboard.
            </p>
          </div>
        )}
      </Card>
      )}

      {/* Participantes */}
      {tab === "participantes" && (
        <ParticipantsSection clientId={client.id} participants={client.participants} />
      )}

      {/* Timeline */}
      {tab === "timeline" && (
      <Card id="timeline" title="Linha do tempo">
        {client.activities.length === 0 ? (
          <p className="text-body-sm text-text-muted">Ainda não há registros nesta ficha.</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {client.activities.map((a) => (
              <li key={a.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-accent" />
                  <span className="mt-1 w-px flex-1 bg-border" />
                </div>
                <div className="min-w-0 pb-1">
                  <p className="text-body-sm font-semibold text-text">{ACTIVITY_LABELS[a.type]}</p>
                  <p className="text-body-sm text-text-muted">{a.description}</p>
                  <p className="mt-0.5 text-caption tabular-nums text-text-subtle">
                    {displayDateTime(a.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
      )}

      {/* Privacidade e consentimentos */}
      {tab === "privacidade" && (
      <Card id="privacidade" title="Privacidade e consentimentos">
        <ProtectedNotice />
        <p className="text-body-sm text-text-muted">
          Finalidade: atendimento imobiliário, análise, proposta, financiamento ou locação, conforme
          a etapa. Coletamos apenas o necessário para essa finalidade.
        </p>
        {client.consents.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2">
            {client.consents.map((c) => (
              <li key={c.id} className="rounded-xl border border-border bg-surface-sunken/50 p-3">
                <p className="text-body-sm font-medium text-text">Ciência sobre coleta de dados adicionais</p>
                <p className="mt-0.5 text-caption text-text-muted">
                  Registrado em {displayDateTime(c.acceptedAt)} · versão {c.textVersion}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-body-sm text-text-muted">Nenhum consentimento registrado ainda.</p>
        )}
        {client.deletionRequest && (
          <div className="mt-3 rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] p-3">
            <p className="text-body-sm font-semibold text-[var(--danger-fg)]">
              Exclusão de dados: {DELETION_STATUS_LABELS[client.deletionRequest.status]}
            </p>
            <p className="mt-0.5 text-caption text-text-muted">
              Solicitada em {displayDateTime(client.deletionRequest.requestedAt)}
              {client.deletionRequest.reason ? ` · ${client.deletionRequest.reason}` : ""}
            </p>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={() => setEditProfile(true)}
            className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-body-sm font-semibold text-text transition-colors hover:bg-surface-sunken"
          >
            Corrigir dados
          </button>
          {!client.deletionRequest && (
            <button
              type="button"
              onClick={() => setDeletionOpen(true)}
              className="inline-flex min-h-10 items-center rounded-md border border-[var(--danger)] px-4 text-body-sm font-semibold text-[var(--danger-fg)] transition-colors hover:bg-[var(--danger-soft)]"
            >
              Solicitar exclusão de dados
            </button>
          )}
        </div>
      </Card>
      )}

      {editProfile && (
        <ProfileFormModal
          clientId={client.id}
          profile={client.profile}
          onClose={() => setEditProfile(false)}
        />
      )}
      {editNegotiation && (
        <NegotiationFormModal
          clientId={client.id}
          negotiation={client.negotiation}
          onClose={() => setEditNegotiation(false)}
        />
      )}
      {editFinancial && (
        <FinancialFormModal
          clientId={client.id}
          financial={client.financial}
          onClose={() => setEditFinancial(false)}
        />
      )}
      {deletionOpen && (
        <DeletionDialog
          clientId={client.id}
          clientName={client.fullName}
          onClose={() => setDeletionOpen(false)}
        />
      )}
      {createTaskOpen && (
        <EventFormModal
          type="tarefa"
          lockedLead={{ id: client.id, fullName: client.fullName }}
          prefill={{ title: suggestedAction ?? undefined }}
          onClose={() => setCreateTaskOpen(false)}
        />
      )}
    </div>
  );
}

function Card({
  id,
  title,
  action,
  children,
}: {
  id: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="animate-rise scroll-mt-20 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-label uppercase tracking-wide text-text-subtle">{title}</h2>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-caption text-text-subtle">{label}</dt>
      <dd className="text-body-sm text-text">{children}</dd>
    </div>
  );
}

function ProgressPill({ status }: { status: "concluido" | "pendente" | "nao_iniciado" }) {
  const map = {
    concluido: { label: "Concluído", cls: "bg-[var(--success-soft)] text-[var(--success-fg)]" },
    pendente: { label: "Pendente", cls: "bg-[var(--accent-soft)] text-[var(--accent-active)]" },
    nao_iniciado: { label: "Não iniciado", cls: "bg-surface-sunken text-text-subtle" },
  }[status];
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-caption font-semibold ${map.cls}`}>
      {map.label}
    </span>
  );
}

/** Aviso discreto de área com dados sensíveis (LGPD). */
function ProtectedNotice() {
  return (
    <div className="mb-3 flex items-start gap-2 rounded-xl bg-surface-sunken px-3 py-2.5">
      <svg className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="5" y="10.5" width="14" height="9.5" rx="2" stroke="currentColor" strokeWidth="1.7" />
        <path d="M8 10.5V8a4 4 0 018 0v2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
      <p className="text-caption text-text-muted">
        Área protegida. Contém dados pessoais e financeiros; colete apenas o necessário para o
        atendimento.
      </p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="mx-auto max-w-3xl" role="status" aria-label="Carregando ficha do cliente">
      <div className="h-40 animate-pulse rounded-2xl bg-surface-sunken" />
      <div className="mt-5 h-32 animate-pulse rounded-2xl bg-surface-sunken" />
    </div>
  );
}
