import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ADDRESS_DISPLAY_MODES,
  CATEGORY_TYPES,
  PROPERTY_CATEGORIES,
  PROPERTY_ORIGINS,
  PROPERTY_PURPOSES,
  type AddressDisplayMode,
  type DuplicateCandidate,
  type PropertyCategory,
  type PropertyDetail,
  type PropertyOrigin,
  type PropertyPurpose,
  type UpdatePropertyDto,
} from "@nexlar/shared";
import { Button } from "../../components/ui/Button";
import { Banner } from "../../components/ui/Banner";
import { TextField } from "../../components/ui/TextField";
import { Select } from "../../components/ui/Select";
import { Checkbox } from "../../components/ui/Checkbox";
import { Spinner } from "../../components/ui/Spinner";
import { ApiError } from "../../lib/http";
import { maskDate, maskMoney, maskPhone, onlyDigits, parseMoney } from "../../lib/masks";
import { UFS } from "../../lib/brazil";
import {
  changePropertyStatus,
  createProperty,
  fetchProperty,
  findDuplicates,
  updateProperty,
} from "./api";
import {
  ADDRESS_DISPLAY_LABELS,
  CATEGORY_LABELS,
  FEATURE_SUGGESTIONS,
  ORIGIN_LABELS,
  PURPOSE_LABELS,
  TYPE_LABELS,
  formatCode,
  formatMoney,
} from "./labels";
import { DETAIL_FIELDS, ORIGIN_FIELDS, type FieldDef } from "./fields";
import { MapPicker } from "./MapPicker";
import { ContactsEditor } from "./ContactsEditor";
import { MediaManager } from "./MediaManager";
import { PartnerLookup } from "./PartnerLookup";

/**
 * Cadastro do imóvel em 7 etapas (J: carteira do corretor). A etapa 1 cria o
 * rascunho; cada "Continuar" salva o pedaço na API. Sair a qualquer momento
 * preserva o rascunho para continuar depois.
 */

const STEPS = [
  "Identificação",
  "Localização",
  "Características",
  "Valores",
  "Origem e envolvidos",
  "Fotos e vídeos",
  "Revisão",
] as const;

interface WizardForm {
  title: string;
  purpose: PropertyPurpose | "";
  category: PropertyCategory | "";
  type: string;
  origin: PropertyOrigin | "";
  externalCode: string;
  externalLink: string;
  description: string;
  internalNotes: string;
  zip: string;
  street: string;
  addressNumber: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  reference: string;
  condoName: string;
  addressDisplay: AddressDisplayMode;
  latitude: number | null;
  longitude: number | null;
  salePrice: string;
  acceptsFinancing: boolean;
  acceptsFgts: boolean;
  acceptsTrade: boolean;
  priceNegotiable: boolean;
  commissionNotes: string;
  rentPrice: string;
  condoFee: string;
  iptu: string;
  otherFees: string;
  guaranteeTypes: string;
  minTermMonths: string;
  availableFrom: string;
  rentNotes: string;
  details: Record<string, unknown>;
  features: string[];
  originDetails: Record<string, unknown>;
}

const EMPTY_FORM: WizardForm = {
  title: "",
  purpose: "",
  category: "",
  type: "",
  origin: "",
  externalCode: "",
  externalLink: "",
  description: "",
  internalNotes: "",
  zip: "",
  street: "",
  addressNumber: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  reference: "",
  condoName: "",
  addressDisplay: "completo",
  latitude: null,
  longitude: null,
  salePrice: "",
  acceptsFinancing: false,
  acceptsFgts: false,
  acceptsTrade: false,
  priceNegotiable: false,
  commissionNotes: "",
  rentPrice: "",
  condoFee: "",
  iptu: "",
  otherFees: "",
  guaranteeTypes: "",
  minTermMonths: "",
  availableFrom: "",
  rentNotes: "",
  details: {},
  features: [],
  originDetails: {},
};

