import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import {
  LEAD_INTENTS,
  LEAD_SOURCES,
  normalizeWhatsapp,
  type CreateLeadDto,
  type LeadIntent,
  type LeadSource,
  type LeadSummary,
} from "@nexlar/shared";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/ui/TextField";
import { Banner } from "../../components/ui/Banner";
import { ApiError } from "../../lib/http";
import { maskPhone, onlyDigits } from "../../lib/masks";
import { createLead, duplicateLeadFrom } from "./api";
import { INTENT_LABELS, SOURCE_LABELS, displayCreatedAt, displayWhatsapp } from "./labels";

/**
 * Cadastro rápido de lead (J1): a tela mais importante do produto.
 * Só nome e WhatsApp são obrigatórios; origem e interesse são chips de um
 * toque; o resto fica atrás de "Mais detalhes" para não virar burocracia.
 */

const formSchema = z.object({
  fullName: z.string().trim().min(2, "Informe o nome").max(160),
  whatsapp: z.string().refine((v) => {
    const d = normalizeWhatsapp(v);
    return d.length >= 10 && d.length <= 13;
  }, "Informe um WhatsApp válido com DDD"),
  email: z
    .string()
    .trim()
    .email("Informe um e-mail válido")
    .optional()
    .or(z.literal("")),
  region: z.string().trim().max(160).optional(),
  budgetMin: z.string().optional(),
  budgetMax: z.string().optional(),
  notes: z.string().trim().max(2000).optional(),
});

type FormValues = z.infer<typeof formSchema>;

const EMPTY: FormValues = {
  fullName: "",
  whatsapp: "",
  email: "",
  region: "",
  budgetMin: "",
  budgetMax: "",
  notes: "",
};

function parseBudget(value?: string): number | undefined {
  const digits = onlyDigits(value ?? "");
  return digits ? Number(digits) : undefined;
}

/** Exibe 500000 como 500.000 enquanto digita. */
function maskMoney(value: string): string {
  const digits = onlyDigits(value).slice(0, 12);
  return digits ? Number(digits).toLocaleString("pt-BR") : "";
}

