import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import type { SelectionSummary } from "@nexlar/shared";
import { Banner } from "../../components/ui/Banner";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { selectionPath } from "../../lib/routes";
import { fetchLeadSelections, revokeSelection, selectionPublicUrl } from "./api";
import { SELECTION_STATUS_LABELS, SELECTION_STATUS_TONE_CLASS } from "./labels";

interface LeadSelectionsSectionProps {
  leadId: string;
  /** Código curto da lead: é ele que vai para a URL do montador. */
  leadCode: number;
}

const dataCurta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });

/**
 * Seleções na ficha da lead. Cada linha responde as perguntas que o corretor
 * faria antes de ligar: quantos imóveis, quantos foram avaliados, o que ficou
 * sem resposta e até quando o link vale. Reticências escondendo resposta de
 * lead era exatamente o que esta lista tinha de pior.
 */
export function LeadSelectionsSection({ leadId, leadCode }: LeadSelectionsSectionProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [copiada, setCopiada] = useState<string | null>(null);
  const [encerrando, setEncerrando] = useState<SelectionSummary | null>(null);

  const query = useQuery({
    queryKey: ["lead-selections", leadId],
    queryFn: () => fetchLeadSelections(leadId),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeSelection(id),
    onSuccess: () => {
      setEncerrando(null);
      queryClient.invalidateQueries({ queryKey: ["lead-selections", leadId] });
      // Os "imóveis enviados" são itens do mesmo registro: encerrar a seleção
      // muda o status deles também, então o cache dos dois precisa cair.
      queryClient.invalidateQueries({ queryKey: ["lead-shares", leadId] });
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
    },
  });

  async function copiarLink(s: SelectionSummary) {
    try {
      await navigator.clipboard.writeText(selectionPublicUrl(s.publicToken));
      setCopiada(s.id);
      window.setTimeout(() => setCopiada((atual) => (atual === s.id ? null : atual)), 1600);
    } catch {
      // Clipboard bloqueado: abre a seleção, onde o link aparece por extenso.
      navigate(selectionPath(leadCode, s.code));
    }
  }

  const selections = query.data ?? [];

  // Sem seleção nenhuma, a seção não aparece: a entrada "Compartilhar
  // imóveis" (e o estado vazio do bloco) já orienta a criação da primeira.
  if (!query.isPending && !query.isError && selections.length === 0) return null;

  return (
    <section className="animate-rise rounded-2xl border border-border bg-surface p-4 sm:p-6">
      <h2 className="text-label font-semibold text-text">Seleções de imóveis</h2>

      {query.isPending ? (
        <div className="mt-4 h-16 animate-pulse rounded-xl bg-surface-sunken" />
      ) : query.isError ? (
        <p className="mt-4 text-body-sm text-text-muted">
          Não foi possível carregar as seleções.{" "}
          <button type="button" className="font-semibold text-accent" onClick={() => query.refetch()}>
            Tentar novamente
          </button>
        </p>
      ) : (
        <>
          {revoke.isError && (
            <div className="mt-4">
              <Banner variant="danger">Não foi possível encerrar agora. Tente novamente.</Banner>
            </div>
          )}
          <ul className="mt-2 flex flex-col divide-y divide-border">
            {selections.map((s) => (
              <li key={s.id} className="py-4 first:pt-2 last:pb-0">
                <button
                  type="button"
                  onClick={() => navigate(selectionPath(leadCode, s.code))}
                  className="flex w-full items-start justify-between gap-4 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-body-sm font-semibold text-text">{titulo(s)}</p>
                    <p className="mt-1 text-body-sm text-text-muted">{andamento(s)}</p>
                    <Respostas s={s} />
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-caption font-semibold ${SELECTION_STATUS_TONE_CLASS[s.status]}`}
                  >
                    {SELECTION_STATUS_LABELS[s.status]}
                  </span>
                </button>

                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
                  <Acao onClick={() => navigate(selectionPath(leadCode, s.code))}>
                    {s.status === "rascunho" ? "Continuar montagem" : "Ver seleção"}
                  </Acao>
                  {s.status === "ativa" && (
                    <>
                      <Acao onClick={() => void copiarLink(s)}>
                        {copiada === s.id ? (
                          <span className="inline-flex items-center gap-1 text-[var(--success-fg)]">
                            <Check size={14} aria-hidden="true" /> Link copiado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <Copy size={14} aria-hidden="true" /> Copiar link
                          </span>
                        )}
                      </Acao>
                      <Acao subtle onClick={() => setEncerrando(s)}>
                        Encerrar
                      </Acao>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <ConfirmDialog
        open={encerrando != null}
        title="Encerrar a seleção"
        description="O link para de funcionar para a lead na hora. As respostas que ela já deu ficam guardadas nesta ficha."
        confirmLabel={revoke.isPending ? "Encerrando..." : "Encerrar seleção"}
        danger
        loading={revoke.isPending}
        onConfirm={() => encerrando && revoke.mutate(encerrando.id)}
        onCancel={() => setEncerrando(null)}
      />
    </section>
  );
}

function Acao({
  children,
  onClick,
  subtle = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  subtle?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "min-h-[var(--tap-target-min)] text-body-sm font-semibold transition-colors hover:underline " +
        (subtle ? "text-text-subtle hover:text-text" : "text-accent")
      }
    >
      {children}
    </button>
  );
}

function titulo(s: SelectionSummary): string {
  if (s.status === "rascunho") return "Rascunho de seleção";
  const enviada = s.activatedAt ?? s.createdAt;
  return `Seleção enviada em ${dataCurta.format(new Date(enviada))}`;
}

/** Tamanho, aberturas e validade numa linha só, sem esconder nada. */
function andamento(s: SelectionSummary): string {
  const partes: string[] = [s.itemCount === 1 ? "1 imóvel" : `${s.itemCount} imóveis`];
  if (s.status === "rascunho") {
    partes.push("continue a montagem e ative para enviar");
    return partes.join(" · ");
  }
  partes.push(
    s.viewCount > 0
      ? `aberta ${s.viewCount === 1 ? "1 vez" : `${s.viewCount} vezes`}`
      : "ainda não aberta",
  );
  if (s.status === "ativa" && s.expiresAt) {
    partes.push(`vale até ${dataCurta.format(new Date(s.expiresAt))}`);
  }
  return partes.join(" · ");
}

/**
 * As respostas com cor por significado. "Sem resposta" usa a conta certa:
 * itens sem decisão da lead (abrir a página não é decidir).
 */
function Respostas({ s }: { s: SelectionSummary }) {
  if (s.status === "rascunho" || s.itemCount === 0) return null;
  const semResposta = Math.max(0, s.itemCount - s.respondedCount);
  const partes: Array<{ texto: string; classe: string }> = [];
  if (s.likedCount > 0)
    partes.push({
      texto: `${s.likedCount} ${s.likedCount === 1 ? "interessou" : "interessaram"}`,
      classe: "text-[var(--success-fg)] font-semibold",
    });
  if (s.visitRequestedCount > 0)
    partes.push({
      texto: `${s.visitRequestedCount} ${s.visitRequestedCount === 1 ? "quer visitar" : "querem visitar"}`,
      classe: "text-accent font-semibold",
    });
  // "Talvez" existe e some se não for contado: entra em respondedCount (logo
  // sai de "sem resposta") e precisa de parcela própria, senão a soma mente.
  const emDuvida = Math.max(
    0,
    s.respondedCount - s.likedCount - s.dismissedCount,
  );
  if (emDuvida > 0)
    partes.push({ texto: `${emDuvida} em dúvida`, classe: "text-text-muted" });
  if (s.dismissedCount > 0)
    partes.push({ texto: `${s.dismissedCount} ${s.dismissedCount === 1 ? "descartou" : "descartaram"}`, classe: "text-text-muted" });
  if (semResposta > 0)
    partes.push({ texto: `${semResposta} sem resposta`, classe: "text-text-subtle" });
  if (partes.length === 0) return null;
  return (
    <p className="mt-1 text-body-sm">
      {partes.map((p, i) => (
        <span key={p.texto}>
          {i > 0 && <span className="text-text-subtle"> · </span>}
          <span className={p.classe}>{p.texto}</span>
        </span>
      ))}
    </p>
  );
}
