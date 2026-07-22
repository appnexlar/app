import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PropertySummary } from "@nexlar/shared";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { Banner } from "../../components/ui/Banner";
import { fetchProperties } from "../properties/api";
import { AuthImage } from "../properties/AuthImage";
import { TYPE_LABELS, mainPrice } from "../properties/labels";
import { displayWhatsapp } from "../leads/labels";
import { createShare, publicShareUrl, whatsappDigits } from "./api";

type Step = "property" | "review" | "done";

interface LeadRef {
  id: string;
  fullName: string;
  whatsapp: string;
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full;
}

function defaultMessage(leadName: string): string {
  return `Olá, ${firstName(leadName)}! Separei este imóvel com base no que conversamos. Veja os detalhes neste link:`;
}

/**
 * Enviar um imóvel da carteira para esta lead. Reusa exatamente o mesmo fluxo
 * de compartilhamento do módulo de imóveis (createShare); aqui só invertemos o
 * seletor: em vez de escolher a lead, o corretor escolhe o imóvel.
 */
export function SendFromLeadModal({ lead, onClose }: { lead: LeadRef | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("property");
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [property, setProperty] = useState<PropertySummary | null>(null);
  const [message, setMessage] = useState("");
  const [sharedUrl, setSharedUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const query = useQuery({
    queryKey: ["properties", { q: applied || undefined, status: "disponivel", perPage: 20, sort: "recentes" }],
    queryFn: () =>
      fetchProperties({ q: applied || undefined, status: "disponivel", perPage: 20, sort: "recentes" }),
    enabled: Boolean(lead) && step === "property",
    placeholderData: keepPreviousData,
  });

  const items = useMemo(() => query.data?.items ?? [], [query.data]);

  const mutation = useMutation({
    mutationFn: (waWindow: Window | null) => {
      if (!property || !lead) throw new Error("missing");
      return createShare(property.id, { leadId: lead.id, message: message || undefined }).then((share) => ({
        share,
        waWindow,
      }));
    },
    onSuccess: ({ share, waWindow }) => {
      const url = publicShareUrl(share.publicToken);
      setSharedUrl(url);
      const text = `${message || defaultMessage(lead!.fullName)}\n${url}`;
      const waLink = `https://wa.me/${whatsappDigits(lead!.whatsapp)}?text=${encodeURIComponent(text)}`;
      if (waWindow) waWindow.location.href = waLink;
      else window.open(waLink, "_blank", "noopener");
      queryClient.invalidateQueries({ queryKey: ["lead-shares", lead!.id] });
      queryClient.invalidateQueries({ queryKey: ["lead", lead!.id] });
      setStep("done");
    },
  });

  if (!lead) return null;

  const pick = (p: PropertySummary) => {
    setProperty(p);
    setMessage(defaultMessage(lead.fullName));
    setStep("review");
  };

  const confirm = () => {
    const waWindow = window.open("", "_blank");
    mutation.mutate(waWindow);
  };

  const title =
    step === "property" ? "Enviar imóvel" : step === "review" ? "Revisar o envio" : "Imóvel enviado";

  return (
    <Modal open onClose={onClose} title={title}>
      {step === "property" && (
        <div className="flex flex-col">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setApplied(search.trim());
            }}
          >
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar imóvel por título, código ou endereço"
              className="w-full min-h-[var(--tap-target-min)] rounded-md border border-border bg-surface px-3.5 text-body text-text placeholder:text-text-subtle focus-visible:border-[var(--border-focus)] focus-visible:shadow-focus"
            />
          </form>
          <div className="mt-3 max-h-[min(50dvh,26rem)] overflow-y-auto">
            {query.isPending ? (
              <p className="py-8 text-center text-body-sm text-text-subtle">Carregando imóveis...</p>
            ) : query.isError ? (
              <Banner variant="danger">Não foi possível carregar sua carteira.</Banner>
            ) : items.length === 0 ? (
              <p className="py-8 text-center text-body-sm text-text-muted">
                Nenhum imóvel disponível encontrado.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {items.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => pick(p)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-sunken"
                    >
                      <span className="h-12 w-14 shrink-0 overflow-hidden rounded-md border border-border bg-surface-sunken">
                        {p.coverUrl ? (
                          <AuthImage src={p.coverUrl} alt={p.title} className="h-full w-full object-cover" />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body font-semibold text-text">{p.title}</span>
                        <span className="block truncate text-body-sm text-text-muted">
                          {TYPE_LABELS[p.type] ?? p.type}
                          {p.city ? ` · ${[p.neighborhood, p.city].filter(Boolean).join(", ")}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-body-sm font-bold tabular-nums text-text">
                        {mainPrice(p)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {step === "review" && property && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-3 rounded-xl border border-border bg-surface-sunken/50 p-3">
            <div className="h-16 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-sunken">
              {property.coverUrl ? (
                <AuthImage src={property.coverUrl} alt={property.title} className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0">
              <p className="truncate text-body font-semibold text-text">{property.title}</p>
              <p className="text-body-sm text-text-muted">
                {TYPE_LABELS[property.type] ?? property.type}
                {property.city ? ` · ${[property.neighborhood, property.city].filter(Boolean).join(", ")}` : ""}
              </p>
              <p className="mt-0.5 text-body-sm font-bold text-text">{mainPrice(property)}</p>
            </div>
          </div>

          <div className="rounded-xl border border-border p-3">
            <p className="text-caption text-text-subtle">Enviando para</p>
            <p className="text-body font-semibold text-text">{lead.fullName}</p>
            <p className="text-body-sm text-text-muted">{displayWhatsapp(lead.whatsapp)}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="send-message" className="text-label text-text">
              Mensagem
            </label>
            <textarea
              id="send-message"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3.5 py-2.5 text-body text-text placeholder:text-text-subtle focus-visible:border-[var(--border-focus)] focus-visible:shadow-focus"
            />
            <p className="text-caption text-text-subtle">O link do imóvel é adicionado automaticamente ao final.</p>
          </div>

          {mutation.isError && (
            <Banner variant="danger">Não foi possível preparar o envio. Tente novamente.</Banner>
          )}

          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => setStep("property")} disabled={mutation.isPending}>
              Trocar imóvel
            </Button>
            <Button type="button" variant="accent" loading={mutation.isPending} onClick={confirm}>
              {mutation.isPending ? "Preparando..." : "Gerar link e abrir WhatsApp"}
            </Button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--success-soft)] text-[var(--success-fg)]">
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="mt-4 text-body font-semibold text-text">Imóvel preparado para envio</p>
          <p className="mt-1 text-body-sm text-text-muted">
            O WhatsApp foi aberto com a mensagem pronta. O envio já aparece nos imóveis desta lead.
          </p>
          <div className="mt-4 flex w-full items-center gap-2 rounded-lg border border-border bg-surface-sunken/50 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-caption text-text-muted">{sharedUrl}</span>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(sharedUrl);
                setCopied(true);
              }}
              className="shrink-0 text-caption font-semibold text-accent hover:text-accent-hover"
            >
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
          <Button type="button" variant="accent" fullWidth className="mt-5" onClick={onClose}>
            Concluir
          </Button>
        </div>
      )}
    </Modal>
  );
}
