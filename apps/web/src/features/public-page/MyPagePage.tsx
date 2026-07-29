import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MyPublicPageState,
  PublicPageRequirement,
  PublicPageStatus,
  UpdatePublicPageDto,
} from "@nexlar/shared";
import { normalizeSlug } from "@nexlar/shared";
import { Banner } from "../../components/ui/Banner";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Spinner } from "../../components/ui/Spinner";
import { TextField } from "../../components/ui/TextField";
import { AvatarPhoto } from "../../components/ui/AvatarPhoto";
import { ApiError } from "../../lib/http";
import { useAuth } from "../auth/AuthContext";
import { maskPhone } from "../../lib/masks";
import { ServiceHoursField } from "./ServiceHoursField";
import { TagListInput } from "./TagListInput";
import {
  checkSlug,
  fetchManagedProperties,
  fetchMyPage,
  pausePage,
  publishPage,
  removeAvatar,
  updateMyPage,
  uploadAvatar,
} from "./api";

/**
 * "Minha Página": o corretor monta e administra a vitrine pública dele.
 * A tela orienta antes de mostrar campos: status e progresso primeiro, o que
 * falta em seguida, e o formulário em seções curtas. Mobile first.
 */

const STATUS_META: Record<
  PublicPageStatus,
  { label: string; chip: string; explain: string }
> = {
  rascunho: {
    label: "Rascunho",
    chip: "bg-surface-sunken text-text-muted",
    explain: "Sua página ainda não está no ar. Complete os passos e publique quando quiser.",
  },
  incompleta: {
    label: "Faltam requisitos",
    chip: "bg-warning-soft text-warning-fg",
    explain: "Alguns requisitos estão pendentes. Complete a lista abaixo para publicar.",
  },
  ativa: {
    label: "No ar",
    chip: "bg-success-soft text-[var(--success-fg)]",
    explain: "Sua página está pública. Compartilhe o link com quem quiser.",
  },
  pausada: {
    label: "Pausada",
    chip: "bg-info-soft text-info-fg",
    explain: "A página saiu do ar, mas nada foi apagado. Publique de novo quando quiser.",
  },
  restrita: {
    label: "Restrita",
    chip: "bg-danger-soft text-danger-fg",
    explain: "Esta página foi restringida pela Nexlar. Fale com o suporte para entender o motivo.",
  },
};

/** Campos de texto do formulário (os que viram string simples no PATCH). */
interface FormText {
  professionalName: string;
  headline: string;
  bio: string;
  mainCity: string;
  publicWhatsapp: string;
  publicPhone: string;
  publicEmail: string;
  website: string;
  instagram: string;
  serviceHours: string;
}

interface FormState extends FormText {
  regions: string[];
  focus: "venda" | "locacao" | "ambos" | null;
  propertyTypes: string[];
  languages: string[];
  slug: string;
  acceptTerms: boolean;
}

function fromServer(state: MyPublicPageState): FormState {
  const p = state.page;
  return {
    professionalName: p.professionalName ?? "",
    headline: p.headline ?? "",
    bio: p.bio ?? "",
    mainCity: p.mainCity ?? "",
    // O servidor guarda só dígitos; a tela mostra formatado.
    publicWhatsapp: maskPhone(p.publicWhatsapp ?? ""),
    publicPhone: maskPhone(p.publicPhone ?? ""),
    publicEmail: p.publicEmail ?? "",
    website: p.website ?? "",
    instagram: p.instagram ?? "",
    serviceHours: p.serviceHours ?? "",
    regions: p.regions,
    focus: p.focus,
    propertyTypes: p.propertyTypes,
    languages: p.languages,
    slug: p.slug ?? "",
    acceptTerms: Boolean(p.publicationTermsAcceptedAt),
  };
}

/** Monta o PATCH: texto vazio vira null (limpa), telefones só dígitos. */
function toPayload(form: FormState, jaAceitou: boolean): UpdatePublicPageDto {
  const limpo = (v: string) => (v.trim() === "" ? null : v.trim());
  const digitos = (v: string) => {
    const d = v.replace(/\D/g, "");
    return d === "" ? null : d;
  };
  return {
    professionalName: limpo(form.professionalName),
    headline: limpo(form.headline),
    bio: limpo(form.bio),
    mainCity: limpo(form.mainCity),
    regions: form.regions,
    focus: form.focus,
    propertyTypes: form.propertyTypes,
    languages: form.languages,
    publicWhatsapp: digitos(form.publicWhatsapp),
    publicPhone: digitos(form.publicPhone),
    publicEmail: limpo(form.publicEmail),
    website: limpo(form.website),
    instagram: limpo(form.instagram),
    serviceHours: limpo(form.serviceHours),
    slug: limpo(form.slug),
    ...(form.acceptTerms && !jaAceitou ? { acceptPublicationTerms: true as const } : {}),
  };
}

