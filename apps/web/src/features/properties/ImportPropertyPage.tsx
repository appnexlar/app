import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Link2,
  Search,
  Sparkles,
} from "lucide-react";
import type { ImportedField, PropertyImportResult } from "@nexlar/shared";
import { Banner } from "../../components/ui/Banner";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { TextField } from "../../components/ui/TextField";
import { ApiError } from "../../lib/http";
import { deleteProperty, importProperty } from "./api";

/**
 * Importação de imóvel por URL: cola o link, a Nexlar lê o anúncio e o
 * rascunho nasce preenchido. A revisão de verdade acontece no wizard (modo
 * edição); esta tela só conta o que foi encontrado e leva até lá.
 *
 * Estados: aguardando o link, lendo (mensagens amigáveis, nunca jargão),
 * resumo (criado ou duplicado) e erro com saída para o cadastro manual.
 */
export function ImportPropertyPage() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [result, setResult] = useState<PropertyImportResult | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const importar = useMutation({
    mutationFn: ({ force }: { force?: boolean }) => importProperty(url.trim(), force),
    onSuccess: (data) => setResult(data),
  });

  const discard = useMutation({
    mutationFn: (propertyId: string) => deleteProperty(propertyId),
    onSuccess: () => navigate("/imoveis"),
  });

  const submit = () => {
    const value = url.trim();
    if (!value) {
      setFieldError("Cole o link do anúncio para importar.");
      return;
    }
    if (!/^https?:\/\/.+\..+/i.test(value)) {
      setFieldError("Isso não parece um link. Ele começa com http:// ou https://.");
      return;
    }
    setFieldError(null);
    setResult(null);
    importar.mutate({});
  };

  const requestError =
    importar.isError && !importar.isPending
      ? importar.error instanceof ApiError && importar.error.status !== 500
        ? importar.error.message
        : "Não conseguimos importar este anúncio agora. Tente de novo ou cadastre manualmente."
      : null;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      {importar.isPending ? (
        <LoadingCard />
      ) : result?.outcome === "criado" ? (
        <ResultCard
          result={result}
          onReview={() => navigate(`/imoveis/${result.propertyCode}/editar`)}
          onDiscard={() => setConfirmDiscard(true)}
          discarding={discard.isPending}
        />
      ) : result?.outcome === "duplicado" ? (
        <DuplicateCard
          result={result}
          onOpenExisting={(code) => navigate(`/imoveis/${code}`)}
          onForce={() => {
            setResult(null);
            importar.mutate({ force: true });
          }}
        />
      ) : (
        <>
          <p className="text-body text-text-muted">
            Cole o link público de um anúncio. A Nexlar lê a página e monta o rascunho do imóvel
            para você revisar, completar e salvar.
          </p>

          {requestError && (
            <Banner variant="danger">
              <span>{requestError}</span>
            </Banner>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex flex-col gap-4"
          >
            <TextField
              label="Link do anúncio"
              placeholder="https://www.imobiliaria.com.br/imovel/1234"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              error={fieldError ?? undefined}
              hint="Funciona com páginas públicas de imobiliárias e construtoras."
              inputMode="url"
              autoComplete="off"
              autoFocus
            />
            <Button type="submit" variant="accent" fullWidth>
              <Link2 size={18} aria-hidden="true" />
              Importar imóvel
            </Button>
          </form>

          {requestError && (
            <Button type="button" variant="ghost" fullWidth onClick={() => navigate("/imoveis/novo")}>
              Cadastrar manualmente
            </Button>
          )}

          <p className="text-body-sm text-text-subtle">
            Nada é publicado sem você: o imóvel nasce como rascunho e só fica disponível depois da
            sua revisão.
          </p>
        </>
      )}

      <ConfirmDialog
        open={confirmDiscard}
        title="Descartar esta importação?"
        description="O rascunho criado agora será excluído. O anúncio original continua no site dele e você pode importar de novo quando quiser."
        confirmLabel="Descartar rascunho"
        danger
        loading={discard.isPending}
        onConfirm={() => result?.propertyId && discard.mutate(result.propertyId)}
        onCancel={() => setConfirmDiscard(false)}
      />
    </div>
  );
}

// --- Lendo o anúncio ---------------------------------------------------------

const LOADING_STEPS = [
  "Lendo o anúncio…",
  "Conferindo a ficha do imóvel…",
  "Organizando as informações…",
];

