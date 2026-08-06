import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark } from "lucide-react";
import {
  FINANCING_STATUS_LABELS,
  type FinancingRequestStatus,
  type FinancingRequestSummary,
  type FinancingSendResult,
} from "@nexlar/shared";
import { Banner } from "../../components/ui/Banner";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { ICON } from "../../components/ui/icon";
import {
  archiveFinancingRequest,
  fetchLeadFinancingRequests,
  revokeFinancingRequest,
  sendFinancingRequest,
} from "./api";
import { RequestFinancingModal } from "./RequestFinancingModal";
import { SendResultModal } from "./SendResultModal";

interface FinancingBlockProps {
  lead: { id: string; name: string; email: string | null };
}

/** Tom do selo por status: informação, não alarme (danger só para expirada). */
const STATUS_TONES: Record<FinancingRequestStatus, string> = {
  rascunho: "bg-surface-sunken text-text-muted",
  enviada: "bg-[var(--highlight-soft)] text-[var(--highlight-fg)]",
  respondida: "bg-success-soft text-[var(--success-fg)]",
  em_revisao: "bg-[var(--highlight-soft)] text-[var(--highlight-fg)]",
  correcao_solicitada: "bg-warning-soft text-[var(--warning-fg)]",
  aprovada_para_simulacao: "bg-success-soft text-[var(--success-fg)]",
  expirada: "bg-danger-soft text-[var(--danger-fg)]",
  revogada: "bg-surface-sunken text-text-muted",
  arquivada: "bg-surface-sunken text-text-subtle",
};

/**
 * Bloco "Simulação de financiamento" da ficha (docs/09, Fatia B).
 *
 * O corretor pede os dados por link seguro, acompanha o status aqui e, nas
 * próximas fatias, revisa as respostas. Arquivadas ficam de fora da lista:
 * histórico é histórico, a ficha mostra o que está vivo.
 */
