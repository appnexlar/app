import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, CheckCircle2, Loader2, Lock, MailOpen, ShieldCheck } from "lucide-react";
import {
  FINANCING_SECTIONS,
  FINANCING_SECTION_LABELS,
  type FinancingPublicForm,
  type FinancingSection,
  type FinancingSubmitResult,
} from "@nexlar/shared";
import { Banner } from "../../components/ui/Banner";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/ui/TextField";
import { ICON } from "../../components/ui/icon";
import {
  PublicFinancingError,
  fetchFinancingForm,
  fetchFinancingState,
  requestFinancingCode,
  verifyFinancingCode,
} from "./publicApi";
import { SECAO_COMPONENTES, SECAO_SUBTITULOS, type EstadoSalvo } from "./publicSections";
import { Revisao } from "./publicReview";

/**
 * O formulário do cliente em /f/:token (docs/09, Fatias C e D).
 *
 * Quatro momentos numa página só: o portão (explica e dispara o código), a
 * confirmação do código, o formulário por etapas com revisão final, e o
 * sucesso do envio. Quem volta pelo mesmo link com a sessão ainda válida cai
 * direto no formulário, sem pedir código de novo.
 */
export function FinancingPublicPage() {
  const { token = "" } = useParams<{ token: string }>();
  const [form, setForm] = useState<FinancingPublicForm | null>(null);
  const [enviado, setEnviado] = useState<FinancingSubmitResult | null>(null);

  const estado = useQuery({
    queryKey: ["financiamento-publico", token],
    queryFn: () => fetchFinancingState(token),
    retry: false,
  });

  // Retomada: se o cookie da sessão ainda vale, o formulário abre sem novo
  // código. O 401 silencioso significa só "passe pelo portão".
  const aguardando = estado.data?.state === "aguardando_codigo";
  const retomada = useQuery({
    queryKey: ["financiamento-retomada", token],
    queryFn: () => fetchFinancingForm(token),
    enabled: aguardando && !form && !enviado,
    retry: false,
  });
  useEffect(() => {
    if (retomada.data) setForm(retomada.data);
  }, [retomada.data]);

  if (enviado) {
    return (
      <Casca>
        <Sucesso nome={form?.leadFirstName ?? ""} resultado={enviado} />
      </Casca>
    );
  }

  if (estado.isPending || (aguardando && !form && retomada.isPending)) {
    return (
      <Casca>
        <div className="flex flex-col gap-3" aria-busy="true">
          <div className="h-8 w-2/3 animate-pulse rounded-md bg-surface-sunken" />
          <div className="h-24 animate-pulse rounded-xl bg-surface-sunken" />
          <div className="h-12 animate-pulse rounded-md bg-surface-sunken" />
        </div>
      </Casca>
    );
  }

  if (estado.isError) {
    const erro = estado.error;
    const naoExiste = erro instanceof PublicFinancingError && erro.status === 404;
    return (
      <Casca>
        <Aviso
          titulo={naoExiste ? "Link não encontrado" : "Não foi possível abrir"}
          texto={
            naoExiste
              ? "Confira se o endereço está completo, exatamente como chegou no WhatsApp. Se o problema continuar, fale com seu corretor."
              : "Verifique a conexão e tente de novo. Se o problema continuar, fale com seu corretor."
          }
        />
      </Casca>
    );
  }

  const dados = estado.data;

  if (dados.state !== "aguardando_codigo") {
    const textos = {
      expirada: {
        titulo: "O prazo deste link terminou",
        texto: `O tempo para preencher acabou. Peça a ${dados.brokerName} um link novo: o que você já tiver enviado continua guardado.`,
      },
      revogada: {
        titulo: "Este link foi desativado",
        texto: `${dados.brokerName} desativou este link. Se ainda for preencher os dados, é só pedir um novo.`,
      },
      encerrada: {
        titulo: "Esta etapa já foi concluída",
        texto: `As informações desta solicitação já foram recebidas por ${dados.brokerName}.`,
      },
    } as const;
    const t = textos[dados.state];
    return (
      <Casca>
        <Aviso titulo={t.titulo} texto={t.texto} />
      </Casca>
    );
  }

  return (
    <Casca>
      {form ? (
        <Formulario token={token} form={form} onForm={setForm} onEnviado={setEnviado} />
      ) : (
        <Portao token={token} dados={dados} onSessao={setForm} />
      )}
    </Casca>
  );
}