function LoadingCard() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(
      () => setStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)),
      2600,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      role="status"
      className="flex flex-col items-center gap-4 rounded-xl border border-border bg-surface px-6 py-12 text-center"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Search size={22} className="animate-pulse" aria-hidden="true" />
      </span>
      <p className="text-body font-semibold text-text">{LOADING_STEPS[step]}</p>
      <p className="max-w-xs text-body-sm text-text-muted">
        Isso leva só alguns segundos. Nada é salvo sem a sua revisão.
      </p>
    </div>
  );
}

// --- Resumo da importação ----------------------------------------------------

function ResultCard({
  result,
  onReview,
  onDiscard,
  discarding,
}: {
  result: PropertyImportResult;
  onReview: () => void;
  onDiscard: () => void;
  discarding: boolean;
}) {
  const groups = useMemo(
    () => ({
      encontrado: result.fields.filter((f) => f.state === "encontrado"),
      revisar: result.fields.filter((f) => f.state === "revisar"),
      nao_encontrado: result.fields.filter((f) => f.state === "nao_encontrado"),
    }),
    [result.fields],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--success-soft)] text-[var(--success-fg)]">
          <Sparkles size={20} aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-h3 text-text">Anúncio lido</h2>
          <p className="mt-1 text-body-sm text-text-muted">
            {resumoFrase(groups.encontrado.length, groups.revisar.length, groups.nao_encontrado.length)}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <FieldGroup
          title="Encontrados"
          icon={<CheckCircle2 size={16} className="text-[var(--success-fg)]" aria-hidden="true" />}
          fields={groups.encontrado}
        />
        <FieldGroup
          title="Confira na revisão"
          icon={<AlertTriangle size={16} className="text-[var(--warning-fg)]" aria-hidden="true" />}
          fields={groups.revisar}
        />
        <FieldGroup
          title="Não estavam no anúncio"
          icon={<CircleDashed size={16} className="text-text-subtle" aria-hidden="true" />}
          fields={groups.nao_encontrado}
          muted
        />
      </div>

      <div className="flex flex-col gap-2">
        <Button type="button" variant="accent" fullWidth onClick={onReview}>
          Revisar e completar
          <ArrowRight size={18} aria-hidden="true" />
        </Button>
        <Button type="button" variant="ghost" fullWidth loading={discarding} onClick={onDiscard}>
          Descartar importação
        </Button>
      </div>
    </div>
  );
}

function resumoFrase(found: number, review: number, missing: number): string {
  const parts: string[] = [];
  parts.push(`${found} informaç${found === 1 ? "ão encontrada" : "ões encontradas"}`);
  if (review > 0) parts.push(`${review} para conferir`);
  if (missing > 0) parts.push(`${missing} para completar`);
  return parts.join(" · ");
}

function FieldGroup({
  title,
  icon,
  fields,
  muted = false,
}: {
  title: string;
  icon: React.ReactNode;
  fields: ImportedField[];
  muted?: boolean;
}) {
  if (fields.length === 0) return null;
  return (
    <div className="border-b border-border px-4 py-4 last:border-b-0">
      <p className="flex items-center gap-2 text-body-sm font-semibold text-text">
        {icon}
        {title}
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {fields.map((field) => (
          <li key={field.key} className="flex items-baseline justify-between gap-4 text-body-sm">
            <span className={muted ? "text-text-subtle" : "text-text-muted"}>{field.label}</span>
            <span
              className={
                "min-w-0 truncate text-right " + (muted ? "text-text-subtle" : "font-medium text-text")
              }
            >
              {field.value ?? "não encontrado"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Link já importado -------------------------------------------------------

function DuplicateCard({
  result,
  onOpenExisting,
  onForce,
}: {
  result: PropertyImportResult;
  onOpenExisting: (code: number) => void;
  onForce: () => void;
}) {
  const first = result.duplicates[0];
  return (
    <div className="flex flex-col gap-6">
      <Banner variant="info">
        <span>
          Este link já está na sua carteira. Importar de novo criaria um imóvel repetido.
        </span>
      </Banner>

      {first && (
        <div className="rounded-xl border border-border bg-surface px-4 py-4">
          <p className="text-body font-semibold text-text">{first.title}</p>
          <p className="mt-1 text-body-sm text-text-muted">
            Código {first.code}
            {first.neighborhood ? ` · ${first.neighborhood}` : ""}
            {first.city ? ` · ${first.city}` : ""}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {first && (
          <Button type="button" variant="accent" fullWidth onClick={() => onOpenExisting(first.code)}>
            Abrir imóvel existente
          </Button>
        )}
        <Button type="button" variant="ghost" fullWidth onClick={onForce}>
          Importar mesmo assim
        </Button>
      </div>
    </div>
  );
}
