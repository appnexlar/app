import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, Mail } from "lucide-react";
import { z } from "zod";
import {
  isValidCnpj,
  isValidCpf,
  registerSchema,
  type GooglePendingSignup,
} from "@nexlar/shared";
import { Button } from "../../../components/ui/Button";
import { TextField } from "../../../components/ui/TextField";
import { PasswordField } from "../../../components/ui/PasswordField";
import { AuthOptionButton, GoogleMark } from "../../../components/ui/AuthOptionButton";
import { Checkbox } from "../../../components/ui/Checkbox";
import { Banner } from "../../../components/ui/Banner";
import { AuthLayout, OrDivider } from "../AuthLayout";
import { useAuthProviders, useGoogleAuth } from "../useGoogleAuth";
import { useAuth } from "../AuthContext";
import {
  authErrorMessage,
  googlePendingSignup,
  register as registerAccount,
  registerWithGoogle,
} from "../api";
import { ApiError } from "../../../lib/http";
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
 * Duas portas de entrada, e o Google é a recomendada, não a única: ninguém
 * inventa mais uma senha, o e-mail já chega confirmado (some o gate de
 * confirmação, que era a maior desistência da porta de entrada) e o Nexlar
 * deixa de guardar mais um hash. Quem prefere e-mail e senha segue por ali, com
 * o link de confirmação de sempre.
 *
 * Da etapa 2 em diante o caminho é o mesmo nas duas portas. O que muda é só a
 * etapa 1 (o Google dispensa nome, e-mail e senha) e o destino no fim: conta do
 * Google entra direto, conta de senha passa pela confirmação de e-mail. Quem
 * decide isso é o servidor, em session.broker.emailVerified.
 *
 * O CRECI não entra aqui de propósito. Ele é opcional e serve para ganhar o
 * selo de corretor verificado, que a lead vê na página pública do imóvel.
 * Exigir carteira e documento na porta de entrada afasta quem só quer
 * experimentar o sistema. Quem quiser o selo envia depois, em Perfil.
 *
 * TODO(backend): persistir cpf/cnpj e plano escolhido quando a API ganhar
 * esses campos. Hoje a API grava nome, e-mail, WhatsApp e imobiliária.
 */

// --- Schemas por etapa ------------------------------------------------------

/**
 * A primeira etapa tem duas formas, uma por porta de entrada.
 *
 * Pelo Google, nome e e-mail não são campos: vêm do convite assinado que o
 * servidor guardou no cookie, e senha não existe. Pedir esses dados de novo
 * seria só uma chance a mais de a pessoa digitar um e-mail diferente do que ela
 * acabou de autenticar.
 *
 * O aceite dos Termos é o que os dois têm em comum, porque é decisão da pessoa
 * e de mais ninguém.
 */
const aceitesSchema = z.object({
  acceptTerms: z.boolean().refine((v) => v === true, {
    message: "Aceite os Termos e a Política para continuar.",
  }),
  marketingOptIn: z.boolean(),
});

const googleAccountSchema = aceitesSchema;
type GoogleAccountValues = z.infer<typeof googleAccountSchema>;