export function MyPagePage() {
  const queryClient = useQueryClient();

  const consulta = useQuery({ queryKey: ["public-page"], queryFn: fetchMyPage });

  const [form, setForm] = useState<FormState | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const [pendencias, setPendencias] = useState<PublicPageRequirement[] | null>(null);

  // Snapshot do servidor para saber o que está sujo; recarrega quando o
  // servidor responde de novo (depois de salvar, publicar etc.).
  const snapshot = useRef<FormState | null>(null);
  useEffect(() => {
    if (consulta.data && !form) {
      const inicial = fromServer(consulta.data);
      snapshot.current = inicial;
      setForm(inicial);
    }
  }, [consulta.data, form]);

  const aplicar = (state: MyPublicPageState) => {
    queryClient.setQueryData(["public-page"], state);
    const proximo = fromServer(state);
    snapshot.current = proximo;
    setForm(proximo);
  };

  const salvar = useMutation({
    mutationFn: updateMyPage,
    onSuccess: (state) => {
      aplicar(state);
      setErroSalvar(null);
      setSalvo(true);
      setPendencias(null);
      window.setTimeout(() => setSalvo(false), 2500);
    },
    onError: (e) => {
      setSalvo(false);
      setErroSalvar(
        e instanceof ApiError ? e.message : "Não foi possível salvar agora. Tente de novo.",
      );
    },
  });

  const publicar = useMutation({
    mutationFn: publishPage,
    onSuccess: (state) => {
      aplicar(state);
      setPendencias(null);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.details?.requirements) {
        setPendencias(e.details.requirements as PublicPageRequirement[]);
        // A resposta já rebaixou o status; sincroniza a tela.
        void queryClient.invalidateQueries({ queryKey: ["public-page"] });
      } else {
        setErroSalvar("Não foi possível publicar agora. Tente de novo.");
      }
    },
  });

  const pausar = useMutation({
    mutationFn: pausePage,
    onSuccess: aplicar,
  });

  const dirty = useMemo(() => {
    if (!form || !snapshot.current) return false;
    return JSON.stringify(form) !== JSON.stringify(snapshot.current);
  }, [form]);

  if (consulta.isLoading || !form) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <div className="h-36 animate-pulse rounded-2xl bg-surface-sunken" />
        <div className="h-64 animate-pulse rounded-2xl bg-surface-sunken" />
        <div className="h-64 animate-pulse rounded-2xl bg-surface-sunken" />
      </div>
    );
  }

  if (consulta.isError || !consulta.data) {
    return (
      <div className="mx-auto max-w-2xl">
        <Banner variant="danger">
          Não foi possível carregar a sua página.{" "}
          <button type="button" className="font-semibold underline" onClick={() => consulta.refetch()}>
            Tentar de novo
          </button>
        </Banner>
      </div>
    );
  }

  const { page, requirements } = consulta.data;
  const set = <K extends keyof FormState>(campo: K, valor: FormState[K]) =>
    setForm((f) => (f ? { ...f, [campo]: valor } : f));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 pb-24">
      <StatusCard
        state={consulta.data}
        onPublish={() => publicar.mutate()}
        onPause={() => pausar.mutate()}
        publishing={publicar.isPending}
        pausing={pausar.isPending}
      />

      {pendencias && pendencias.length > 0 && (
        <Banner variant="danger">
          <div>
            <p className="font-semibold">Para publicar, ainda falta:</p>
            <ul className="mt-1 list-disc pl-5">
              {pendencias.map((p) => (
                <li key={p.key}>{p.title}</li>
              ))}
            </ul>
          </div>
        </Banner>
      )}

      <SetupChecklist requirements={requirements} />

      <PropertiesShortcut />

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate(toPayload(form, Boolean(page.publicationTermsAcceptedAt)));
        }}
        className="flex flex-col gap-5"
      >
        <IdentitySection form={form} set={set} photoUrl={page.photoUrl} />
        <AddressSection form={form} set={set} currentSlug={page.slug} />
        <WorkSection form={form} set={set} />
        <ContactSection form={form} set={set} />
        <TermsSection form={form} set={set} acceptedAt={page.publicationTermsAcceptedAt} />

        {erroSalvar && <Banner variant="danger">{erroSalvar}</Banner>}

        {/* Barra de salvar fixa: aparece quando há mudança, sempre ao alcance
            do polegar no celular. */}
        {(dirty || salvar.isPending || salvo) && (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface px-4 py-3 backdrop-blur sm:px-6">
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
              <p className="text-body-sm text-text-muted">
                {salvo ? "Alterações salvas." : "Você tem alterações não salvas."}
              </p>
              <Button type="submit" variant="accent" loading={salvar.isPending} disabled={!dirty}>
                {salvar.isPending ? "Salvando..." : "Salvar alterações"}
              </Button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status + link + ações de publicação
// ---------------------------------------------------------------------------

function StatusCard({
  state,
  onPublish,
  onPause,
  publishing,
  pausing,
}: {
  state: MyPublicPageState;
  onPublish: () => void;
  onPause: () => void;
  publishing: boolean;
  pausing: boolean;
}) {
  const { page, requirements } = state;
  const meta = STATUS_META[page.status];
  const [copiado, setCopiado] = useState(false);
  const url = page.slug ? `nexlar.app/corretor/${page.slug}` : null;
  const pct = Math.round((requirements.completed / requirements.total) * 100);

  const copiar = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(`https://${url}`);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem clipboard (contexto inseguro): o link continua visível para copiar à mão.
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-h2 text-text">Sua vitrine</h2>
        <span className={`rounded-full px-2.5 py-1 text-caption font-bold ${meta.chip}`}>
          {meta.label}
        </span>
      </div>
      <p className="mt-1 text-body-sm text-text-muted">{meta.explain}</p>

      {url && (
        <div className="mt-3 flex items-center gap-2 rounded-md bg-surface-sunken px-3 py-2.5">
          <span className="min-w-0 flex-1 truncate text-body-sm font-semibold text-text">{url}</span>
          <button
            type="button"
            onClick={copiar}
            className="flex-none text-body-sm font-semibold text-accent transition-colors hover:text-accent-hover"
          >
            {copiado ? "Copiado!" : "Copiar"}
          </button>
        </div>
      )}

      {/* Progresso da configuração. */}
      {requirements.completed < requirements.total && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between text-caption text-text-muted">
            <span>
              {requirements.completed} de {requirements.total} passos concluídos
            </span>
            <span className="font-semibold">{pct}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {page.status === "ativa" ? (
          <>
            <Button
              type="button"
              variant="accent"
              onClick={() => page.slug && window.open(`/corretor/${page.slug}`, "_blank")}
            >
              Ver minha página no ar
            </Button>
            <Button type="button" variant="ghost" onClick={onPause} loading={pausing}>
              {pausing ? "Pausando..." : "Pausar página"}
            </Button>
          </>
        ) : page.status !== "restrita" ? (
          <Button
            type="button"
            variant="accent"
            onClick={onPublish}
            loading={publishing}
            disabled={!requirements.canPublish && page.status !== "pausada"}
          >
            {publishing ? "Publicando..." : "Publicar página"}
          </Button>
        ) : null}
        {/* Os dois caminhos existem, mas cada um com o seu porquê no rótulo:
            um abre a página de verdade numa aba, o outro mostra como ela fica
            na tela do celular sem você precisar pegar o aparelho. Antes os
            dois se chamavam quase igual e faziam parecer a mesma coisa. */}
        {page.status !== "restrita" && (
          <Link
            to="/minha-pagina/previa"
            className="text-body-sm font-semibold text-accent transition-colors hover:text-accent-hover"
          >
            {page.status === "ativa" ? "Ver no celular" : "Ver como vai ficar"}
          </Link>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Checklist automático (derivado do backend, nunca marcado à mão)
// ---------------------------------------------------------------------------

function SetupChecklist({ requirements }: { requirements: MyPublicPageState["requirements"] }) {
  if (requirements.canPublish) return null;
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
      <h3 className="text-h3 text-text">Primeiros passos da página</h3>
      <p className="mt-0.5 text-body-sm text-text-muted">
        A lista se atualiza sozinha conforme você completa cada parte.
      </p>
      <ul className="mt-4 flex flex-col divide-y divide-border">
        {requirements.items.map((item) => (
          <li key={item.key} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <span
              className={`flex h-6 w-6 flex-none items-center justify-center rounded-full ${
                item.completed ? "bg-success text-white" : "border-2 border-border"
              }`}
              aria-hidden="true"
            >
              {item.completed && (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={`text-body-sm font-semibold ${
                  item.completed ? "text-text-subtle line-through" : "text-text"
                }`}
              >
                {item.title}
              </p>
              {!item.completed && item.description && (
                <p className="text-caption text-text-muted">{item.description}</p>
              )}
            </div>
            {!item.completed && item.actionUrl && item.actionUrl !== "/minha-pagina" && (
              <Link
                to={item.actionUrl}
                className="flex-none text-body-sm font-semibold text-accent transition-colors hover:text-accent-hover"
              >
                Resolver
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Atalho para o gerenciador de imóveis da vitrine
// ---------------------------------------------------------------------------

/**
 * Os imóveis são a razão da página existir, então o atalho já mostra quantos
 * estão no ar. Sem número, o corretor precisaria entrar para saber se a
 * vitrine tem algo dentro.
 */
function PropertiesShortcut() {
  const consulta = useQuery({
    queryKey: ["public-page", "imoveis"],
    queryFn: fetchManagedProperties,
  });
  const resumo = consulta.data?.summary;

  return (
    <Link
      to="/minha-pagina/imoveis"
      className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm transition-colors hover:border-accent sm:p-6"
    >
      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-accent-soft text-accent">
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 10.5L12 4l8 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5.5 9.5V20h13V9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-h3 text-text">Imóveis da página</h3>
        <p className="text-body-sm text-text-muted">
          {resumo
            ? resumo.publicados === 0
              ? "Nenhum imóvel na sua vitrine ainda."
              : `${resumo.publicados} ${resumo.publicados === 1 ? "imóvel" : "imóveis"} no ar` +
                (resumo.comPendencia > 0 ? ` · ${resumo.comPendencia} com pendência` : "")
            : "Escolha o que aparece para quem visita."}
        </p>
      </div>
      <svg className="h-5 w-5 flex-none text-text-subtle" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Seções do formulário
// ---------------------------------------------------------------------------

type SetFn = <K extends keyof FormState>(campo: K, valor: FormState[K]) => void;

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
      <h3 className="text-h3 text-text">{title}</h3>
      {hint && <p className="mt-0.5 text-body-sm text-text-muted">{hint}</p>}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function IdentitySection({
  form,
  set,
  photoUrl,
}: {
  form: FormState;
  set: SetFn;
  photoUrl: string | null;
}) {
  const queryClient = useQueryClient();
  const { atualizarBroker } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [erroFoto, setErroFoto] = useState<string | null>(null);

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["public-page"] });

  const enviar = useMutation({
    mutationFn: uploadAvatar,
    onSuccess: (perfil) => {
      atualizarBroker(perfil);
      setErroFoto(null);
      void invalidar();
    },
    onError: (e) =>
      setErroFoto(e instanceof ApiError ? e.message : "Não foi possível enviar a foto."),
  });

  const remover = useMutation({
    mutationFn: removeAvatar,
    onSuccess: (perfil) => {
      atualizarBroker(perfil);
      void invalidar();
    },
  });

  return (
    <Section
      title="Identidade"
      hint="Como você se apresenta para quem chega na sua página."
    >
      <div className="flex items-center gap-4">
        <AvatarPhoto src={photoUrl} name={form.professionalName || "?"} className="h-20 w-20" />
        <div className="flex flex-col items-start gap-1.5">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const foto = e.target.files?.[0];
              if (foto) enviar.mutate(foto);
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              loading={enviar.isPending}
              onClick={() => fileRef.current?.click()}
            >
              {enviar.isPending ? "Enviando..." : photoUrl ? "Trocar foto" : "Enviar foto"}
            </Button>
            {photoUrl && (
              <button
                type="button"
                onClick={() => remover.mutate()}
                className="text-body-sm font-semibold text-text-muted transition-colors hover:text-danger"
              >
                Remover
              </button>
            )}
          </div>
          <p className="text-caption text-text-subtle">JPG, PNG ou WEBP, até 5 MB.</p>
        </div>
      </div>
      {erroFoto && <Banner variant="danger">{erroFoto}</Banner>}

      <TextField
        label="Nome profissional"
        value={form.professionalName}
        onChange={(e) => set("professionalName", e.target.value)}
        placeholder="Como você assina no mercado"
        maxLength={80}
      />
      <TextField
        label="Título ou especialidade"
        optionalLabel="opcional"
        value={form.headline}
        onChange={(e) => set("headline", e.target.value)}
        placeholder="Ex.: Especialista em apartamentos na Zona Sul"
        maxLength={120}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pp-bio" className="flex items-baseline justify-between gap-2 text-label text-text">
          <span>Sobre você</span>
          <span className="font-normal text-caption text-text-subtle">opcional</span>
        </label>
        <textarea
          id="pp-bio"
          value={form.bio}
          onChange={(e) => set("bio", e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Conte em poucas linhas sua experiência e seu jeito de trabalhar."
          className="w-full rounded-md border border-border bg-surface px-3.5 py-2.5 text-body text-text placeholder:text-text-subtle transition-colors duration-fast focus-visible:border-[var(--border-focus)] focus-visible:shadow-focus focus-visible:outline-none"
        />
      </div>
    </Section>
  );
}

function AddressSection({
  form,
  set,
  currentSlug,
}: {
  form: FormState;
  set: SetFn;
  currentSlug: string | null;
}) {
  const canonico = normalizeSlug(form.slug);
  const [debounced, setDebounced] = useState(canonico);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(canonico), 400);
    return () => window.clearTimeout(t);
  }, [canonico]);

  const consulta = useQuery({
    queryKey: ["public-page", "slug", debounced],
    queryFn: () => checkSlug(debounced),
    enabled: debounced.length > 0 && debounced !== (currentSlug ?? ""),
    staleTime: 30_000,
  });

  let feedback: { tom: "ok" | "erro" | "neutro"; texto: string } | null = null;
  if (canonico && canonico === currentSlug) {
    feedback = { tom: "ok", texto: "Este é o seu endereço atual." };
  } else if (canonico && consulta.data && debounced === canonico) {
    feedback = consulta.data.available
      ? { tom: "ok", texto: "Disponível!" }
      : { tom: "erro", texto: consulta.data.message ?? "Indisponível." };
  } else if (canonico && consulta.isFetching) {
    feedback = { tom: "neutro", texto: "Verificando..." };
  }

  return (
    <Section
      title="Endereço da página"
      hint="O link que você vai divulgar. Curto e fácil de lembrar."
    >
      {/* Campo com o prefixo fixo fora do input: o leading do TextField é
          para prefixos curtos (R$) e "corretor/" atropelava o texto. */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pp-slug" className="text-label text-text">
          Endereço
        </label>
        <div className="flex min-h-[var(--tap-target-min)] items-stretch overflow-hidden rounded-md border border-border bg-surface transition-colors focus-within:border-[var(--border-focus)] focus-within:shadow-focus">
          <span className="flex items-center border-r border-border bg-surface-sunken px-3 text-body-sm text-text-muted">
            corretor/
          </span>
          <input
            id="pp-slug"
            value={form.slug}
            onChange={(e) => set("slug", e.target.value)}
            placeholder="seu-nome"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="w-full min-w-0 bg-transparent px-3 text-body text-text placeholder:text-text-subtle focus:outline-none"
          />
        </div>
        <p className="text-caption text-text-subtle">
          {canonico ? `Sua página: nexlar.app/corretor/${canonico}` : "Ex.: ana-imoveis"}
        </p>
      </div>
      {feedback && (
        <p
          className={`-mt-2 flex items-center gap-1.5 text-body-sm font-semibold ${
            feedback.tom === "ok"
              ? "text-[var(--success-fg)]"
              : feedback.tom === "erro"
                ? "text-danger-fg"
                : "text-text-muted"
          }`}
          role="status"
        >
          {feedback.tom === "neutro" && <Spinner className="h-4 w-4 text-text-muted" />}
          {feedback.texto}
        </p>
      )}
    </Section>
  );
}

function WorkSection({ form, set }: { form: FormState; set: SetFn }) {
  return (
    <Section title="Atuação" hint="Onde e com o que você trabalha.">
      <TextField
        label="Cidade principal"
        value={form.mainCity}
        onChange={(e) => set("mainCity", e.target.value)}
        placeholder="Ex.: São Paulo"
        maxLength={80}
      />
      <TagListInput
        label="Regiões atendidas"
        values={form.regions}
        onChange={(v) => set("regions", v)}
        placeholder="Ex.: Moema"
      />

      {/* Foco do negócio: controle segmentado, um toque. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-label text-text">Foco do negócio</span>
        <div className="grid grid-cols-3 gap-1 rounded-md bg-surface-sunken p-1" role="radiogroup">
          {(
            [
              ["venda", "Venda"],
              ["locacao", "Locação"],
              ["ambos", "Ambos"],
            ] as const
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={form.focus === valor}
              onClick={() => set("focus", form.focus === valor ? null : valor)}
              className={`min-h-[38px] rounded-[6px] text-body-sm font-semibold transition-colors ${
                form.focus === valor
                  ? "bg-surface text-text shadow-sm"
                  : "text-text-muted hover:text-text"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      <TagListInput
        label="Tipos de imóveis"
        values={form.propertyTypes}
        onChange={(v) => set("propertyTypes", v)}
        placeholder="Ex.: Cobertura"
        suggestions={["Apartamento", "Casa", "Terreno", "Comercial", "Lançamento"]}
      />
      <TagListInput
        label="Idiomas de atendimento"
        values={form.languages}
        onChange={(v) => set("languages", v)}
        placeholder="Ex.: Inglês"
        suggestions={["Português", "Inglês", "Espanhol"]}
        max={8}
      />
    </Section>
  );
}

function ContactSection({ form, set }: { form: FormState; set: SetFn }) {
  return (
    <Section
      title="Contato público"
      hint="O que aparece na página. Pode ser diferente do contato da sua conta."
    >
      {/* Máscara na digitação, como no cadastro de lead. O payload manda só
          dígitos, então o formato aqui é conforto de leitura. */}
      <TextField
        label="WhatsApp"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        value={form.publicWhatsapp}
        onChange={(e) => set("publicWhatsapp", maskPhone(e.target.value))}
        placeholder="(11) 99999-8888"
        hint="É por aqui que os interessados vão falar com você."
      />
      <TextField
        label="Telefone"
        optionalLabel="opcional"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        value={form.publicPhone}
        onChange={(e) => set("publicPhone", maskPhone(e.target.value))}
        placeholder="(11) 3333-2222"
      />
      <TextField
        label="E-mail público"
        optionalLabel="opcional"
        type="email"
        inputMode="email"
        value={form.publicEmail}
        onChange={(e) => set("publicEmail", e.target.value)}
        placeholder="contato@exemplo.com"
      />
      <TextField
        label="Site"
        optionalLabel="opcional"
        type="url"
        inputMode="url"
        value={form.website}
        onChange={(e) => set("website", e.target.value)}
        placeholder="https://..."
      />
      <TextField
        label="Instagram"
        optionalLabel="opcional"
        value={form.instagram}
        onChange={(e) => set("instagram", e.target.value)}
        placeholder="@seuperfil"
      />
      <ServiceHoursField
        value={form.serviceHours}
        onChange={(v) => set("serviceHours", v)}
      />
    </Section>
  );
}

function TermsSection({
  form,
  set,
  acceptedAt,
}: {
  form: FormState;
  set: SetFn;
  acceptedAt: string | null;
}) {
  if (acceptedAt) {
    const data = new Date(acceptedAt).toLocaleDateString("pt-BR");
    return (
      <Section title="Termos de publicação">
        <p className="text-body-sm text-text-muted">
          Você aceitou os termos de publicação em {data}. O conteúdo da página é de sua
          responsabilidade.
        </p>
      </Section>
    );
  }

  return (
    <Section
      title="Termos de publicação"
      hint="Necessário uma única vez, antes de publicar."
    >
      <Checkbox
        checked={form.acceptTerms}
        onChange={(e) => set("acceptTerms", e.target.checked)}
        label={
          <>
            Declaro que as informações e fotos publicadas são verdadeiras e autorizadas, e que sou
            responsável pelo conteúdo da minha página, conforme os{" "}
            <Link to="/termos" target="_blank" className="font-semibold text-accent underline">
              Termos de Uso
            </Link>
            .
          </>
        }
      />
    </Section>
  );
}