/** Moldura comum: coluna única, largura de leitura, mobile first. */
function Casca({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg font-sans text-text">
      <main className="mx-auto flex max-w-md flex-col px-5 py-8 sm:py-12">{children}</main>
      <footer className="mx-auto max-w-md px-5 pb-8 text-center text-caption text-text-subtle">
        Ambiente seguro Nexlar. Seus dados só ficam visíveis para o seu corretor.
      </footer>
    </div>
  );
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="rounded-2xl bg-surface p-6 text-center shadow-sm">
      <h1 className="text-h2 text-text">{titulo}</h1>
      <p className="mt-2 text-body-sm text-text-muted">{texto}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Portão: explicação + código por e-mail
// ---------------------------------------------------------------------------

function Portao({
  token,
  dados,
  onSessao,
}: {
  token: string;
  dados: { leadFirstName: string; brokerName: string; emailHint: string | null; message: string | null };
  onSessao: (form: FinancingPublicForm) => void;
}) {
  const [codigoPedido, setCodigoPedido] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  const pedir = useMutation({
    mutationFn: () => requestFinancingCode(token),
    onSuccess: () => {
      setCodigoPedido(true);
      setAviso(null);
    },
    onError: (e) =>
      setAviso(e instanceof PublicFinancingError ? e.message : "Não foi possível enviar o código."),
  });

  const verificar = useMutation({
    mutationFn: () => verifyFinancingCode(token, codigo.trim()),
    onSuccess: (form) => onSessao(form),
    onError: (e) =>
      setAviso(e instanceof PublicFinancingError ? e.message : "Não foi possível confirmar o código."),
  });

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="text-caption font-extrabold uppercase tracking-wide text-accent">
          Simulação de financiamento
        </p>
        <h1 className="mt-1 text-h1 text-text">Olá, {dados.leadFirstName}</h1>
        <p className="mt-2 text-body text-text-muted">
          {dados.brokerName} pediu algumas informações para preparar a simulação do seu
          financiamento. Você preenche aqui, no seu tempo, e nada vai para banco nenhum sem a sua
          autorização.
        </p>
        {dados.message && (
          <blockquote className="mt-3 rounded-xl bg-surface p-4 text-body-sm italic text-text-muted shadow-xs">
            "{dados.message}"
          </blockquote>
        )}
      </header>

      <ul className="flex flex-col gap-2.5 rounded-2xl bg-surface p-5 shadow-sm">
        <ItemSeguranca icone={<Lock size={ICON.row} aria-hidden="true" />}>
          Link exclusivo seu: não repasse para outras pessoas.
        </ItemSeguranca>
        <ItemSeguranca icone={<MailOpen size={ICON.row} aria-hidden="true" />}>
          A confirmação chega no e-mail {dados.emailHint ?? "cadastrado com seu corretor"}.
        </ItemSeguranca>
        <ItemSeguranca icone={<ShieldCheck size={ICON.row} aria-hidden="true" />}>
          Dá para salvar e continuar depois. Só o seu corretor vê as respostas.
        </ItemSeguranca>
      </ul>

      {aviso && <Banner variant="danger">{aviso}</Banner>}

      {codigoPedido ? (
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!/^\d{6}$/.test(codigo.trim())) {
              setAviso("O código tem 6 números.");
              return;
            }
            verificar.mutate();
          }}
        >
          <TextField
            label="Código de 6 números"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            hint="Chegou no seu e-mail. Vale por 10 minutos."
            className="text-center text-h2 tracking-[0.4em]"
          />
          <Button type="submit" variant="accent" fullWidth loading={verificar.isPending}>
            Confirmar e abrir o formulário
          </Button>
          <button
            type="button"
            onClick={() => pedir.mutate()}
            disabled={pedir.isPending}
            className="min-h-9 text-body-sm font-semibold text-accent hover:underline disabled:opacity-50"
          >
            Não chegou? Enviar outro código
          </button>
        </form>
      ) : (
        <Button
          type="button"
          variant="accent"
          fullWidth
          loading={pedir.isPending}
          onClick={() => pedir.mutate()}
        >
          Receber o código por e-mail
        </Button>
      )}
    </div>
  );
}

