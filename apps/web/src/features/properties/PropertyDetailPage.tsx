import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PropertyStatus } from "@nexlar/shared";
import { Button } from "../../components/ui/Button";
import { Banner } from "../../components/ui/Banner";
import { Spinner } from "../../components/ui/Spinner";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { ApiError } from "../../lib/http";
import {
  AVAILABLE_STATUS_ACTIONS,
  changePropertyStatus,
  confirmAvailability,
  deleteProperty,
  duplicateProperty,
  fetchProperty,
} from "./api";
import { SendToLeadModal } from "../sharing/SendToLeadModal";
import { PropertySharesSection } from "../sharing/PropertySharesSection";
import { AuthImage } from "./AuthImage";
import { DETAIL_FIELDS, ORIGIN_FIELDS } from "./fields";
import {
  ADDRESS_DISPLAY_LABELS,
  CATEGORY_LABELS,
  CONTACT_ROLE_LABELS,
  MEDIA_ORIGIN_LABELS,
  ORIGIN_LABELS,
  PHOTO_ROOM_LABELS,
  PURPOSE_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
  TYPE_LABELS,
  formatCode,
  formatMoney,
  mainPrice,
} from "./labels";

const TONE_CLASSES: Record<string, string> = {
  success: "bg-[var(--success-soft)] text-[var(--success-fg)]",
  accent: "bg-accent-soft text-accent",
  danger: "bg-[var(--danger-soft)] text-[var(--danger-fg)]",
  neutral: "bg-surface-sunken text-text-muted",
};

