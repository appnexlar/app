import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LeadSummary } from "@nexlar/shared";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { Banner } from "../../components/ui/Banner";
import { deleteLead } from "./api";
import {
  INTENT_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
  STATUS_TONE,
  STATUS_TONE_CLASS,
  displayWhatsapp,
  whatsappLink,
} from "./labels";

/**
 * Folha de ações do lead. Tocar num lead abre este bottom sheet cuja ação
 * principal é abrir a ficha da lead (onde o corretor acompanha os imóveis
 * enviados). Conversar no WhatsApp e excluir ficam como ações secundárias.
 * Não há conversão em cliente aqui: isso é passo consciente, feito na ficha.
 */
export function LeadActionSheet({
  lead,
  onClose,
}: {
  lead: LeadSummary | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  // Volta ao menu sempre que abre um lead diferente.
  useEffect(() => {
    if (lead) setConfirming(false);
  }, [lead]);

  const remove = useMutation({
    mutationFn: (id: string) => deleteLead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      onClose();
    },
  });

  if (!lead) return null;

  const meta = [
    lead.source ? SOURCE_LABELS[lead.source] : null,
    lead.intent ? INTENT_LABELS[lead.intent] : null,
    lead.region,
  ].filter(Boolean);

  const title = confirming ? "Excluir lead" : lead.fullName;

  return (
    <Modal open onClose={onClose} title={title}>
      {confirming ? (
        <div className="flex flex-col">
          <p className="text-body text-text-muted">
            Excluir <span className="font-semibold text-text">{lead.fullName}</span> apaga o lead e
            todo o histórico dele. Essa ação não pode ser desfeita.
          </p>
          {remove.isError && (
            <div className="mt-4">
              <Banner variant="danger">Não foi possível excluir agora. Tente novamente.</Banner>
            </div>
          )}
          <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={remove.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={remove.isPending}
              onClick={() => remove.mutate(lead.id)}
            >
              {remove.isPending ? "Excluindo..." : "Excluir lead"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col">
          {/* O nome já é o título da folha; aqui só contato e etapa. */}
          <div className="min-w-0">
            <p className="truncate text-body tabular-nums text-text">
              {displayWhatsapp(lead.whatsapp)}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span
                className={`rounded-full px-2 py-0.5 text-caption font-semibold ${STATUS_TONE_CLASS[STATUS_TONE[lead.status]]}`}
              >
                {STATUS_LABELS[lead.status]}
              </span>
              {meta.length > 0 && (
                <span className="text-caption text-text-subtle">{meta.join(" · ")}</span>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-2.5">
            <Button
              type="button"
              variant="accent"
              fullWidth
              onClick={() => {
                onClose();
                navigate(`/leads/${lead.id}`);
              }}
            >
              Ver detalhes da lead
            </Button>

            <a
              href={whatsappLink(lead.whatsapp)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-[var(--tap-target-min)] w-full items-center justify-center gap-2 rounded-md border border-border-strong bg-transparent px-[18px] text-[15px] font-semibold text-text transition-colors duration-fast hover:bg-surface-sunken"
            >
              <svg className="h-[18px] w-[18px] text-success-fg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.611-.916-2.206-.242-.58-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Conversar no WhatsApp
            </a>

            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="min-h-[var(--tap-target-min)] rounded-md px-[18px] text-[15px] font-semibold text-[var(--danger)] transition-colors duration-fast hover:bg-[var(--danger-soft)]"
            >
              Excluir lead
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
