import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LeadSummary, PropertySummary } from "@nexlar/shared";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { Banner } from "../../components/ui/Banner";
import { initials } from "../../lib/name";
import { fetchLeads } from "../leads/api";
import {
  INTENT_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS as LEAD_STATUS_LABELS,
  displayWhatsapp,
} from "../leads/labels";
import { AuthImage } from "../properties/AuthImage";
import { TYPE_LABELS, mainPrice } from "../properties/labels";
import { createShare, publicShareUrl, whatsappDigits } from "./api";

type Step = "lead" | "review" | "done";

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full;
}

function defaultMessage(leadName: string): string {
  return `Olá, ${firstName(leadName)}! Separei este imóvel com base no que conversamos. Veja os detalhes neste link:`;
}

function budgetLabel(lead: LeadSummary): string | null {
  const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR")}`;
  if (lead.budgetMin != null && lead.budgetMax != null) return `${fmt(lead.budgetMin)}–${fmt(lead.budgetMax)}`;
  if (lead.budgetMin != null) return `A partir de ${fmt(lead.budgetMin)}`;
  if (lead.budgetMax != null) return `Até ${fmt(lead.budgetMax)}`;
  return null;
}

export function SendToLeadModal({
  property,
  onClose,
}: {
  property: PropertySummary | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("lead");
  const [search, setSearch] = useState("");
  const [lead, setLead] = useState<LeadSummary | null>(null);
  const [message, setMessage] = useState("");
  const [sharedUrl, setSharedUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const leadsQuery = useQuery({
    queryKey: ["leads"],
    queryFn: fetchLeads,
    enabled: Boolean(property) && step === "lead",
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const all = leadsQuery.data ?? [];
    if (!term) return all;
    const digits = term.replace(/\D/g, "");
    return all.filter(
      (l) =>
        l.fullName.toLowerCase().includes(term) ||
        (digits.length >= 3 && l.whatsapp.includes(digits)),
    );
  }, [leadsQuery.data, search]);

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
      queryClient.invalidateQueries({ queryKey: ["property-shares", property!.id] });
      queryClient.invalidateQueries({ queryKey: ["lead-shares"] });
      setStep("done");
    },
  });

  if (!property) return null;

  const pickLead = (l: LeadSummary) => {
    setLead(l);
    setMessage(defaultMessage(l.fullName));
    setStep("review");
  };

  const confirm = () => {
    // Abre a aba do WhatsApp já no clique (evita bloqueio de pop-up) e navega depois.
    const waWindow = window.open("", "_blank");
    mutation.mutate(waWindow);
  };

  const title =
    step === "lead" ? "Enviar para uma lead" : step === "review" ? "Revisar o envio" : "Imóvel enviado";

  return (
    <Modal open onClose={onClose} title={title}>
      {step === "lead" && (
        <div className="flex flex-col">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar lead por nome ou WhatsApp"
            className="w-full min-h-[var(--tap-target-min)] rounded-md border border-border bg-surface px-3.5 text-body text-text placeholder:text-text-subtle focus-visible:border-[var(--border-focus)] focus-visible:shadow-focus"
          />
          <div className="mt-3 max-h-[min(50dvh,26rem)] overflow-y-auto">
            {leadsQuery.isPending ? (
              <p className="py-8 text-center text-body-sm text-text-subtle">Carregando leads...</p>
            ) : leadsQuery.isError ? (
              <Banner variant="danger">Não foi possível carregar suas leads.</Banner>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-body-sm text-text-muted">
                {leadsQuery.data?.length === 0
                  ? "Você ainda não tem leads. Cadastre uma lead para enviar imóveis."
                  : "Nenhuma lead encontrada com essa busca."}
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {filtered.map((l) => {
                  const meta = [
                    l.intent ? INTENT_LABELS[l.intent] : null,
                    l.source ? SOURCE_LABELS[l.source] : null,
                    l.region,
                    budgetLabel(l),
                  ].filter(Boolean);
                  return (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => pickLead(l)}
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-surface-sunken"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-body-sm font-bold text-primary">
                          {initials(l.fullName)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-body font-semibold text-text">{l.fullName}</span>
                            <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-caption font-semibold text-accent">
                              {LEAD_STATUS_LABELS[l.status]}
                            </span>
                          </span>
                          <span className="block truncate text-body-sm text-text-muted">
                            {displayWhatsapp(l.whatsapp)}
                            {meta.length > 0 && <span className="text-text-subtle"> · {meta.join(" · ")}</span>}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {step === "review" && lead && (
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
            <label htmlFor="share-message" className="text-label text-text">
              Mensagem
            </label>
            <textarea
              id="share-message"
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
            <Button type="button" variant="ghost" onClick={() => setStep("lead")} disabled={mutation.isPending}>
              Trocar lead
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
            O WhatsApp foi aberto com a mensagem pronta. O envio ficou registrado na ficha da lead e do imóvel.
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
