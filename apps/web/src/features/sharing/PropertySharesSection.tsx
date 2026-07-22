import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PropertyShareSummary } from "@nexlar/shared";
import { Banner } from "../../components/ui/Banner";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { initials } from "../../lib/name";
import { displayWhatsapp } from "../leads/labels";
import { fetchPropertyShares, publicShareUrl, resendShare, revokeShare, whatsappDigits } from "./api";
import { SHARE_RESPONSE_LABELS, SHARE_RESPONSE_TONE, SHARE_STATUS_LABELS } from "./labels";

const TONE_CLASSES: Record<string, string> = {
  success: "bg-[var(--success-soft)] text-[var(--success-fg)]",
  accent: "bg-accent-soft text-accent",
  danger: "bg-[var(--danger-soft)] text-[var(--danger-fg)]",
  neutral: "bg-surface-sunken text-text-muted",
};

function sentLabel(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
}

export function PropertySharesSection({ propertyId }: { propertyId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [toRevoke, setToRevoke] = useState<PropertyShareSummary | null>(null);

  const query = useQuery({
    queryKey: ["property-shares", propertyId],
    queryFn: () => fetchPropertyShares(propertyId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["property-shares", propertyId] });

  const resend = useMutation({ mutationFn: resendShare, onSuccess: invalidate });
  const revoke = useMutation({
    mutationFn: revokeShare,
    onSuccess: () => {
      invalidate();
      setToRevoke(null);
    },
  });

  const openWhatsapp = (share: PropertyShareSummary) => {
    const text = `${share.message ?? ""}\n${publicShareUrl(share.publicToken)}`.trim();
    window.open(
      `https://wa.me/${whatsappDigits(share.leadWhatsapp)}?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener",
    );
  };

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <h2 className="text-label text-text-subtle">Leads que receberam este imóvel</h2>

      {query.isPending ? (
        <div className="mt-4 h-16 animate-pulse rounded-lg bg-surface-sunken" />
      ) : query.isError ? (
        <div className="mt-3">
          <Banner variant="danger">Não foi possível carregar os envios.</Banner>
        </div>
      ) : query.data.length === 0 ? (
        <p className="mt-3 text-body-sm text-text-muted">
          Nenhum envio ainda. Use "Enviar para uma lead" para compartilhar este imóvel.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-border">
          {query.data.map((share) => {
            const revoked = share.status === "revogada";
            return (
              <li key={share.id} className="flex items-center gap-3 py-3 first:pt-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-body-sm font-bold text-primary">
                  {initials(share.leadName)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="truncate text-body font-semibold text-text">{share.leadName}</p>
                    <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-caption font-medium text-text-muted">
                      {SHARE_STATUS_LABELS[share.status]}
                    </span>
                    {share.response !== "nao_visualizado" && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-caption font-semibold ${TONE_CLASSES[SHARE_RESPONSE_TONE[share.response]]}`}
                      >
                        {SHARE_RESPONSE_LABELS[share.response]}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-body-sm text-text-muted">
                    {displayWhatsapp(share.leadWhatsapp)} · Enviado {sentLabel(share.sentAt ?? share.createdAt)}
                    {share.viewCount > 0 && ` · ${share.viewCount} ${share.viewCount === 1 ? "visualização" : "visualizações"}`}
                  </p>
                </div>
                <ShareRowMenu
                  onOpenLead={() => navigate(`/leads/${share.leadId}`)}
                  onWhatsapp={() => openWhatsapp(share)}
                  onResend={() => resend.mutate(share.id)}
                  onRevoke={() => setToRevoke(share)}
                  revoked={revoked}
                  busy={resend.isPending}
                />
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(toRevoke)}
        title="Revogar link"
        description={
          toRevoke
            ? `O link enviado para ${toRevoke.leadName} deixa de funcionar. O histórico é mantido. Você pode gerar um novo envio depois.`
            : ""
        }
        confirmLabel={revoke.isPending ? "Revogando..." : "Revogar link"}
        danger
        loading={revoke.isPending}
        onConfirm={() => toRevoke && revoke.mutate(toRevoke.id)}
        onCancel={() => setToRevoke(null)}
      />
    </section>
  );
}

function ShareRowMenu({
  onOpenLead,
  onWhatsapp,
  onResend,
  onRevoke,
  revoked,
  busy,
}: {
  onOpenLead: () => void;
  onWhatsapp: () => void;
  onResend: () => void;
  onRevoke: () => void;
  revoked: boolean;
  busy: boolean;
}) {
  const item = "block w-full px-4 py-2.5 text-left text-body-sm text-text hover:bg-surface-sunken";
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label="Ações do envio"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="flex h-10 w-10 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-sunken hover:text-text"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.9" />
          <circle cx="12" cy="12" r="1.9" />
          <circle cx="12" cy="19" r="1.9" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-xl border border-border bg-surface py-1.5 shadow-md">
          <button type="button" className={item} onMouseDown={onOpenLead}>
            Abrir lead
          </button>
          {!revoked && (
            <>
              <button type="button" className={item} onMouseDown={onWhatsapp}>
                Abrir WhatsApp
              </button>
              <button type="button" className={item} disabled={busy} onMouseDown={onResend}>
                Reenviar link
              </button>
              <div className="my-1 border-t border-border" />
              <button
                type="button"
                className={`${item} font-semibold text-[var(--danger-fg)]`}
                onMouseDown={onRevoke}
              >
                Revogar link
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