/** Ficha completa: tudo que o corretor precisa para trabalhar o imóvel. */
export function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const query = useQuery({
    queryKey: ["property", id],
    queryFn: () => fetchProperty(id as string),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (!statusMenuOpen && !moreMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setStatusMenuOpen(false);
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node))
        setMoreMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [statusMenuOpen, moreMenuOpen]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["property", id] });
    void queryClient.invalidateQueries({ queryKey: ["properties"] });
  };

  const statusMutation = useMutation({
    mutationFn: (status: PropertyStatus) => changePropertyStatus(id as string, { status }),
    onSuccess: () => {
      invalidate();
      setStatusMenuOpen(false);
      setActionError(null);
    },
    onError: (e) =>
      setActionError(
        e instanceof ApiError && e.status !== 500 ? e.message : "Não foi possível mudar o status.",
      ),
  });

  const availabilityMutation = useMutation({
    mutationFn: () => confirmAvailability(id as string, {}),
    onSuccess: invalidate,
  });

  const duplicateMutation = useMutation({
    mutationFn: () => duplicateProperty(id as string),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["properties"] });
      navigate(`/imoveis/${created.id}/editar`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteProperty(id as string),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["properties"] });
      navigate("/imoveis");
    },
  });

  if (query.isPending) {
    return (
      <div className="flex justify-center py-16" role="status" aria-label="Carregando imóvel">
        <Spinner className="h-8 w-8 text-accent" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <Banner variant="danger">Não foi possível carregar este imóvel.</Banner>
        <Button type="button" variant="ghost" className="self-start" onClick={() => navigate("/imoveis")}>
          Voltar para a carteira
        </Button>
      </div>
    );
  }

  const p = query.data;
  const photos = p.media.filter((m) => m.kind === "foto" && m.status === "pronto");
  const cover = photos.find((m) => m.isCover) ?? photos[0];
  const others = photos.filter((m) => m.id !== cover?.id).slice(0, 4);
  const links = p.media.filter((m) => m.kind === "link_externo");
  const detailFields = DETAIL_FIELDS[p.category].filter((f) => {
    const v = (p.details ?? {})[f.key as keyof typeof p.details];
    return v !== undefined && v !== null && v !== false && v !== "";
  });
  const originFields = ORIGIN_FIELDS[p.origin].filter((f) => {
    const v = (p.originDetails ?? {})[f.key as keyof typeof p.originDetails];
    return v !== undefined && v !== null && v !== "" && v !== false;
  });
  const address = [
    p.street && `${p.street}${p.addressNumber ? `, ${p.addressNumber}` : ""}`,
    p.complement,
    p.neighborhood,
    p.city && `${p.city}${p.state ? `/${p.state}` : ""}`,
    p.zip,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      {actionError && <Banner variant="danger">{actionError}</Banner>}

      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-caption font-semibold uppercase tracking-wide text-text-subtle">
              {formatCode(p.code)} · {CATEGORY_LABELS[p.category]} ·{" "}
              {TYPE_LABELS[p.type] ?? p.type} · {PURPOSE_LABELS[p.purpose]}
            </p>
            <h2 className="mt-1 text-h1 text-text">{p.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-1 text-caption font-semibold ${TONE_CLASSES[STATUS_TONES[p.status]]}`}
              >
                {STATUS_LABELS[p.status]}
              </span>
              <span className="text-body-sm text-text-muted">{ORIGIN_LABELS[p.origin]}</span>
            </div>
          </div>
          <p className="text-h2 font-bold text-text">{mainPrice(p)}</p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <Button type="button" variant="accent" onClick={() => setSendOpen(true)}>
            Enviar para uma lead
          </Button>
          <Button type="button" variant="ghost" onClick={() => navigate(`/imoveis/${p.id}/editar`)}>
            Editar
          </Button>
          <div className="relative" ref={menuRef}>
            <Button
              type="button"
              variant="ghost"
              aria-expanded={statusMenuOpen}
              onClick={() => setStatusMenuOpen((v) => !v)}
            >
              Alterar status
            </Button>
            {statusMenuOpen && (
              <div className="absolute left-0 top-full z-20 mt-1.5 w-60 overflow-hidden rounded-xl border border-border bg-surface py-1.5 shadow-md">
                {AVAILABLE_STATUS_ACTIONS.filter((a) => a.status !== p.status).map((action) => (
                  <button
                    key={action.status}
                    type="button"
                    onClick={() => statusMutation.mutate(action.status)}
                    className="block w-full px-4 py-2.5 text-left text-body-sm text-text hover:bg-surface-sunken"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative" ref={moreMenuRef}>
            <Button
              type="button"
              variant="ghost"
              aria-label="Mais ações"
              aria-expanded={moreMenuOpen}
              loading={duplicateMutation.isPending}
              onClick={() => setMoreMenuOpen((v) => !v)}
              className="px-3"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="1.9" />
                <circle cx="12" cy="12" r="1.9" />
                <circle cx="19" cy="12" r="1.9" />
              </svg>
            </Button>
            {moreMenuOpen && (
              <div className="absolute right-0 top-full z-20 mt-1.5 w-56 overflow-hidden rounded-xl border border-border bg-surface py-1.5 shadow-md">
                <button
                  type="button"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    duplicateMutation.mutate();
                  }}
                  className="block w-full px-4 py-3 text-left text-body-sm text-text hover:bg-surface-sunken"
                >
                  Duplicar imóvel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    setConfirmDelete(true);
                  }}
                  className="block w-full px-4 py-3 text-left text-body-sm font-semibold text-[var(--danger-fg)] hover:bg-surface-sunken"
                >
                  Excluir imóvel
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {(cover || others.length > 0) && (
        <section className="grid gap-2 sm:grid-cols-[2fr_1fr]">
          {cover?.url && (
            <AuthImage
              src={cover.url}
              alt={cover.caption ?? p.title}
              className="aspect-[16/10] w-full rounded-2xl border border-border object-cover"
            />
          )}
          {others.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {others.map((photo) => (
                <AuthImage
                  key={photo.id}
                  src={photo.url as string}
                  alt={photo.caption ?? (photo.room ? PHOTO_ROOM_LABELS[photo.room] : p.title)}
                  className="aspect-square w-full rounded-xl border border-border object-cover"
                />
              ))}
            </div>
          )}
        </section>
      )}

      <section
        className={`rounded-2xl border p-5 shadow-sm transition-colors ${
          p.availabilityConfirmed
            ? "border-[color-mix(in_srgb,var(--success)_40%,transparent)] bg-[var(--success-soft)]"
            : "border-border bg-surface"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                p.availabilityConfirmed
                  ? "bg-[var(--success)] text-white"
                  : "bg-surface-sunken text-text-subtle"
              }`}
            >
              {p.availabilityConfirmed ? (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M12 8v4.5l2.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <div>
              <h3 className="text-h3 text-text">
                {p.availabilityConfirmed ? "Disponibilidade confirmada" : "Disponibilidade"}
              </h3>
              <p className="mt-1 text-body-sm text-text-muted">
                {p.availabilityConfirmed && p.availabilityConfirmedAt
                  ? `Confirmada em ${new Date(p.availabilityConfirmedAt).toLocaleDateString("pt-BR")}${p.availabilityConfirmedBy ? ` por ${p.availabilityConfirmedBy}` : ""}.`
                  : "Ainda sem confirmação. Confirme antes de apresentar o imóvel a uma lead."}
              </p>
              {p.availabilityNote && (
                <p className="mt-1 text-body-sm text-text-subtle">{p.availabilityNote}</p>
              )}
            </div>
          </div>
          <Button
            type="button"
            variant={p.availabilityConfirmed ? "success" : "accent"}
            loading={availabilityMutation.isPending}
            onClick={() => availabilityMutation.mutate()}
            title={p.availabilityConfirmed ? "Reconfirmar com a data de hoje" : undefined}
          >
            {p.availabilityConfirmed ? (
              <>
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Confirmada
              </>
            ) : (
              "Confirmar disponibilidade"
            )}
          </Button>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Localização">
          <Row label="Endereço" value={address || "Não informado"} />
          {p.condoName && <Row label="Condomínio" value={p.condoName} />}
          {p.reference && <Row label="Referência" value={p.reference} />}
          <Row label="Exibição futura" value={ADDRESS_DISPLAY_LABELS[p.addressDisplay]} />
          {p.latitude != null && p.longitude != null && (
            <Row label="Coordenadas" value={`${p.latitude}, ${p.longitude}`} />
          )}
        </Section>

        <Section title="Valores">
          {p.salePrice != null && <Row label="Venda" value={formatMoney(p.salePrice)} />}
          {p.rentPrice != null && <Row label="Locação" value={`${formatMoney(p.rentPrice)}/mês`} />}
          {p.condoFee != null && <Row label="Condomínio" value={formatMoney(p.condoFee)} />}
          {p.iptu != null && <Row label="IPTU" value={formatMoney(p.iptu)} />}
          {p.guaranteeTypes && <Row label="Garantias" value={p.guaranteeTypes} />}
          {p.acceptsFinancing && <Row label="Financiamento" value="Aceita" />}
          {p.acceptsFgts && <Row label="FGTS" value="Aceita" />}
          {p.acceptsTrade && <Row label="Permuta" value="Aceita" />}
          {p.priceNegotiable && <Row label="Valor" value="Negociável" />}
          {p.commissionNotes && <Row label="Comissão (interno)" value={p.commissionNotes} />}
          {p.salePrice == null && p.rentPrice == null && (
            <p className="py-2 text-body-sm text-text-muted">Valores ainda não informados.</p>
          )}
        </Section>

        <Section title="Características">
          {detailFields.length > 0 ? (
            detailFields.map((f) => {
              const raw = (p.details ?? {})[f.key as keyof typeof p.details];
              return (
                <Row
                  key={f.key}
                  label={f.label}
                  value={
                    typeof raw === "boolean" ? "Sim" : `${String(raw)}${f.suffix ? ` ${f.suffix}` : ""}`
                  }
                />
              );
            })
          ) : (
            <p className="py-2 text-body-sm text-text-muted">
              Nenhum campo específico preenchido ainda.
            </p>
          )}
          {p.features.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-3">
              {p.features.map((feature) => (
                <span
                  key={feature}
                  className="rounded-full bg-surface-sunken px-2.5 py-1 text-caption font-medium text-text-muted"
                >
                  {feature}
                </span>
              ))}
            </div>
          )}
        </Section>

        <Section title={`Origem: ${ORIGIN_LABELS[p.origin]}`}>
          {originFields.length > 0 ? (
            originFields.map((f) => {
              const raw = (p.originDetails ?? {})[f.key as keyof typeof p.originDetails];
              return (
                <Row key={f.key} label={f.label} value={typeof raw === "boolean" ? "Sim" : String(raw)} />
              );
            })
          ) : (
            <p className="py-2 text-body-sm text-text-muted">Sem dados adicionais da origem.</p>
          )}
          {p.externalCode && <Row label="Código externo" value={p.externalCode} />}
          {p.externalLink && (
            <div className="py-2">
              <a
                href={p.externalLink}
                target="_blank"
                rel="noreferrer"
                className="text-body-sm font-semibold text-accent hover:underline"
              >
                Abrir anúncio original
              </a>
            </div>
          )}
          <p className="pt-2 text-caption text-text-subtle">
            Dados internos: não aparecem para a lead.
          </p>
        </Section>
      </div>

      {p.description && (
        <Section title="Descrição">
          <p className="whitespace-pre-line py-1 text-body text-text-muted">{p.description}</p>
        </Section>
      )}

      <Section title="Pessoas envolvidas">
        {p.contacts.length > 0 ? (
          <ul className="divide-y divide-border">
            {p.contacts.map((contact) => (
              <li key={contact.id} className="py-3">
                <p className="text-body font-semibold text-text">{contact.name}</p>
                <p className="mt-0.5 text-body-sm text-text-muted">
                  {contact.roles.map((r) => CONTACT_ROLE_LABELS[r]).join(" · ")}
                </p>
                {(contact.whatsapp || contact.phone || contact.email) && (
                  <p className="mt-0.5 text-body-sm text-text-subtle">
                    {[contact.whatsapp ?? contact.phone, contact.email].filter(Boolean).join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-2 text-body-sm text-text-muted">
            Nenhuma pessoa registrada. Adicione na edição, etapa "Origem e envolvidos".
          </p>
        )}
      </Section>

      {(links.length > 0 || p.media.some((m) => m.kind === "video")) && (
        <Section title="Vídeos e links">
          <ul className="flex flex-col gap-2 py-1">
            {p.media
              .filter((m) => m.kind === "video")
              .map((video) => (
                <li key={video.id} className="text-body-sm text-text-muted">
                  Vídeo · {MEDIA_ORIGIN_LABELS[video.origin]} ·{" "}
                  {video.status === "pronto" ? (
                    <a
                      href={video.url ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-accent hover:underline"
                    >
                      Assistir
                    </a>
                  ) : (
                    "processando"
                  )}
                </li>
              ))}
            {links.map((link) => (
              <li key={link.id}>
                <a
                  href={link.externalUrl ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="text-body-sm font-semibold text-accent hover:underline"
                >
                  {link.caption || link.externalUrl}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {p.internalNotes && (
        <Section title="Observações internas">
          <p className="whitespace-pre-line py-1 text-body-sm text-text-muted">{p.internalNotes}</p>
        </Section>
      )}

      <PropertySharesSection propertyId={p.id} />

      <p className="pb-4 text-caption text-text-subtle">
        Cadastrado em {new Date(p.createdAt).toLocaleDateString("pt-BR")} · Atualizado em{" "}
        {new Date(p.updatedAt).toLocaleDateString("pt-BR")}
      </p>

      <ConfirmDialog
        open={confirmDelete}
        title="Excluir imóvel"
        description={`Excluir ${formatCode(p.code)} · ${p.title}? Fotos e vídeos serão apagados. Essa ação não pode ser desfeita. Se quiser só tirar da carteira ativa, prefira arquivar.`}
        confirmLabel="Excluir definitivamente"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />

      {sendOpen && <SendToLeadModal property={p} onClose={() => setSendOpen(false)} />}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <h3 className="mb-2 text-h3 text-text">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2 last:border-b-0">
      <dt className="shrink-0 text-body-sm text-text-muted">{label}</dt>
      <dd className="text-right text-body-sm font-semibold text-text">{value}</dd>
    </div>
  );
}
