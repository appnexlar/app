import { useState } from "react";
import type { ClientDetail } from "@nexlar/shared";
import { Button } from "../../components/ui/Button";
import { FinancialFormModal, NegotiationFormModal, ProfileFormModal } from "./ClientEditModals";
import { ParticipantsSection } from "./ClientParticipants";
import { DeletionDialog } from "./DeletionDialog";
import { ConsentDialog } from "./ConsentDialog";
import {
  DELETION_STATUS_LABELS,
  INCOME_LABELS,
  MARITAL_LABELS,
  PAYMENT_LABELS,
  PURPOSE_LABELS,
  STAGE_LABELS,
  boolLabel,
  displayDateOnly,
  displayDateTime,
  formatCep,
  formatCpf,
  formatMoney,
} from "./labels";

const SECTIONS = [
  { id: "dados-pessoais", label: "Dados pessoais" },
  { id: "negociacao", label: "Negociação" },
  { id: "financeiro", label: "Financeiro" },
  { id: "participantes", label: "Participantes" },
  { id: "privacidade", label: "Privacidade" },
];

/** Etapas em que a negociação pede dados que antes não faziam falta. */
const ETAPAS_QUE_PEDEM_DADOS = new Set(["imovel_prioritario", "aguardando_decisao", "fechado"]);

/**
 * Os dados complementares da pessoa (entidade única, set 2026): pessoais,
 * negociação, financeiro, participantes e privacidade. Vive na ficha de todo
 * mundo, abaixo da timeline, em qualquer etapa.
 *
 * Etapa 5: ao entrar em negociação ou fechar, um painel lista o que falta
 * para esta etapa e leva direto ao formulário certo. Nada ali trava a etapa.
 * O primeiro dado pessoal ou financeiro passa antes pela ciência da coleta
 * (LGPD), registrada uma vez só; a API recusa o dado sem ela.
 */