function fromDetail(p: PropertyDetail): WizardForm {
  return {
    title: p.title,
    purpose: p.purpose,
    category: p.category,
    type: p.type,
    origin: p.origin,
    externalCode: p.externalCode ?? "",
    externalLink: p.externalLink ?? "",
    description: p.description ?? "",
    internalNotes: p.internalNotes ?? "",
    zip: p.zip ?? "",
    street: p.street ?? "",
    addressNumber: p.addressNumber ?? "",
    complement: p.complement ?? "",
    neighborhood: p.neighborhood ?? "",
    city: p.city ?? "",
    state: p.state ?? "",
    reference: p.reference ?? "",
    condoName: p.condoName ?? "",
    addressDisplay: p.addressDisplay,
    latitude: p.latitude,
    longitude: p.longitude,
    salePrice: p.salePrice != null ? maskMoney(String(p.salePrice)) : "",
    acceptsFinancing: p.acceptsFinancing ?? false,
    acceptsFgts: p.acceptsFgts ?? false,
    acceptsTrade: p.acceptsTrade ?? false,
    priceNegotiable: p.priceNegotiable ?? false,
    commissionNotes: p.commissionNotes ?? "",
    rentPrice: p.rentPrice != null ? maskMoney(String(p.rentPrice)) : "",
    condoFee: p.condoFee != null ? maskMoney(String(p.condoFee)) : "",
    iptu: p.iptu != null ? maskMoney(String(p.iptu)) : "",
    otherFees: p.otherFees ?? "",
    guaranteeTypes: p.guaranteeTypes ?? "",
    minTermMonths: p.minTermMonths != null ? String(p.minTermMonths) : "",
    availableFrom: p.availableFrom ?? "",
    rentNotes: p.rentNotes ?? "",
    details: (p.details as Record<string, unknown>) ?? {},
    features: p.features,
    originDetails: (p.originDetails as Record<string, unknown>) ?? {},
  };
}