export function FinancingBlock({ lead }: FinancingBlockProps) {
  const queryClient = useQueryClient();
  const [pedirAberto, setPedirAberto] = useState(false);
  const [linkGerado, setLinkGerado] = useState<FinancingSendResult | null>(null);
  const [confirmar, setConfirmar] = useState<{ acao: "revogar" | "arquivar"; alvo: FinancingRequestSummary } | null>(null);

  const consulta = useQuery({
    queryKey: ["lead-financing", lead.id],
    queryFn: () => fetchLeadFinancingRequests(lead.id),
  });

  const recarregar = () => queryClient.invalidateQueries({ queryKey: ["lead-financing", lead.id] });

  const reenviar = useMutation({
    mutationFn: (code: number) => sendFinancingRequest(code),
    onSuccess: (res) => {
      setLinkGerado(res);
      void recarregar();
    },
    onError: () => void recarregar(),
  });

  const revogar = useMutation({
    mutationFn: (code: number) => revokeFinancingRequest(code),
    onSuccess: () => {
      setConfirmar(null);
      void recarregar();
    },
  });

  const arquivar = useMutation({
    mutationFn: (code: number) => archiveFinancingRequest(code),
    onSuccess: () => {
      setConfirmar(null);
      void recarregar();
    },
  });

  const solicitacoes = (consulta.data ?? []).filter((s) => s.status !== "arquivada");

  return (
    <section className="animate-rise rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-label uppercase tracking-wide text-text-subtle">
          Simulação de financiamento
        </h2>
        {solicitacoes.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            className="!min-h-9 !px-3.5 text-body-sm"
            onClick={() => setPedirAberto(true)}
          >
            Nova solicitação
          </Button>
        )}
      </div>

      {consulta.isPending ? (
        <div className="mt-4 flex flex-col gap-2" aria-busy="true">
          <div className="h-14 animate-pulse rounded-xl bg-surface-sunken" />
        </div>
      ) : consulta.isError ? (
        <div className="mt-4">
          <Banner variant="danger">
            Não foi possível carregar as solicitações.{" "}
            <button type="button" className="font-semibold underline" onClick={() => consulta.refetch()}>
              Tentar de novo
            </button>
          </Banner>
        </div>
      ) : solicitacoes.length === 0 ? (
        <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Landmark size={ICON.action} aria-hidden="true" />
            </span>
            <p className="text-body-sm text-text-muted">
              Peça os dados de renda, entrada e FGTS por um link seguro. Você revisa as respostas
              antes de preparar a simulação no banco.
            </p>
          </div>
          <Button
            type="button"
            variant="accent"
            className="w-full sm:w-auto sm:flex-none"
            onClick={() => setPedirAberto(true)}
          >
            Solicitar dados
          </Button>
        </div>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-border/70">
          {solicitacoes.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-caption font-semibold ${STATUS_TONES[s.status]}`}
                >
                  {FINANCING_STATUS_LABELS[s.status]}
                </span>
                <span className="text-body-sm text-text-muted">{descrever(s)}</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {(s.status === "rascunho" || s.status === "expirada" || s.status === "revogada") && (
                  <Acao
                    onClick={() => reenviar.mutate(s.code)}
                    disabled={reenviar.isPending}
                  >
                    {s.status === "rascunho" ? "Gerar link e enviar" : "Gerar novo link"}
                  </Acao>
                )}
                {(s.status === "enviada" || s.status === "correcao_solicitada") && (
                  <Acao onClick={() => setConfirmar({ acao: "revogar", alvo: s })}>Revogar link</Acao>
                )}
                <Acao onClick={() => setConfirmar({ acao: "arquivar", alvo: s })}>Arquivar</Acao>
              </div>
            </li>
          ))}
        </ul>
      )}

      {reenviar.isError && (
        <div className="mt-3">
          <Banner variant="danger">Não foi possível gerar o link agora. Tente novamente.</Banner>
        </div>
      )}

      <RequestFinancingModal
        open={pedirAberto}
        onClose={() => setPedirAberto(false)}
        lead={lead}
        onSent={(res) => setLinkGerado(res)}
      />

      <SendResultModal
        result={linkGerado}
        leadName={lead.name}
        onClose={() => setLinkGerado(null)}
      />

      <ConfirmDialog
        open={confirmar?.acao === "revogar"}
        title="Revogar o link"
        description="O link atual para de funcionar na hora. O que o cliente já enviou permanece guardado, e dá para gerar um link novo depois."
        confirmLabel={revogar.isPending ? "Revogando..." : "Revogar link"}
        danger
        loading={revogar.isPending}
        onConfirm={() => confirmar && revogar.mutate(confirmar.alvo.code)}
        onCancel={() => setConfirmar(null)}
      />

      <ConfirmDialog
        open={confirmar?.acao === "arquivar"}
        title="Arquivar a solicitação"
        description="Ela sai desta lista e o link para de funcionar. O histórico fica preservado."
        confirmLabel={arquivar.isPending ? "Arquivando..." : "Arquivar"}
        loading={arquivar.isPending}
        onConfirm={() => confirmar && arquivar.mutate(confirmar.alvo.code)}
        onCancel={() => setConfirmar(null)}
      />
    </section>
  );
}

function Acao({
  children,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-9 text-body-sm font-semibold text-accent hover:underline disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/** Uma linha honesta sobre onde a solicitação está. */
function descrever(s: FinancingRequestSummary): string {
  if (s.status === "enviada") {
    const prazo = s.expiresAt ? ` · responde até ${dataCurta(s.expiresAt)}` : "";
    return s.firstOpenedAt ? `aberta pelo cliente${prazo}` : `aguardando abrir${prazo}`;
  }
  if (s.status === "respondida" && s.submittedAt) return `enviada em ${dataCurta(s.submittedAt)}`;
  if (s.status === "expirada") return "o prazo terminou sem envio";
  if (s.status === "rascunho") return "ainda não enviada";
  return `criada em ${dataCurta(s.createdAt)}`;
}

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