export function ClientDataSections({ client }: { client: ClientDetail }) {
  const [editProfile, setEditProfile] = useState(false);
  const [editNegotiation, setEditNegotiation] = useState(false);
  const [editFinancial, setEditFinancial] = useState(false);
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [tab, setTab] = useState("dados-pessoais");
  const [consentGate, setConsentGate] = useState<{ depois: () => void } | null>(null);
  const conv = client.conversion;
  const stageLabel = conv ? STAGE_LABELS[conv.nextStep] : "Em atendimento";

  const temCiencia = client.consents.some((c) => c.purpose === "coleta_dados_adicionais");
  /** Abre um formulário protegido; sem ciência registrada, pede a ciência antes. */
  const protegido = (abrir: () => void) => {
    if (temCiencia) abrir();
    else setConsentGate({ depois: abrir });
  };

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

  // O que esta etapa pede e ainda não tem. Cada item leva ao formulário certo.
  const pendencias: { key: string; titulo: string; detalhe: string; abrir: () => void }[] = [];
  if (ETAPAS_QUE_PEDEM_DADOS.has(client.status)) {
    if (!temCiencia) {
      pendencias.push({
        key: "ciencia",
        titulo: "Ciência da coleta de dados",
        detalhe: "Antes do primeiro dado pessoal. Leva um minuto na conversa.",
        abrir: () => setConsentGate({ depois: () => undefined }),
      });
    }
    if (missingPersonal.length > 0) {
      const primeiros = missingPersonal.slice(0, 3).join(", ");
      const resto = missingPersonal.length - 3;
      pendencias.push({
        key: "pessoais",
        titulo: "Dados pessoais",
        detalhe: resto > 0 ? `${primeiros} e mais ${resto}` : primeiros,
        abrir: () => {
          setTab("dados-pessoais");
          protegido(() => setEditProfile(true));
        },
      });
    }
    if (!client.negotiation) {
      pendencias.push({
        key: "negociacao",
        titulo: "Dados da negociação",
        detalhe: "Valor, forma de pagamento e se vai precisar de financiamento.",
        abrir: () => {
          setTab("negociacao");
          setEditNegotiation(true);
        },
      });
    }
    if (client.negotiation?.needsFinancing === true && !client.financial) {
      pendencias.push({
        key: "financeiro",
        titulo: "Dados financeiros",
        detalhe: "Renda, entrada e FGTS, porque a negociação vai passar pelo banco.",
        abrir: () => {
          setTab("financeiro");
          protegido(() => setEditFinancial(true));
        },
      });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {pendencias.length > 0 && (
        <section
          aria-labelledby="faltam-dados"
          className="animate-rise rounded-lg border border-[var(--accent)] bg-accent-soft p-4 sm:p-5"
        >
          <h2 id="faltam-dados" className="text-label font-semibold text-text">
            Faltam estes dados
          </h2>
          <p className="mt-0.5 text-caption text-text-muted">
            Para a etapa {client.status === "fechado" ? "de fechamento" : "de negociação"}. Nada aqui
            trava o atendimento.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {pendencias.map((p) => (
              <li key={p.key}>
                <button
                  type="button"
                  onClick={p.abrir}
                  className="flex w-full items-center justify-between gap-3 rounded-lg bg-surface px-3.5 py-3 text-left shadow-sm transition-colors hover:bg-surface-sunken"
                >
                  <span className="min-w-0">
                    <span className="block text-body-sm font-semibold text-text">{p.titulo}</span>
                    <span className="block truncate text-caption text-text-muted">{p.detalhe}</span>
                  </span>
                  <span className="shrink-0 text-body-sm font-semibold text-[var(--accent)]">Preencher</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

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

      {/* Dados pessoais: coleta progressiva, nada obrigatório */}
      {tab === "dados-pessoais" && (
      <Card
        id="dados-pessoais"
        title="Dados pessoais"
        action={
          <Button type="button" variant="ghost" className="!min-h-9 !px-3.5 text-body-sm" onClick={() => protegido(() => setEditProfile(true))}>
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
            <Button type="button" variant="accent" className="!min-h-10" onClick={() => protegido(() => setEditProfile(true))}>
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
      <>
      {/* A coleta pelo cliente mora junto dos dados financeiros: é daqui que
          o corretor pede renda, entrada e FGTS pelo link seguro (docs/09). */}
      {/* O bloco de financiamento já aparece acima, na ficha; aqui só o que é da aba. */}
      <Card
        id="financeiro"
        title="Dados financeiros"
        action={
          <Button type="button" variant="ghost" className="!min-h-9 !px-3.5 text-body-sm" onClick={() => protegido(() => setEditFinancial(true))}>
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
      </>
      )}

      {/* Participantes */}
      {tab === "participantes" && (
        <ParticipantsSection clientId={client.id} participants={client.participants} onBeforeAdd={protegido} />
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
              <li key={c.id} className="rounded-lg border border-border bg-surface-sunken/50 p-3">
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
          <div className="mt-3 rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] p-3">
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
            onClick={() => protegido(() => setEditProfile(true))}
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
      {consentGate && (
        <ConsentDialog
          clientId={client.id}
          clientName={client.fullName}
          onClose={() => setConsentGate(null)}
          onRegistered={() => {
            const { depois } = consentGate;
            setConsentGate(null);
            depois();
          }}
        />
      )}
      {deletionOpen && (
        <DeletionDialog
          clientId={client.id}
          clientName={client.fullName}
          onClose={() => setDeletionOpen(false)}
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
    <section id={id} className="animate-rise scroll-mt-20 rounded-lg border border-border bg-surface p-5 shadow-sm">
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

/** Aviso discreto de área com dados sensíveis (LGPD). */
function ProtectedNotice() {
  return (
    <div className="mb-3 flex items-start gap-2 rounded-lg bg-surface-sunken px-3 py-2.5">
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

