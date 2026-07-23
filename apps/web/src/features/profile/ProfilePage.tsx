import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { updateProfileSchema, type UpdateProfileDto } from "@nexlar/shared";
import { Button } from "../../components/ui/Button";
import { Banner } from "../../components/ui/Banner";
import { TextField } from "../../components/ui/TextField";
import { useAuth } from "../auth/AuthContext";
import { initials } from "../../lib/name";
import { updateMe } from "./api";

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

  // TODO(backend): o status real da validação do CRECI virá do servidor
  // (broker.creciStatus), na fatia de onboarding. Até lá, "pendente", que é o
  // estado logo após o cadastro.
  const status = "pendente" as CreciStatus;

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

      {/* Dados de contato: a única parte que o corretor edita. */}
      <ContactCard />

      {/* Registro profissional: leitura. O CRECI passa por validação, então
          não se edita por aqui. */}
      <Card title="Registro profissional">
        <Field label="Número do CRECI" value={broker.creci ?? "Não informado"} />
        <Field label="Status da validação" value={STATUS_LABEL[status]} />
      </Card>
    </div>
  );
}

/** Dados de contato com edição em linha, salvos no PATCH /brokers/me. */
function ContactCard() {
  const { broker, atualizarBroker } = useAuth();
  const [editando, setEditando] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateProfileDto>({
    resolver: zodResolver(updateProfileSchema),
    values: {
      fullName: broker?.fullName ?? "",
      phone: broker?.phone ?? "",
      agencyName: broker?.agencyName ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: updateMe,
    onSuccess: (atualizado) => {
      atualizarBroker(atualizado);
      setEditando(false);
    },
  });

  const cancelar = () => {
    reset();
    mutation.reset();
    setEditando(false);
  };

  if (!broker) return null;

  if (!editando) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-h3 text-text">Dados de contato</h3>
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="text-body-sm font-semibold text-accent transition-colors hover:text-accent-hover"
          >
            Editar
          </button>
        </div>
        <dl className="flex flex-col divide-y divide-border">
          <Field label="Nome completo" value={broker.fullName} />
          {/* E-mail não entra na edição: trocar sem reconfirmar quebraria o
              gate. Fica visível, sem ação. */}
          <Field label="E-mail" value={broker.email} />
          <Field label="Telefone" value={broker.phone ?? "Não informado"} />
          <Field label="Imobiliária" value={broker.agencyName ?? "Não informada"} />
        </dl>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
      <h3 className="mb-4 text-h3 text-text">Dados de contato</h3>
      <form
        onSubmit={handleSubmit((data) => mutation.mutate(data))}
        noValidate
        className="flex flex-col gap-4"
      >
        {mutation.isError && (
          <Banner variant="danger">
            Não foi possível salvar agora. Tente novamente em instantes.
          </Banner>
        )}

        <TextField
          label="Nome completo"
          autoComplete="name"
          error={errors.fullName?.message}
          {...register("fullName")}
        />
        <TextField
          label="Telefone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(11) 90000-0000"
          error={errors.phone?.message}
          {...register("phone")}
        />
        <TextField
          label="Imobiliária"
          placeholder="Opcional"
          error={errors.agencyName?.message}
          {...register("agencyName")}
        />

        {/* E-mail fora do formulário, só para referência. */}
        <p className="text-caption text-text-subtle">
          E-mail: <span className="font-semibold text-text-muted">{broker.email}</span>
        </p>

        <div className="mt-1 flex gap-3">
          <Button type="submit" variant="accent" loading={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
          <Button type="button" variant="ghost" onClick={cancelar} disabled={mutation.isPending}>
            Cancelar
          </Button>
        </div>
      </form>
    </section>
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
