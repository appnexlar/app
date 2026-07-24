import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { isValidCnpj, isValidCpf, registerSchema } from "@nexlar/shared";
import { Button } from "../../../components/ui/Button";
import { TextField } from "../../../components/ui/TextField";
import { PasswordField } from "../../../components/ui/PasswordField";
import { GoogleButton } from "../../../components/ui/GoogleButton";
import { Checkbox } from "../../../components/ui/Checkbox";
import { Banner } from "../../../components/ui/Banner";
import { AuthLayout, OrDivider } from "../AuthLayout";
import { useGoogleAuth } from "../useGoogleAuth";
import { useAuth } from "../AuthContext";
import { authErrorMessage, register as registerAccount } from "../api";
import {
  maskCnpj,
  maskCpf,
  maskPhone,
  onlyDigits,
} from "../../../lib/masks";
import { PLANS, formatBRL, type Plan, type PlanId } from "./plans";

/**
 * Cadastro do corretor em 4 etapas: conta, perfil profissional, escolha do
 * plano e confirmação. Não há cobrança nem coleta de dados de cartão: o
 * gateway entra numa fatia futura, com campo hospedado pelo provedor.
 *
 * O CRECI não entra aqui de propósito. Ele é opcional e serve para ganhar o
 * selo de corretor verificado, que a lead vê na página pública do imóvel.
 * Exigir carteira e documento na porta de entrada afasta quem só quer
 * experimentar o sistema. Quem quiser o selo envia depois, em Perfil.
 *
 * TODO(backend): persistir cpf/cnpj e plano escolhido quando a API ganhar
 * esses campos. Hoje a API grava nome, e-mail, senha, WhatsApp e imobiliária.
 */

// --- Schemas por etapa ------------------------------------------------------

const accountSchema = z
  .object({
    fullName: registerSchema.shape.fullName,
    email: registerSchema.shape.email,
    password: registerSchema.shape.password,
    confirmPassword: z.string().min(1, "Confirme a senha"),
    acceptTerms: z.boolean(),
    marketingOptIn: z.boolean(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  })
  .refine((data) => data.acceptTerms === true, {
    message: "Aceite os Termos e a Política para continuar.",
    path: ["acceptTerms"],
  });
type AccountValues = z.infer<typeof accountSchema>;

// TODO(backend): mover para @nexlar/shared junto com a fatia que persiste.
const profileSchema = z
  .object({
    phone: z.string().refine((v) => {
      const n = onlyDigits(v).length;
      return n === 10 || n === 11;
    }, "Informe um WhatsApp válido com DDD"),
    personType: z.enum(["cpf", "cnpj"]),
    document: z.string().min(1, "Informe o documento"),
    agencyName: z.string().max(160).optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    // Confere os dígitos verificadores, não só o tamanho: documento
    // inventado que passa aqui vira problema no contrato lá na frente.
    if (data.personType === "cpf" && !isValidCpf(data.document)) {
      ctx.addIssue({ code: "custom", path: ["document"], message: "CPF inválido. Confira os números." });
    }
    if (data.personType === "cnpj" && !isValidCnpj(data.document)) {
      ctx.addIssue({ code: "custom", path: ["document"], message: "CNPJ inválido. Confira os números." });
    }
  });
type ProfileValues = z.infer<typeof profileSchema>;


// --- Assistente -------------------------------------------------------------

const STEP_TITLES: { title: string; subtitle: string }[] = [
  { title: "Criar sua conta", subtitle: "Comece em poucos minutos." },
  { title: "Seu perfil profissional", subtitle: "Conte quem você é como corretor." },
  { title: "Escolha seu plano", subtitle: "Sem fidelidade. Cancele quando quiser." },
  { title: "Confirmar plano", subtitle: "Revise e conclua seu cadastro." },
];

export function RegisterWizard() {
  const [step, setStep] = useState(0);
  const [account, setAccount] = useState<AccountValues | null>(null);
  const [profile, setProfile] = useState<ProfileValues | null>(null);
  const [planId, setPlanId] = useState<PlanId>("anual");

  const { signIn } = useAuth();
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: registerAccount,
    onSuccess: (session) => {
      // Quem diz se o e-mail está confirmado é o servidor, em
      // session.broker.emailVerified. Conta recém-criada vem com false, então
      // o ProtectedRoute manda para o gate sozinho.
      signIn(session);
      navigate("/confirmar-email", { replace: true });
    },
  });

  const finish = () => {
    if (!account || !profile) return;
    // TODO(backend): enviar também personType/document e planId quando a API
    // ganhar esses campos. O aceite dos termos e o opt-in já vão.
    mutation.mutate({
      fullName: account.fullName,
      email: account.email,
      password: account.password,
      phone: profile.phone,
      agencyName: profile.agencyName ?? "",
      acceptTerms: account.acceptTerms as true,
      marketingOptIn: account.marketingOptIn,
    });
  };

  const plan = PLANS.find((p) => p.id === planId) ?? PLANS[0];
  const { title, subtitle } = STEP_TITLES[step];

  return (
    <AuthLayout>
      {/* Progresso. */}
      <div className="mb-6">
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="mb-4 inline-flex items-center gap-1.5 text-body-sm font-semibold text-text-muted transition-colors hover:text-text"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Voltar
          </button>
        )}
        <p className="text-caption font-semibold uppercase tracking-wide text-text-subtle">
          Etapa {step + 1} de 4
        </p>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-sunken">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-base ease-standard"
            style={{ width: `${((step + 1) / 4) * 100}%` }}
          />
        </div>
      </div>

      <header className="mb-7">
        <h1 className="text-h1 text-text">{title}</h1>
        <p className="mt-1.5 text-body text-text-muted">{subtitle}</p>
      </header>

      {step === 0 && (
        <AccountStep
          defaults={account}
          onNext={(values) => {
            setAccount(values);
            setStep(1);
          }}
        />
      )}
      {step === 1 && (
        <ProfileStep
          defaults={profile}
          onNext={(values) => {
            setProfile(values);
            setStep(2);
          }}
        />
      )}
      {step === 2 && (
        <PlanStep selected={planId} onSelect={setPlanId} onNext={() => setStep(3)} />
      )}
      {step === 3 && (
        <PaymentStep
          plan={plan}
          submitting={mutation.isPending}
          errorMessage={authErrorMessage(mutation.error, "register")}
          onFinish={finish}
        />
      )}
    </AuthLayout>
  );
}