export function PropertyWizard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [propertyId, setPropertyId] = useState<string | null>(id ?? null);
  const [code, setCode] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardForm>(EMPTY_FORM);
  const [loadedFromApi, setLoadedFromApi] = useState(!id);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [duplicatesAcknowledged, setDuplicatesAcknowledged] = useState(false);

  const existing = useQuery({
    queryKey: ["property", id],
    queryFn: () => fetchProperty(id as string),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (existing.data && !loadedFromApi) {
      setForm(fromDetail(existing.data));
      setPropertyId(existing.data.id);
      setCode(existing.data.code);
      setLoadedFromApi(true);
    }
  }, [existing.data, loadedFromApi]);

  const set = <K extends keyof WizardForm>(key: K, value: WizardForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setStepErrors({});
    setError(null);
  };

  const typeOptions = form.category ? CATEGORY_TYPES[form.category] : [];

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["properties"] });
    if (propertyId) void queryClient.invalidateQueries({ queryKey: ["property", propertyId] });
  };

  function buildPatch(): UpdatePropertyDto {
    return {
      title: form.title || undefined,
      purpose: form.purpose || undefined,
      category: form.category || undefined,
      type: form.type || undefined,
      origin: form.origin || undefined,
      externalCode: form.externalCode,
      externalLink: form.externalLink,
      description: form.description,
      internalNotes: form.internalNotes,
      zip: form.zip,
      street: form.street,
      addressNumber: form.addressNumber,
      complement: form.complement,
      neighborhood: form.neighborhood,
      city: form.city,
      state: form.state,
      reference: form.reference,
      condoName: form.condoName,
      addressDisplay: form.addressDisplay,
      latitude: form.latitude,
      longitude: form.longitude,
      salePrice: parseMoney(form.salePrice),
      acceptsFinancing: form.acceptsFinancing,
      acceptsFgts: form.acceptsFgts,
      acceptsTrade: form.acceptsTrade,
      priceNegotiable: form.priceNegotiable,
      commissionNotes: form.commissionNotes,
      rentPrice: parseMoney(form.rentPrice),
      condoFee: parseMoney(form.condoFee),
      iptu: parseMoney(form.iptu),
      otherFees: form.otherFees,
      guaranteeTypes: form.guaranteeTypes,
      minTermMonths: form.minTermMonths ? Number(form.minTermMonths) : undefined,
      availableFrom: form.availableFrom,
      rentNotes: form.rentNotes,
      details: form.details,
      features: form.features,
      originDetails: form.originDetails as UpdatePropertyDto["originDetails"],
    };
  }

  function validateStep1(): boolean {
    const errors: Record<string, string> = {};
    if (form.title.trim().length < 3) errors.title = "Informe um título";
    if (!form.purpose) errors.purpose = "Informe a finalidade";
    if (!form.category) errors.category = "Informe a categoria";
    if (!form.type) errors.type = "Informe o tipo";
    if (!form.origin) errors.origin = "Informe como o imóvel chegou até você";
    setStepErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function checkDuplicates(scope: "codigo" | "endereco"): Promise<boolean> {
    if (duplicatesAcknowledged) return true;
    const params =
      scope === "codigo"
        ? { externalCode: form.externalCode || undefined, externalLink: form.externalLink || undefined }
        : { street: form.street || undefined, addressNumber: form.addressNumber || undefined };
    if (!Object.values(params).some(Boolean)) return true;
    try {
      const found = await findDuplicates({ ...params, excludeId: propertyId ?? undefined });
      if (found.length > 0) {
        setDuplicates(found);
        return false;
      }
    } catch {
      // Verificação é auxiliar: nunca trava o cadastro.
    }
    return true;
  }

  async function saveStep(goNext: boolean, exit = false) {
    setError(null);
    if (step === 0 && !validateStep1()) return;

    setSaving(true);
    try {
      if (step === 0) {
        const ok = await checkDuplicates("codigo");
        if (!ok) {
          setSaving(false);
          return;
        }
      }
      if (step === 1) {
        const ok = await checkDuplicates("endereco");
        if (!ok) {
          setSaving(false);
          return;
        }
      }

      let currentId = propertyId;
      if (!currentId) {
        const created = await createProperty({
          title: form.title.trim(),
          purpose: form.purpose as PropertyPurpose,
          category: form.category as PropertyCategory,
          type: form.type,
          origin: form.origin as PropertyOrigin,
          externalCode: form.externalCode || undefined,
          externalLink: form.externalLink || undefined,
        });
        currentId = created.id;
        setPropertyId(created.id);
        setCode(created.code);
      } else {
        await updateProperty(currentId, buildPatch());
      }
      invalidate();
      setDuplicates([]);
      setDuplicatesAcknowledged(false);

      if (exit) {
        navigate("/imoveis");
      } else if (goNext) {
        setStep((s) => Math.min(s + 1, STEPS.length - 1));
        window.scrollTo({ top: 0 });
      }
    } catch (e) {
      setError(
        e instanceof ApiError && e.status !== 500
          ? e.message
          : "Não foi possível salvar agora. Tente novamente.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!propertyId) return;
    setPublishing(true);
    setError(null);
    try {
      await updateProperty(propertyId, buildPatch());
      await changePropertyStatus(propertyId, { status: "disponivel" });
      invalidate();
      navigate(`/imoveis/${propertyId}`);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status !== 500
          ? e.message
          : "Não foi possível publicar agora. Tente novamente.",
      );
    } finally {
      setPublishing(false);
    }
  }

  if (id && existing.isPending) {
    return (
      <div className="flex justify-center py-16" role="status" aria-label="Carregando imóvel">
        <Spinner className="h-8 w-8 text-accent" />
      </div>
    );
  }
  if (id && existing.isError) {
    return (
      <div className="mx-auto max-w-xl">
        <Banner variant="danger">Não foi possível carregar o imóvel para edição.</Banner>
      </div>
    );
  }

  const isRent =
    form.purpose === "locacao" || form.purpose === "venda_locacao" || form.purpose === "temporada";
  const isSale = form.purpose === "venda" || form.purpose === "venda_locacao";

  return (
    <div className="mx-auto max-w-2xl pb-24">
      <header className="mb-6">
        <p className="text-caption font-semibold uppercase tracking-wide text-text-subtle">
          {code ? `${formatCode(code)} · ` : ""}Etapa {step + 1} de {STEPS.length}
        </p>
        <h2 className="mt-1 text-h1 text-text">{STEPS[step]}</h2>
        <div className="mt-4 flex gap-1.5" aria-hidden="true">
          {STEPS.map((label, i) => (
            <div
              key={label}
              className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-accent" : "bg-surface-sunken"}`}
            />
          ))}
        </div>
      </header>

      {error && (
        <div className="mb-5">
          <Banner variant="danger">{error}</Banner>
        </div>
      )}

      {duplicates.length > 0 && (
        <div className="mb-5 rounded-xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-body font-semibold text-text">
            Encontramos um imóvel que pode ser o mesmo
          </p>
          {duplicates.map((d) => (
            <p key={d.id} className="mt-1 text-body-sm text-text-muted">
              {formatCode(d.code)} · {d.title}
              {d.neighborhood ? ` · ${d.neighborhood}` : ""}
              {d.city ? `, ${d.city}` : ""}
            </p>
          ))}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate(`/imoveis/${duplicates[0].id}`)}
            >
              Abrir imóvel existente
            </Button>
            <Button
              type="button"
              variant="accent"
              onClick={() => {
                setDuplicatesAcknowledged(true);
                setDuplicates([]);
              }}
            >
              Cadastrar mesmo assim
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-5">
        {step === 0 && (
          <StepIdentification
            form={form}
            set={set}
            errors={stepErrors}
            typeOptions={typeOptions}
          />
        )}
        {step === 1 && <StepLocation form={form} set={set} />}
        {step === 2 && <StepDetails form={form} set={set} />}
        {step === 3 && <StepValues form={form} set={set} isSale={isSale} isRent={isRent} />}
        {step === 4 && (
          <StepOrigin form={form} set={set} propertyId={propertyId} />
        )}
        {step === 5 && propertyId && <MediaManager propertyId={propertyId} />}
        {step === 6 && (
          <StepReview form={form} isSale={isSale} isRent={isRent} />
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (step === 0) navigate("/imoveis");
              else setStep((s) => s - 1);
            }}
          >
            {step === 0 ? "Cancelar" : "Voltar"}
          </Button>
          <div className="flex items-center gap-2.5">
            {propertyId && step < STEPS.length - 1 && (
              <Button
                type="button"
                variant="ghost"
                loading={saving}
                onClick={() => void saveStep(false, true)}
              >
                Salvar e sair
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button
                type="button"
                variant="accent"
                loading={saving}
                onClick={() => void saveStep(true)}
              >
                Continuar
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  loading={saving}
                  onClick={() => void saveStep(false, true)}
                >
                  Salvar como rascunho
                </Button>
                <Button
                  type="button"
                  variant="accent"
                  loading={publishing}
                  onClick={() => void publish()}
                >
                  Tornar disponível
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Etapa 1: Identificação --------------------------------------------------

function ChipGroup<T extends string>({
  label,
  options,
  labels,
  value,
  error,
  onChange,
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T | "";
  error?: string;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className="text-label text-text">{label}</legend>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {options.map((option) => {
          const active = value === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option)}
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
      {error && <p className="mt-1.5 text-caption text-[var(--danger-fg)]">{error}</p>}
    </fieldset>
  );
}

function StepIdentification({
  form,
  set,
  errors,
  typeOptions,
}: {
  form: WizardForm;
  set: <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => void;
  errors: Record<string, string>;
  typeOptions: readonly string[];
}) {
  return (
    <>
      <ChipGroup
        label="Categoria"
        options={PROPERTY_CATEGORIES}
        labels={CATEGORY_LABELS}
        value={form.category}
        error={errors.category}
        onChange={(category) => {
          set("category", category);
          set("type", "");
          set("details", {});
        }}
      />
      {form.category && (
        <Select
          label="Tipo"
          value={form.type}
          error={errors.type}
          placeholder="Escolha o tipo"
          options={typeOptions.map((t) => ({ value: t, label: TYPE_LABELS[t] ?? t }))}
          onChange={(e) => set("type", e.target.value)}
        />
      )}
      <ChipGroup
        label="Finalidade"
        options={PROPERTY_PURPOSES}
        labels={PURPOSE_LABELS}
        value={form.purpose}
        error={errors.purpose}
        onChange={(p) => set("purpose", p)}
      />
      <TextField
        label="Título"
        placeholder="Ex.: Apartamento 2 quartos no Centro"
        hint="Como você reconhece esse imóvel na sua carteira."
        value={form.title}
        error={errors.title}
        onChange={(e) => set("title", e.target.value)}
      />
      <Select
        label="Como este imóvel chegou até você?"
        value={form.origin}
        error={errors.origin}
        placeholder="Escolha a origem"
        options={PROPERTY_ORIGINS.map((o) => ({ value: o, label: ORIGIN_LABELS[o] }))}
        onChange={(e) => set("origin", e.target.value as PropertyOrigin)}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Código externo"
          optionalLabel="opcional"
          placeholder="Código na imobiliária ou portal"
          value={form.externalCode}
          onChange={(e) => set("externalCode", e.target.value)}
        />
        <TextField
          label="Link original"
          optionalLabel="opcional"
          placeholder="https://"
          value={form.externalLink}
          onChange={(e) => set("externalLink", e.target.value)}
        />
      </div>
    </>
  );
}

// --- Etapa 2: Localização ----------------------------------------------------

function StepLocation({
  form,
  set,
}: {
  form: WizardForm;
  set: <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => void;
}) {
  const [cepLoading, setCepLoading] = useState(false);

  async function lookupCep(raw: string) {
    const cep = onlyDigits(raw);
    if (cep.length !== 8) return;
    setCepLoading(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = (await response.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (!data.erro) {
        if (data.logradouro) set("street", data.logradouro);
        if (data.bairro) set("neighborhood", data.bairro);
        if (data.localidade) set("city", data.localidade);
        if (data.uf) set("state", data.uf);
      }
    } catch {
      // CEP é atalho: falha silenciosa, o corretor digita manualmente.
    } finally {
      setCepLoading(false);
    }
  }

  const searchHint = [form.street, form.addressNumber, form.neighborhood, form.city, form.state]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-[10rem_1fr]">
        <TextField
          label="CEP"
          inputMode="numeric"
          placeholder="00000-000"
          optionalLabel={cepLoading ? "buscando..." : undefined}
          value={form.zip}
          onChange={(e) => {
            set("zip", e.target.value);
            void lookupCep(e.target.value);
          }}
        />
        <TextField
          label="Logradouro"
          placeholder="Rua, avenida"
          value={form.street}
          onChange={(e) => set("street", e.target.value)}
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        <TextField
          label="Número"
          value={form.addressNumber}
          onChange={(e) => set("addressNumber", e.target.value)}
        />
        <TextField
          label="Complemento"
          optionalLabel="opcional"
          value={form.complement}
          onChange={(e) => set("complement", e.target.value)}
        />
        <TextField
          label="Bairro"
          value={form.neighborhood}
          onChange={(e) => set("neighborhood", e.target.value)}
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-[1fr_8rem]">
        <TextField label="Cidade" value={form.city} onChange={(e) => set("city", e.target.value)} />
        <Select
          label="Estado"
          value={form.state}
          placeholder="UF"
          options={UFS.map((uf) => ({ value: uf.value, label: uf.value }))}
          onChange={(e) => set("state", e.target.value)}
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Condomínio ou empreendimento"
          optionalLabel="opcional"
          value={form.condoName}
          onChange={(e) => set("condoName", e.target.value)}
        />
        <TextField
          label="Ponto de referência"
          optionalLabel="opcional"
          value={form.reference}
          onChange={(e) => set("reference", e.target.value)}
        />
      </div>

      <MapPicker
        latitude={form.latitude}
        longitude={form.longitude}
        searchHint={searchHint}
        onChange={(lat, lng) => {
          set("latitude", lat);
          set("longitude", lng);
        }}
      />

      <Select
        label="Como exibir a localização"
        hint="Usada futuramente no link enviado à lead. Os dados completos ficam só com você."
        value={form.addressDisplay}
        options={ADDRESS_DISPLAY_MODES.map((mode) => ({
          value: mode,
          label: ADDRESS_DISPLAY_LABELS[mode],
        }))}
        onChange={(e) => set("addressDisplay", e.target.value as AddressDisplayMode)}
      />
    </>
  );
}

// --- Etapa 3: Características ------------------------------------------------

function FieldGrid({
  fields,
  values,
  onChange,
}: {
  fields: FieldDef[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  const numbersAndTexts = fields.filter((f) => f.kind !== "boolean");
  const booleans = fields.filter((f) => f.kind === "boolean");
  // Cada tipo de campo ganha máscara, teclado e placeholder adequados.
  const inputModeFor: Record<string, "decimal" | "tel" | "numeric" | "email" | undefined> = {
    number: "decimal",
    phone: "tel",
    date: "numeric",
    email: "email",
  };
  const placeholderFor: Record<string, string | undefined> = {
    phone: "(11) 90000-0000",
    date: "dd/mm/aaaa",
    email: "nome@exemplo.com",
  };
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        {numbersAndTexts.map((field) => (
          <TextField
            key={field.key}
            label={field.label}
            optionalLabel={field.suffix}
            inputMode={inputModeFor[field.kind]}
            placeholder={field.placeholder ?? placeholderFor[field.kind]}
            value={values[field.key] != null ? String(values[field.key]) : ""}
            onChange={(e) => {
              const raw = e.target.value;
              if (field.kind === "number") {
                const cleaned = raw.replace(/[^\d.,]/g, "").replace(",", ".");
                onChange(field.key, cleaned === "" ? undefined : Number(cleaned));
              } else if (field.kind === "phone") {
                onChange(field.key, maskPhone(raw) || undefined);
              } else if (field.kind === "date") {
                onChange(field.key, maskDate(raw) || undefined);
              } else {
                onChange(field.key, raw || undefined);
              }
            }}
          />
        ))}
      </div>
      {booleans.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {booleans.map((field) => (
            <Checkbox
              key={field.key}
              label={field.label}
              checked={Boolean(values[field.key])}
              onChange={(e) => onChange(field.key, e.target.checked || undefined)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function StepDetails({
  form,
  set,
}: {
  form: WizardForm;
  set: <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => void;
}) {
  const [customFeature, setCustomFeature] = useState("");
  const [featureSearch, setFeatureSearch] = useState("");
  const fields = form.category ? DETAIL_FIELDS[form.category] : [];

  const toggleFeature = (feature: string) => {
    set(
      "features",
      form.features.includes(feature)
        ? form.features.filter((f) => f !== feature)
        : [...form.features, feature],
    );
  };

  const visibleSuggestions = useMemo(() => {
    const all = [...new Set([...FEATURE_SUGGESTIONS, ...form.features])];
    if (!featureSearch.trim()) return all;
    return all.filter((f) => f.toLowerCase().includes(featureSearch.toLowerCase()));
  }, [featureSearch, form.features]);

  return (
    <>
      {fields.length > 0 ? (
        <FieldGrid
          fields={fields}
          values={form.details}
          onChange={(key, value) => set("details", { ...form.details, [key]: value })}
        />
      ) : (
        <Banner variant="info">Escolha a categoria na etapa 1 para ver os campos.</Banner>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="prop-desc" className="text-label text-text">
          Descrição
        </label>
        <textarea
          id="prop-desc"
          rows={4}
          placeholder="O que torna esse imóvel especial"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          className="w-full rounded-md border border-border bg-surface px-3.5 py-2.5 text-body text-text placeholder:text-text-subtle focus-visible:border-[var(--border-focus)] focus-visible:shadow-focus"
        />
      </div>

      <fieldset>
        <legend className="text-label text-text">Características e comodidades</legend>
        <input
          value={featureSearch}
          onChange={(e) => setFeatureSearch(e.target.value)}
          placeholder="Buscar característica"
          className="mt-1.5 w-full min-h-[var(--tap-target-min)] rounded-md border border-border bg-surface px-3.5 text-body text-text placeholder:text-text-subtle focus-visible:border-[var(--border-focus)] focus-visible:shadow-focus"
        />
        <div className="mt-2.5 flex flex-wrap gap-2">
          {visibleSuggestions.map((feature) => {
            const active = form.features.includes(feature);
            return (
              <button
                key={feature}
                type="button"
                aria-pressed={active}
                onClick={() => toggleFeature(feature)}
                className={
                  "min-h-9 rounded-full border px-3.5 text-body-sm font-medium transition-colors duration-fast " +
                  (active
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-border bg-surface text-text-muted hover:bg-surface-sunken")
                }
              >
                {feature}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={customFeature}
            onChange={(e) => setCustomFeature(e.target.value)}
            placeholder="Outra característica"
            className="w-full min-h-[var(--tap-target-min)] rounded-md border border-border bg-surface px-3.5 text-body text-text placeholder:text-text-subtle focus-visible:border-[var(--border-focus)] focus-visible:shadow-focus"
            onKeyDown={(e) => {
              if (e.key === "Enter" && customFeature.trim()) {
                e.preventDefault();
                toggleFeature(customFeature.trim());
                setCustomFeature("");
              }
            }}
          />
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (customFeature.trim()) {
                toggleFeature(customFeature.trim());
                setCustomFeature("");
              }
            }}
          >
            Adicionar
          </Button>
        </div>
      </fieldset>
    </>
  );
}

// --- Etapa 4: Valores --------------------------------------------------------

function StepValues({
  form,
  set,
  isSale,
  isRent,
}: {
  form: WizardForm;
  set: <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => void;
  isSale: boolean;
  isRent: boolean;
}) {
  if (!form.purpose) {
    return <Banner variant="info">Escolha a finalidade na etapa 1 para ver os valores.</Banner>;
  }
  return (
    <>
      {isSale && (
        <section className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h3 className="text-h3 text-text">Venda</h3>
          <TextField
            label="Valor de venda"
            leading="R$"
            inputMode="numeric"
            placeholder="450.000"
            value={form.salePrice}
            onChange={(e) => set("salePrice", maskMoney(e.target.value))}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Checkbox
              label="Aceita financiamento"
              checked={form.acceptsFinancing}
              onChange={(e) => set("acceptsFinancing", e.target.checked)}
            />
            <Checkbox
              label="Aceita FGTS"
              checked={form.acceptsFgts}
              onChange={(e) => set("acceptsFgts", e.target.checked)}
            />
            <Checkbox
              label="Aceita permuta"
              checked={form.acceptsTrade}
              onChange={(e) => set("acceptsTrade", e.target.checked)}
            />
            <Checkbox
              label="Valor negociável"
              checked={form.priceNegotiable}
              onChange={(e) => set("priceNegotiable", e.target.checked)}
            />
          </div>
          <TextField
            label="Comissão prevista"
            optionalLabel="dado interno"
            placeholder="Ex.: 6% combinados com o proprietário"
            value={form.commissionNotes}
            onChange={(e) => set("commissionNotes", e.target.value)}
          />
        </section>
      )}

      {isRent && (
        <section className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h3 className="text-h3 text-text">{form.purpose === "temporada" ? "Temporada" : "Locação"}</h3>
          <div className="grid gap-5 sm:grid-cols-3">
            <TextField
              label="Valor mensal"
              leading="R$"
              inputMode="numeric"
              placeholder="2.500"
              value={form.rentPrice}
              onChange={(e) => set("rentPrice", maskMoney(e.target.value))}
            />
            <TextField
              label="Condomínio"
              leading="R$"
              inputMode="numeric"
              value={form.condoFee}
              onChange={(e) => set("condoFee", maskMoney(e.target.value))}
            />
            <TextField
              label="IPTU"
              leading="R$"
              inputMode="numeric"
              value={form.iptu}
              onChange={(e) => set("iptu", maskMoney(e.target.value))}
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Outras taxas"
              optionalLabel="opcional"
              value={form.otherFees}
              onChange={(e) => set("otherFees", e.target.value)}
            />
            <TextField
              label="Garantias aceitas"
              optionalLabel="opcional"
              placeholder="Fiador, caução, seguro-fiança"
              value={form.guaranteeTypes}
              onChange={(e) => set("guaranteeTypes", e.target.value)}
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Prazo mínimo"
              optionalLabel="meses"
              inputMode="numeric"
              value={form.minTermMonths}
              onChange={(e) => set("minTermMonths", onlyDigits(e.target.value))}
            />
            <TextField
              label="Disponível a partir de"
              optionalLabel="opcional"
              type="date"
              value={form.availableFrom}
              onChange={(e) => set("availableFrom", e.target.value)}
            />
          </div>
          <TextField
            label="Observações da locação"
            optionalLabel="opcional"
            value={form.rentNotes}
            onChange={(e) => set("rentNotes", e.target.value)}
          />
        </section>
      )}
    </>
  );
}

// --- Etapa 5: Origem e envolvidos -------------------------------------------

function StepOrigin({
  form,
  set,
  propertyId,
}: {
  form: WizardForm;
  set: <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => void;
  propertyId: string | null;
}) {
  const isPartner = form.origin === "corretor_parceiro";
  // No parceiro, a busca cuida do nome; o resto dos campos segue no grid.
  const fields = form.origin
    ? isPartner
      ? ORIGIN_FIELDS[form.origin].filter((f) => f.key !== "partnerName")
      : ORIGIN_FIELDS[form.origin]
    : [];

  return (
    <>
      <Banner variant="info">
        Estes dados são internos, para o seu dia a dia. Eles não aparecem para a lead.
      </Banner>
      {form.origin && (
        <section className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h3 className="text-h3 text-text">{ORIGIN_LABELS[form.origin]}</h3>
          {isPartner && (
            <PartnerLookup
              value={(form.originDetails.partnerName as string) ?? ""}
              onType={(name) =>
                set("originDetails", { ...form.originDetails, partnerName: name || undefined })
              }
              onPick={(partner) =>
                set("originDetails", {
                  ...form.originDetails,
                  partnerName: partner.name,
                  partnerCreci: partner.creci ?? undefined,
                  partnerWhatsapp: partner.whatsapp ?? undefined,
                  partnerEmail: partner.email ?? undefined,
                  partnerAgency: partner.agencyName ?? undefined,
                })
              }
            />
          )}
          <FieldGrid
            fields={fields}
            values={form.originDetails}
            onChange={(key, value) => set("originDetails", { ...form.originDetails, [key]: value })}
          />
        </section>
      )}
      {propertyId ? (
        <ContactsEditor propertyId={propertyId} />
      ) : (
        <Banner variant="info">Salve a etapa 1 para registrar as pessoas envolvidas.</Banner>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="prop-internal" className="text-label text-text">
          Observações internas
        </label>
        <textarea
          id="prop-internal"
          rows={3}
          placeholder="Só você vê essas anotações"
          value={form.internalNotes}
          onChange={(e) => set("internalNotes", e.target.value)}
          className="w-full rounded-md border border-border bg-surface px-3.5 py-2.5 text-body text-text placeholder:text-text-subtle focus-visible:border-[var(--border-focus)] focus-visible:shadow-focus"
        />
      </div>
    </>
  );
}

// --- Etapa 7: Revisão --------------------------------------------------------

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-body-sm text-text-muted">{label}</dt>
      <dd className="text-right text-body-sm font-semibold text-text">{value}</dd>
    </div>
  );
}

function StepReview({
  form,
  isSale,
  isRent,
}: {
  form: WizardForm;
  isSale: boolean;
  isRent: boolean;
}) {
  const address = [
    form.street && `${form.street}${form.addressNumber ? `, ${form.addressNumber}` : ""}`,
    form.neighborhood,
    form.city && `${form.city}${form.state ? `/${form.state}` : ""}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <section className="divide-y divide-border rounded-xl border border-border bg-surface px-5 py-2 shadow-sm">
        <dl className="divide-y divide-border">
          <ReviewRow label="Título" value={form.title || "Não informado"} />
          <ReviewRow
            label="Categoria e tipo"
            value={
              form.category
                ? `${CATEGORY_LABELS[form.category]} · ${TYPE_LABELS[form.type] ?? form.type}`
                : "Não informado"
            }
          />
          <ReviewRow
            label="Finalidade"
            value={form.purpose ? PURPOSE_LABELS[form.purpose] : "Não informada"}
          />
          <ReviewRow
            label="Origem"
            value={form.origin ? ORIGIN_LABELS[form.origin] : "Não informada"}
          />
          <ReviewRow label="Endereço" value={address || "Não informado"} />
          <ReviewRow
            label="Exibição da localização"
            value={ADDRESS_DISPLAY_LABELS[form.addressDisplay]}
          />
          {isSale && (
            <ReviewRow
              label="Valor de venda"
              value={
                parseMoney(form.salePrice) != null
                  ? formatMoney(parseMoney(form.salePrice) as number)
                  : "A definir"
              }
            />
          )}
          {isRent && (
            <ReviewRow
              label="Valor mensal"
              value={
                parseMoney(form.rentPrice) != null
                  ? formatMoney(parseMoney(form.rentPrice) as number)
                  : "A definir"
              }
            />
          )}
          <ReviewRow
            label="Características"
            value={form.features.length > 0 ? form.features.join(", ") : "Nenhuma marcada"}
          />
        </dl>
      </section>
      <Banner variant="info">
        Tornar disponível deixa o imóvel pronto para, em breve, entrar nas seleções enviadas às
        suas leads. Você também pode manter como rascunho e concluir depois.
      </Banner>
    </>
  );
}