const emailAccountSchema = z
  .object({
    fullName: registerSchema.shape.fullName,
    email: registerSchema.shape.email,
    password: registerSchema.shape.password,
    confirmPassword: z.string().min(1, "Confirme a senha"),
    acceptTerms: aceitesSchema.shape.acceptTerms,
    marketingOptIn: z.boolean(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });
type EmailAccountValues = z.infer<typeof emailAccountSchema>;

/** O que a etapa 1 entrega, com a porta de entrada carimbada junto. */
type AccountValues =
  | ({ via: "google" } & GoogleAccountValues)
  | ({ via: "email" } & EmailAccountValues);

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
  /** Escolha da porta de entrada. Null enquanto a pessoa não escolheu. */
  const [viaEmail, setViaEmail] = useState(false);

  const { signIn } = useAuth();
  const navigate = useNavigate();

  /**
   * Quem voltou do Google. Só o servidor sabe: a identidade vive num cookie
   * assinado, e esta consulta é o jeito de a tela descobrir de quem é o
   * cadastro em aberto. Sem convite, a resposta é 401 e a tela mostra as duas
   * escolhas em vez do formulário.
   */
  const { google: temGoogle, pronto } = useAuthProviders();

  const convite = useQuery({
    queryKey: ["auth", "google-pending"],
    queryFn: googlePendingSignup,
    // Sem Google no ambiente não existe convite possível, e perguntar só
    // renderia um 401 a cada carregamento da tela.
    enabled: temGoogle,
    retry: false,
    // A identidade não muda no meio do cadastro, e reconsultar ao voltar para
    // a aba faria a tela piscar sem motivo.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  const identidade = convite.data ?? null;
  // Voltar do Google decide sozinho: quem tem convite está no caminho social,
  // mesmo que antes tivesse clicado em e-mail nesta aba.
  const emCadastro = identidade !== null || viaEmail;

  /**
   * Duas rotas de criação, e o desfecho é diferente em cada uma: quem veio do
   * Google já tem o e-mail confirmado e entra direto; quem criou com senha
   * ainda precisa clicar no link que vai chegar na caixa de entrada.
   */
  const mutation = useMutation({
    mutationFn: (values: { conta: AccountValues; perfil: ProfileValues }) => {
      if (values.conta.via === "google") {
        // Nome e e-mail NÃO vão daqui: quem os fornece é o convite assinado.
        return registerWithGoogle({
          phone: values.perfil.phone,
          agencyName: values.perfil.agencyName ?? "",
          acceptTerms: true,
          marketingOptIn: values.conta.marketingOptIn,
        });
      }
      return registerAccount({
        fullName: values.conta.fullName,
        email: values.conta.email,
        password: values.conta.password,
        phone: values.perfil.phone,
        agencyName: values.perfil.agencyName ?? "",
        acceptTerms: true,
        marketingOptIn: values.conta.marketingOptIn,
      });
    },
    onSuccess: (session) => {
      signIn(session);
      // Quem diz se o e-mail está confirmado é o servidor, e não o caminho que
      // a pessoa escolheu: ler de session.broker é o que mantém a decisão fora
      // do alcance do navegador.
      navigate(session.broker.emailVerified ? "/dashboard" : "/confirmar-email", {
        replace: true,
      });
    },
  });

  const finish = () => {
    if (!account || !profile) return;
    // TODO(backend): enviar também personType/document e planId quando a API
    // ganhar esses campos. O aceite dos termos e o opt-in já vão.
    mutation.mutate({ conta: account, perfil: profile });
  };

  const plan = PLANS.find((p) => p.id === planId) ?? PLANS[0];
  const { title, subtitle } = STEP_TITLES[step];

  // Enquanto o servidor não responde não dá para saber se esta pessoa está
  // começando ou voltando do Google, e escolher errado faria a tela trocar de
  // cara na frente dela.
  // Com o Google desligado a consulta do convite nem roda, e ficaria pendente
  // para sempre: aí quem manda é só o `pronto`.
  if (!pronto || (temGoogle && convite.isPending)) {
    return (
      <AuthLayout>
        <div
          role="status"
          aria-label="Carregando seu cadastro"
          className="mx-auto mt-16 h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent"
        />
      </AuthLayout>
    );
  }

  /** Voltar da primeira etapa por e-mail leva de volta à escolha. */
  const voltar = () => {
    if (step === 0) {
      setViaEmail(false);
      setAccount(null);
      return;
    }
    setStep((s) => s - 1);
  };

  const podeVoltar = emCadastro && (step > 0 || (viaEmail && !identidade));

  return (
    // Só na escolha: dentro do assistente o aceite é um passo com checkbox, e
    // repetir a frase no rodapé faria a pessoa ler duas versões do mesmo texto.
    <AuthLayout legal={!emCadastro}>
      {/* Progresso. Só depois de escolhida a porta: antes disso não há cadastro
          em andamento para medir, e uma barra em 25% seria promessa falsa. */}
      {emCadastro && (
        <div className="mb-6">
          {podeVoltar && (
            <button
              type="button"
              onClick={voltar}
              className="mb-4 inline-flex items-center gap-2 text-body-sm font-semibold text-text-muted transition-colors hover:text-text"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
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
      )}

      {/* Centrado só na escolha. Dentro do assistente o título fica alinhado
          à esquerda, junto com a barra de progresso e os campos. */}
      <header className={emCadastro ? "mb-8" : "mb-8 text-center"}>
        <h1 className="text-h1 text-text">
          {emCadastro ? title : "Crie sua conta no Nexlar"}
        </h1>
        <p className="mt-2 text-body text-text-muted">
          {emCadastro ? subtitle : "Escolha por onde quer começar."}
        </p>
      </header>

      {!emCadastro && (
        <SignupStart
          googleIndisponivel={!temGoogle}
          avisarIndisponivel={pronto && !temGoogle}
          onEmail={() => setViaEmail(true)}
        />
      )}

      {emCadastro && step === 0 && (
        <AccountStep
          identidade={identidade}
          defaults={account}
          onNext={(values) => {
            setAccount(values);
            setStep(1);
          }}
        />
      )}
      {emCadastro && step === 1 && (
        <ProfileStep
          defaults={profile}
          onNext={(values) => {
            setProfile(values);
            setStep(2);
          }}
        />
      )}
      {emCadastro && step === 2 && (
        <PlanStep selected={planId} onSelect={setPlanId} onNext={() => setStep(3)} />
      )}
      {emCadastro && step === 3 && (
        <PaymentStep
          plan={plan}
          submitting={mutation.isPending}
          errorMessage={authErrorMessage(mutation.error, "register")}
          expirado={
            account?.via === "google" &&
            mutation.error instanceof ApiError &&
            mutation.error.status === 401
          }
          onFinish={finish}
        />
      )}
    </AuthLayout>
  );
}

// --- Porta de entrada: Google ou e-mail -------------------------------------

/**
 * As duas formas de começar, na mesma caixa e do mesmo tamanho. O Google vem
 * primeiro e com peso visual maior; o e-mail é um botão de verdade logo abaixo,
 * porque quem não quer vincular conta social precisa ver a saída de cara.
 *
 * As três linhas embaixo do Google explicam a recomendação em vez de só
 * afirmá-la, e a última existe para tirar o medo do escopo: um botão social
 * costuma dar a impressão de que vamos ler a agenda e os contatos.
 */
function SignupStart({
  googleIndisponivel,
  avisarIndisponivel,
  onEmail,
}: {
  googleIndisponivel: boolean;
  /** Só depois da resposta da API: avisar durante a carga seria informação errada. */
  avisarIndisponivel: boolean;
  onEmail: () => void;
}) {
  const { startGoogleAuth, saindo } = useGoogleAuth();

  return (
    <>
      <div className="flex flex-col gap-4">
        <AuthOptionButton
          label="Continuar com o Google"
          icon={<GoogleMark />}
          loading={saindo}
          disabled={googleIndisponivel}
          onClick={startGoogleAuth}
        />

        <OrDivider />

        <AuthOptionButton
          label="Continuar com e-mail"
          icon={<Mail className="h-5 w-5" aria-hidden="true" />}
          peso="alternativo"
          onClick={onEmail}
        />
      </div>

      {avisarIndisponivel && (
        <p className="mt-6 text-center text-caption leading-relaxed text-text-subtle">
          A criação de conta pelo Google chega em breve. Por enquanto, cadastre-se
          com seu e-mail.
        </p>
      )}

      <p className="mt-8 text-center text-body-sm text-text-muted">
        Já tem conta?{" "}
        <Link to="/login" className="font-semibold text-accent transition-colors hover:text-accent-hover">
          Entrar
        </Link>
      </p>
    </>
  );
}

// --- Etapa 1: conta ---------------------------------------------------------

/** Escolhe a forma da etapa 1 conforme a porta pela qual a pessoa entrou. */
function AccountStep({
  identidade,
  defaults,
  onNext,
}: {
  identidade: GooglePendingSignup | null;
  defaults: AccountValues | null;
  onNext: (values: AccountValues) => void;
}) {
  if (identidade) {
    return (
      <GoogleAccountStep
        identidade={identidade}
        defaults={defaults?.via === "google" ? defaults : null}
        onNext={(values) => onNext({ via: "google", ...values })}
      />
    );
  }
  return (
    <EmailAccountStep
      defaults={defaults?.via === "email" ? defaults : null}
      onNext={(values) => onNext({ via: "email", ...values })}
    />
  );
}

function GoogleAccountStep({
  identidade,
  defaults,
  onNext,
}: {
  identidade: GooglePendingSignup;
  defaults: GoogleAccountValues | null;
  onNext: (values: GoogleAccountValues) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<GoogleAccountValues>({
    resolver: zodResolver(googleAccountSchema),
    defaultValues: defaults ?? { acceptTerms: false, marketingOptIn: false },
  });

  return (
    <>
      {/* Quem está entrando. Mostrar isso não é enfeite: a pessoa pode ter
          escolhido a conta errada entre a pessoal e a da imobiliária, e este é
          o último momento barato para perceber. */}
      <div className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-primary-soft text-body-sm font-bold text-primary">
          {iniciais(identidade.fullName)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body-sm font-semibold text-text">{identidade.fullName}</p>
          <p className="truncate text-caption text-text-muted">{identidade.email}</p>
        </div>
        <Link
          to="/login"
          className="flex-none text-caption font-semibold text-accent transition-colors hover:text-accent-hover"
        >
          Trocar
        </Link>
      </div>

      <form onSubmit={handleSubmit(onNext)} noValidate className="mt-6 flex flex-col gap-6">
        <Aceites errors={errors} register={register} />
        <Button type="submit" variant="accent" fullWidth>
          Continuar
        </Button>
      </form>
    </>
  );
}

function EmailAccountStep({
  defaults,
  onNext,
}: {
  defaults: EmailAccountValues | null;
  onNext: (values: EmailAccountValues) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmailAccountValues>({
    resolver: zodResolver(emailAccountSchema),
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
    <form onSubmit={handleSubmit(onNext)} noValidate className="flex flex-col gap-6">
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

      <Aceites errors={errors} register={register} />

      {/* Dito aqui, e não no fim: quem escolhe senha precisa saber do link de
          confirmação antes de investir quatro etapas no cadastro. */}
      <p className="text-caption leading-relaxed text-text-subtle">
        Vamos enviar um link para confirmar seu e-mail antes de você começar a
        usar.
      </p>

      <Button type="submit" variant="accent" fullWidth>
        Continuar
      </Button>
    </form>
  );
}

/**
 * Os dois aceites, iguais nas duas portas. Um componente só porque a prova de
 * consentimento da LGPD não pode ter duas versões que saem do lugar em ajustes
 * separados.
 */
function Aceites({
  errors,
  register,
}: {
  errors: { acceptTerms?: { message?: string } };
  // O register vem de dois formulários com formatos diferentes; o que importa
  // é que os dois têm estes dois campos com o mesmo nome.
  register: (name: never) => Record<string, unknown>;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
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
        {...register("acceptTerms" as never)}
      />
      <Checkbox
        label="Quero receber novidades e dicas do Nexlar por e-mail (opcional)."
        {...register("marketingOptIn" as never)}
      />
    </div>
  );
}

/** Duas letras para o avatar, do primeiro e do último nome. */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0][0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1][0] ?? "") : "";
  return (primeira + ultima).toUpperCase();
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
  expirado,
  onFinish,
}: {
  plan: Plan;
  submitting: boolean;
  errorMessage: string | null;
  /** O convite do Google venceu no meio do caminho: só recomeçar resolve. */
  expirado: boolean;
  onFinish: () => void;
}) {
  const { startGoogleAuth, saindo } = useGoogleAuth();
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

      {expirado ? (
        // Sem convite válido não há o que enviar: insistir no botão de concluir
        // só repetiria o mesmo erro.
        <AuthOptionButton
          label="Entrar com o Google de novo"
          icon={<GoogleMark />}
          loading={saindo}
          onClick={startGoogleAuth}
        />
      ) : (
        <Button type="button" variant="accent" fullWidth loading={submitting} onClick={onFinish}>
          {submitting ? "Concluindo..." : "Concluir cadastro"}
        </Button>
      )}
    </div>
  );
}