function ChipGroup<T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T | null;
  onChange: (v: T | null) => void;
}) {
  return (
    <fieldset>
      <legend className="flex items-baseline justify-between gap-2 text-label text-text">
        <span>{label}</span>
        <span className="font-normal text-caption text-text-subtle">opcional</span>
      </legend>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {options.map((option) => {
          const active = value === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? null : option)}
              className={
                "min-h-9 rounded-full border px-3.5 text-body-sm font-medium transition-colors duration-fast " +
                (active
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border bg-surface text-text-muted hover:bg-surface-sunken")
              }
            >
              {labels[option]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function NewLeadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [source, setSource] = useState<LeadSource | null>(null);
  const [intent, setIntent] = useState<LeadIntent | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [created, setCreated] = useState<LeadSummary | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: EMPTY });

  const mutation = useMutation({
    mutationFn: createLead,
    onSuccess: (lead) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setCreated(lead);
    },
  });

  const resetAll = () => {
    reset(EMPTY);
    setSource(null);
    setIntent(null);
    setShowDetails(false);
    setCreated(null);
    mutation.reset();
  };

  const close = () => {
    resetAll();
    onClose();
  };

  const onSubmit = (values: FormValues) => {
    const dto: CreateLeadDto = {
      fullName: values.fullName,
      whatsapp: normalizeWhatsapp(values.whatsapp),
      email: values.email || undefined,
      source: source ?? undefined,
      intent: intent ?? undefined,
      region: values.region || undefined,
      budgetMin: parseBudget(values.budgetMin),
      budgetMax: parseBudget(values.budgetMax),
      notes: values.notes || undefined,
    };
    mutation.mutate(dto);
  };

  const duplicate = duplicateLeadFrom(mutation.error);
  const genericError =
    mutation.error && !duplicate
      ? mutation.error instanceof ApiError && mutation.error.status !== 500
        ? mutation.error.message
        : "Não foi possível cadastrar agora. Tente novamente."
      : null;

  const goToLeads = () => {
    close();
    navigate("/leads");
  };

  return (
    <Modal open={open} onClose={close} title={created ? "Lead cadastrado" : "Novo lead"}>
      {created ? (
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--success-soft)] text-[var(--success-fg)]">
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="mt-4 text-body font-semibold text-text">{created.fullName}</p>
          <p className="mt-0.5 text-body-sm text-text-muted">{displayWhatsapp(created.whatsapp)}</p>
          <p className="mt-3 text-body-sm text-text-muted">
            Já está na sua lista como <span className="font-semibold text-text">novo</span>. A
            próxima ação é fazer o primeiro contato.
          </p>
          <div className="mt-6 flex w-full flex-col gap-2.5">
            <Button type="button" variant="accent" fullWidth onClick={resetAll}>
              Cadastrar outro
            </Button>
            <Button type="button" variant="ghost" fullWidth onClick={goToLeads}>
              Ver leads
            </Button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="-mx-1 flex max-h-[calc(100dvh-11rem)] flex-col gap-5 overflow-y-auto px-1 pb-1 sm:max-h-[calc(100dvh-14rem)]"
        >
          {duplicate && (
            <Banner variant="info">
              Você já cadastrou <strong>{duplicate.fullName}</strong> com esse WhatsApp (
              {displayCreatedAt(duplicate.createdAt).toLowerCase()}).{" "}
              <button
                type="button"
                onClick={goToLeads}
                className="font-semibold text-accent underline-offset-2 hover:underline"
              >
                Abrir na lista
              </button>
            </Banner>
          )}
          {genericError && <Banner variant="danger">{genericError}</Banner>}

          <TextField
            label="Nome"
            autoComplete="off"
            placeholder="Nome do contato"
            autoFocus
            error={errors.fullName?.message}
            {...register("fullName")}
          />

          <TextField
            label="WhatsApp"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="(11) 98888-7766"
            error={errors.whatsapp?.message}
            {...register("whatsapp", {
              onChange: (e) => {
                e.target.value = maskPhone(e.target.value);
                if (mutation.error) mutation.reset();
              },
            })}
          />

          <ChipGroup
            label="Origem"
            options={LEAD_SOURCES}
            labels={SOURCE_LABELS}
            value={source}
            onChange={setSource}
          />

          <ChipGroup
            label="Interesse"
            options={LEAD_INTENTS}
            labels={INTENT_LABELS}
            value={intent}
            onChange={setIntent}
          />

          {!showDetails ? (
            <button
              type="button"
              onClick={() => setShowDetails(true)}
              className="self-start text-body-sm font-semibold text-accent transition-colors hover:text-accent-hover"
            >
              Mais detalhes (opcional)
            </button>
          ) : (
            <div className="flex flex-col gap-5">
              <TextField
                label="E-mail"
                type="email"
                inputMode="email"
                optionalLabel="opcional"
                placeholder="contato@email.com"
                error={errors.email?.message}
                {...register("email")}
              />
              <TextField
                label="Região de interesse"
                optionalLabel="opcional"
                placeholder="Bairro ou cidade"
                {...register("region")}
              />
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Valor de"
                  inputMode="numeric"
                  optionalLabel="R$"
                  placeholder="300.000"
                  {...register("budgetMin", {
                    onChange: (e) => {
                      e.target.value = maskMoney(e.target.value);
                    },
                  })}
                />
                <TextField
                  label="até"
                  inputMode="numeric"
                  optionalLabel="R$"
                  placeholder="500.000"
                  {...register("budgetMax", {
                    onChange: (e) => {
                      e.target.value = maskMoney(e.target.value);
                    },
                  })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="lead-notes" className="flex items-baseline justify-between gap-2 text-label text-text">
                  <span>Observações</span>
                  <span className="font-normal text-caption text-text-subtle">opcional</span>
                </label>
                <textarea
                  id="lead-notes"
                  rows={3}
                  placeholder="Anote o que foi conversado"
                  className="w-full rounded-md border border-border bg-surface px-3.5 py-2.5 text-body text-text placeholder:text-text-subtle transition-colors duration-fast focus-visible:border-[var(--border-focus)] focus-visible:shadow-focus"
                  {...register("notes")}
                />
              </div>
            </div>
          )}

          <Button
            type="submit"
            variant="accent"
            fullWidth
            loading={mutation.isPending}
            className="mt-1"
            onClick={() => {
              if (errors.fullName) setFocus("fullName");
            }}
          >
            {mutation.isPending ? "Salvando..." : "Salvar lead"}
          </Button>
        </form>
      )}
    </Modal>
  );
}