// --- Etapa 1: conta ---------------------------------------------------------

function AccountStep({
  defaults,
  onNext,
}: {
  defaults: AccountValues | null;
  onNext: (values: AccountValues) => void;
}) {
  const { startGoogleAuth, pendingNotice } = useGoogleAuth();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AccountValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: defaults ?? {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
      acceptTerms: false,
      marketingOptIn: false,
    },
  });

  return (
    <>
      <div className="flex flex-col gap-3">
        <GoogleButton label="Criar conta com o Google" onClick={startGoogleAuth} />
        {pendingNotice && (
          <Banner variant="info">
            A criação com Google fica pronta junto com a autenticação. Por
            enquanto, cadastre-se com seu e-mail.
          </Banner>
        )}
      </div>

      <OrDivider />

      <form onSubmit={handleSubmit(onNext)} noValidate className="flex flex-col gap-5">
        <TextField
          label="Nome completo"
          autoComplete="name"
          placeholder="Como você se chama"
          autoFocus
          error={errors.fullName?.message}
          {...register("fullName")}
        />
        <TextField
          label="E-mail"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="voce@imobiliaria.com.br"
          error={errors.email?.message}
          {...register("email")}
        />
        <PasswordField
          label="Senha"
          autoComplete="new-password"
          placeholder="Crie uma senha"
          hint="Mínimo de 8 caracteres, com ao menos uma letra e um número."
          error={errors.password?.message}
          {...register("password")}
        />
        <PasswordField
          label="Confirmar senha"
          autoComplete="new-password"
          placeholder="Repita a senha"
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />

        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <Checkbox
            label={
              <>
                Li e aceito os{" "}
                <a href="/termos" target="_blank" rel="noopener noreferrer" className="font-semibold text-accent hover:text-accent-hover">
                  Termos de Uso
                </a>{" "}
                e a{" "}
                <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="font-semibold text-accent hover:text-accent-hover">
                  Política de Privacidade
                </a>
                .
              </>
            }
            error={errors.acceptTerms?.message}
            {...register("acceptTerms")}
          />
          <Checkbox
            label="Quero receber novidades e dicas do Nexlar por e-mail (opcional)."
            {...register("marketingOptIn")}
          />
        </div>

        <Button type="submit" variant="accent" fullWidth className="mt-1">
          Continuar
        </Button>
      </form>

      <p className="mt-7 text-center text-body-sm text-text-muted">
        Já tem conta?{" "}
        <Link to="/login" className="font-semibold text-accent transition-colors hover:text-accent-hover">
          Entrar
        </Link>
      </p>
    </>
  );
}

// --- Etapa 2: perfil profissional -------------------------------------------

