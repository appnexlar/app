import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Banner } from "../../components/ui/Banner";
import { useAuth } from "../auth/AuthContext";
import { initials } from "../../lib/name";

/**
 * Status de validação do CRECI. O corretor NÃO altera o próprio status:
 * quem aprova/recusa é um administrador (painel virá depois).
 * TODO(backend): ler o status real de broker.crecistatus + o motivo da recusa.
 */
type CreciStatus = "nao_enviado" | "pendente" | "aprovado" | "recusado";

const STATUS_LABEL: Record<CreciStatus, string> = {
  nao_enviado: "Não enviado",
  pendente: "Pendente de validação",
  aprovado: "Aprovado",
  recusado: "Recusado",
};

export function ProfilePage() {
  const { broker } = useAuth();

  // Prévia temporária do status (o real virá do backend). Começa em pendente,
  // que é o estado logo após o cadastro.
  const [status, setStatus] = useState<CreciStatus>("pendente");

  if (!broker) return null;

  const validated = status === "aprovado";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      {/* Cartão de identidade. */}
      <section className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <span className="flex h-16 w-16 flex-none items-center justify-center rounded-full bg-primary text-h3 font-bold text-primary-on">
          {broker.avatarUrl ? (
            <img src={broker.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
          ) : (
            initials(broker.fullName)
          )}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-h2 text-text">{broker.fullName}</h2>
            {validated && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-caption font-bold text-[var(--success-fg)]">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Corretor validado
              </span>
            )}
          </div>
          <p className="truncate text-body-sm text-text-muted">{broker.email}</p>
        </div>
      </section>

      {/* Status da validação. */}
      <StatusCard status={status} />

      {/* Dados de contato. */}
      <Card title="Dados de contato">
        <Field label="Nome completo" value={broker.fullName} />
        <Field label="E-mail" value={broker.email} />
        <Field label="Telefone" value={broker.phone ?? "Não informado"} />
        <Field label="Imobiliária" value={broker.agencyName ?? "Não informada"} />
      </Card>

      {/* Registro profissional. */}
      <Card title="Registro profissional">
        <Field label="Número do CRECI" value={broker.creci ?? "Não informado"} />
        {/* TODO(backend): estado do CRECI virá de broker.creciUf. */}
        <Field label="Estado do CRECI" value="—" />
        <Field label="Status da validação" value={STATUS_LABEL[status]} />
      </Card>

      {/* Prévia temporária do status (removível com o backend). */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border-strong bg-surface-sunken px-3 py-2">
        <span className="text-caption font-semibold uppercase tracking-wide text-text-subtle">
          Prévia do status (temporário)
        </span>
        <div className="inline-flex rounded-full bg-surface p-1 shadow-xs">
          {(["pendente", "aprovado", "recusado"] as CreciStatus[]).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatus(st)}
              aria-pressed={status === st}
              className={
                "rounded-full px-3 py-1 text-caption font-semibold transition-colors " +
                (status === st ? "bg-primary text-primary-on shadow-xs" : "text-text-muted hover:text-text")
              }
            >
              {STATUS_LABEL[st]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusCard({ status }: { status: CreciStatus }) {
  if (status === "aprovado") {
    return (
      <Banner variant="info">
        Seu CRECI foi validado. O selo de corretor validado está ativo no seu
        perfil.
      </Banner>
    );
  }
  if (status === "recusado") {
    return (
      <div className="rounded-xl border border-danger bg-danger-soft p-5">
        <div className="flex items-start gap-3">
          <svg className="mt-0.5 h-5 w-5 flex-none text-[var(--danger-fg)]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 7.5v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="12" cy="16" r="1" fill="currentColor" />
          </svg>
          <div>
            <p className="text-body-sm font-semibold text-[var(--danger-fg)]">
              Não foi possível validar o CRECI informado. Revise os dados e envie
              novamente.
            </p>
            <p className="mt-1 text-caption text-[var(--danger-fg)]">
              Motivo: número não localizado no conselho informado.
            </p>
            <Button variant="accent" type="button" className="mt-3" disabled>
              Editar dados e reenviar
            </Button>
          </div>
        </div>
      </div>
    );
  }
  // pendente / não enviado
  return (
    <Banner variant="info">
      Seu cadastro foi realizado. Estamos verificando seus dados profissionais.
      Você já pode usar o Nexlar enquanto isso.
    </Banner>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
      <h3 className="mb-4 text-h3 text-text">{title}</h3>
      <dl className="flex flex-col divide-y divide-border">{children}</dl>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <dt className="text-body-sm text-text-muted">{label}</dt>
      <dd className="text-right text-body-sm font-semibold text-text">{value}</dd>
    </div>
  );
}