function ItemSeguranca({ icone, children }: { icone: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-body-sm text-text-muted">
      <span className="mt-0.5 flex-none text-accent">{icone}</span>
      {children}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Formulário por etapas + revisão
// ---------------------------------------------------------------------------

type Etapa = FinancingSection | "revisao";

function Formulario({
  token,
  form,
  onForm,
  onEnviado,
}: {
  token: string;
  form: FinancingPublicForm;
  onForm: (f: FinancingPublicForm) => void;
  onEnviado: (r: FinancingSubmitResult) => void;
}) {
  // A ordem canônica das etapas, independente de como a solicitação guardou.
  const etapas = [...form.sections].sort(
    (a, b) => FINANCING_SECTIONS.indexOf(a) - FINANCING_SECTIONS.indexOf(b),
  );
  const [etapa, setEtapa] = useState<Etapa>(
    () => etapas.find((s) => !form.completedSections.includes(s)) ?? "revisao",
  );
  const [salvo, setSalvo] = useState<EstadoSalvo>("parado");
  const [aviso, setAviso] = useState<string | null>(null);

  // Trocar de etapa começa do topo, com o aviso e o indicador zerados.
  useEffect(() => {
    window.scrollTo({ top: 0 });
    setAviso(null);
    setSalvo("parado");
  }, [etapa]);

  const avancar = () => {
    const i = etapas.indexOf(etapa as FinancingSection);
    setEtapa(i >= 0 && i < etapas.length - 1 ? etapas[i + 1] : "revisao");
  };

  const revisao = etapa === "revisao";
  const posicao = revisao ? etapas.length + 1 : etapas.indexOf(etapa) + 1;
  const Secao = revisao ? null : SECAO_COMPONENTES[etapa];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <p className="text-caption font-extrabold uppercase tracking-wide text-accent">
            Etapa {posicao} de {etapas.length + 1}
          </p>
          <IndicadorDeSalvamento estado={salvo} />
        </div>
        <h1 className="text-h1 text-text">
          {revisao ? "Revise e envie" : FINANCING_SECTION_LABELS[etapa]}
        </h1>
        <p className="text-body-sm text-text-muted">
          {revisao
            ? "Confira se está tudo certo. Dá para editar qualquer etapa antes de enviar."
            : SECAO_SUBTITULOS[etapa]}
        </p>
      </header>

      <Etapas etapas={etapas} completed={form.completedSections} atual={etapa} onIr={setEtapa} />

      {form.correctionNote && (
        <div className="rounded-2xl bg-surface p-4 shadow-sm">
          <p className="text-caption font-extrabold uppercase tracking-wide text-accent">
            Pedido do seu corretor
          </p>
          <p className="mt-1 text-body-sm text-text-muted">"{form.correctionNote}"</p>
          {form.correctionFields && form.correctionFields.length > 0 && (
            <p className="mt-1.5 text-caption text-text-subtle">
              Revise: {form.correctionFields.map((s) => FINANCING_SECTION_LABELS[s]).join(", ")}.
            </p>
          )}
        </div>
      )}

      {aviso && <Banner variant="danger">{aviso}</Banner>}

      {Secao ? (
        <Secao
          key={etapa}
          token={token}
          form={form}
          onForm={onForm}
          onEstado={setSalvo}
          onAviso={setAviso}
          onConcluir={avancar}
          concluida={form.completedSections.includes(etapa as FinancingSection)}
        />
      ) : (
        <Revisao token={token} form={form} onEditar={setEtapa} onEnviado={onEnviado} />
      )}
    </div>
  );
}

/** As etapas como caminho clicável: dá para voltar a qualquer uma. */
function Etapas({
  etapas,
  completed,
  atual,
  onIr,
}: {
  etapas: FinancingSection[];
  completed: FinancingSection[];
  atual: Etapa;
  onIr: (e: Etapa) => void;
}) {
  const chip = (feita: boolean, deAgora: boolean) =>
    `flex min-h-8 items-center gap-1 rounded-full px-2.5 py-1 text-caption font-semibold transition-colors ${
      deAgora
        ? "bg-accent-soft text-accent"
        : feita
          ? "bg-success-soft text-[var(--success-fg)]"
          : "bg-surface-sunken text-text-subtle"
    }`;
  return (
    <ol className="flex flex-wrap gap-1.5">
      {etapas.map((s) => (
        <li key={s}>
          <button type="button" onClick={() => onIr(s)} className={chip(completed.includes(s), s === atual)}>
            {completed.includes(s) && s !== atual && <Check size={12} aria-hidden="true" />}
            {FINANCING_SECTION_LABELS[s]}
          </button>
        </li>
      ))}
      <li>
        <button type="button" onClick={() => onIr("revisao")} className={chip(false, atual === "revisao")}>
          Revisão
        </button>
      </li>
    </ol>
  );
}

function IndicadorDeSalvamento({ estado }: { estado: EstadoSalvo }) {
  if (estado === "parado") return null;
  if (estado === "salvando") {
    return (
      <span className="flex items-center gap-1 text-caption text-text-subtle">
        <Loader2 size={12} className="animate-spin" aria-hidden="true" /> Salvando...
      </span>
    );
  }
  if (estado === "salvo") {
    return (
      <span className="flex items-center gap-1 text-caption text-[var(--success-fg)]">
        <Check size={12} aria-hidden="true" /> Salvo
      </span>
    );
  }
  return <span className="text-caption text-[var(--danger-fg)]">Não salvou</span>;
}

// ---------------------------------------------------------------------------
// Sucesso do envio
// ---------------------------------------------------------------------------

function Sucesso({ nome, resultado }: { nome: string; resultado: FinancingSubmitResult }) {
  return (
    <div className="rounded-2xl bg-surface p-6 text-center shadow-sm">
      <CheckCircle2
        size={44}
        className="mx-auto text-[var(--success-fg)]"
        strokeWidth={1.8}
        aria-hidden="true"
      />
      <h1 className="mt-3 text-h1 text-text">{nome ? `Tudo certo, ${nome}!` : "Tudo certo!"}</h1>
      <p className="mt-2 text-body text-text-muted">
        {resultado.brokerName} recebeu suas informações e vai preparar a simulação do seu
        financiamento. Se algo precisar de ajuste, é com você que o corretor vai falar.
      </p>
      <p className="mt-4 text-caption text-text-subtle">Você já pode fechar esta página.</p>
    </div>
  );
}