function ProfileStep({
  defaults,
  onNext,
}: {
  defaults: ProfileValues | null;
  onNext: (values: ProfileValues) => void;
}) {

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues:
      defaults ?? {
        phone: "",
        personType: "cpf",
        document: "",
        agencyName: "",
      },
  });

  const personType = watch("personType");
  const phoneField = register("phone");
  const documentField = register("document");

  const submit = (values: ProfileValues) => onNext(values);

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="flex flex-col gap-5">
      <TextField
        label="WhatsApp"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="(11) 90000-0000"
        autoFocus
        error={errors.phone?.message}
        {...phoneField}
        onChange={(e) => {
          e.target.value = maskPhone(e.target.value);
          void phoneField.onChange(e);
        }}
      />

      {/* Pessoa física ou jurídica. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-label text-text">Você atua como</span>
        <div className="grid grid-cols-2 rounded-md bg-surface-sunken p-1">
          {(
            [
              { value: "cpf", label: "Pessoa física (CPF)" },
              { value: "cnpj", label: "Empresa (CNPJ)" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={personType === opt.value}
              onClick={() => {
                setValue("personType", opt.value);
                setValue("document", "");
              }}
              className={
                "rounded-[calc(var(--radius-md)-2px)] px-3 py-2 text-body-sm font-semibold transition-colors duration-fast " +
                (personType === opt.value
                  ? "bg-surface text-text shadow-xs"
                  : "text-text-muted hover:text-text")
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <TextField
        label={personType === "cpf" ? "CPF" : "CNPJ"}
        inputMode="numeric"
        placeholder={personType === "cpf" ? "000.000.000-00" : "00.000.000/0000-00"}
        error={errors.document?.message}
        {...documentField}
        onChange={(e) => {
          e.target.value =
            personType === "cpf" ? maskCpf(e.target.value) : maskCnpj(e.target.value);
          void documentField.onChange(e);
        }}
      />

      <TextField
        label="Imobiliária"
        optionalLabel="opcional"
        autoComplete="organization"
        placeholder="Nome da sua imobiliária"
        error={errors.agencyName?.message}
        {...register("agencyName")}
      />

      <Button type="submit" variant="accent" fullWidth className="mt-1">
        Continuar
      </Button>
    </form>
  );
}

// --- Etapa 3: plano ---------------------------------------------------------

function PlanStep({
  selected,
  onSelect,
  onNext,
}: {
  selected: PlanId;
  onSelect: (id: PlanId) => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {PLANS.map((plan) => {
        const active = plan.id === selected;
        return (
          <button
            key={plan.id}
            type="button"
            onClick={() => onSelect(plan.id)}
            aria-pressed={active}
            className={
              "hover-lift relative rounded-xl border-2 bg-surface p-5 text-left shadow-xs focus-visible:shadow-focus " +
              (active ? "border-accent" : "border-border")
            }
          >
            {plan.highlight && (
              <span className="absolute -top-3 right-4 rounded-full bg-accent px-3 py-1 text-caption font-bold text-accent-on shadow-sm">
                {plan.highlight}
              </span>
            )}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-h3 text-text">{plan.name}</h3>
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="text-h1 font-extrabold tabular-nums text-text">
                    {formatBRL(plan.priceMonthly)}
                  </span>
                  <span className="text-body-sm text-text-muted">{plan.cycleLabel}</span>
                </div>
              </div>
              <span
                aria-hidden="true"
                className={
                  "mt-1 flex h-6 w-6 flex-none items-center justify-center rounded-full border-2 transition-colors " +
                  (active ? "border-accent bg-accent" : "border-border-strong bg-surface")
                }
              >
                {active && (
                  <svg className="h-3.5 w-3.5 text-accent-on" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
            </div>
            <ul className="mt-4 flex flex-col gap-1.5">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-body-sm text-text-muted">
                  <svg className="h-4 w-4 flex-none text-accent" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
          </button>
        );
      })}

      <p className="text-center text-caption text-text-subtle">
        Valores provisórios de demonstração.
      </p>

      <Button type="button" variant="accent" fullWidth onClick={onNext}>
        Continuar
      </Button>
    </div>
  );
}

// --- Etapa 4: plano ---------------------------------------------------------

/**
 * Confirmação do plano, sem cobrança.
 *
 * O formulário de cartão saiu daqui. Ele estava honestamente marcado como
 * demonstração e não mandava nada para lugar nenhum, mas continuava sendo um
 * campo de número de cartão numa página real: gerenciador de senha preenche,
 * extensão lê, e um relatório de erro do navegador pode acabar carregando o
 * valor junto. Coletar dado de cartão que ninguém vai usar é risco sem troco.
 *
 * Quando o pagamento entrar de verdade, o certo é usar o campo hospedado do
 * provedor (Stripe, Pagar.me), em que o número nunca passa pelo nosso código.
 */
function PaymentStep({
  plan,
  submitting,
  errorMessage,
  onFinish,
}: {
  plan: Plan;
  submitting: boolean;
  errorMessage: string | null;
  onFinish: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {/* Resumo do plano. */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-surface-sunken px-4 py-3.5">
        <div>
          <p className="text-body-sm font-semibold text-text">Plano {plan.name}</p>
          <p className="text-caption text-text-muted">{formatBRL(plan.priceMonthly)} {plan.cycleLabel}</p>
        </div>
        <span className="text-h3 font-extrabold tabular-nums text-text">
          {formatBRL(plan.priceTotal)}
        </span>
      </div>

      <Banner variant="info">
        Nenhuma cobrança agora. Sua conta começa liberada e a forma de pagamento
        será pedida quando o período de uso terminar.
      </Banner>

      {errorMessage && <Banner variant="danger">{errorMessage}</Banner>}

      <Button
        type="button"
        variant="accent"
        fullWidth
        loading={submitting}
        onClick={onFinish}
        className="mt-1"
      >
        {submitting ? "Concluindo..." : "Concluir cadastro"}
      </Button>
    </div>
  );
}
