import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { House, Layers } from "lucide-react";
import { Banner } from "../../components/ui/Banner";
import { Button } from "../../components/ui/Button";
import { selectionPath } from "../../lib/routes";
import { createSelection, fetchLeadSelections } from "../selections/api";
import { LeadSelectionsSection } from "../selections/LeadSelectionsSection";
import { fetchLeadShares } from "../sharing/api";
import { LeadSharesSection } from "../sharing/LeadSharesSection";

interface LeadRef {
  id: string;
  code: number;
  fullName: string;
  whatsapp: string;
}

interface LeadPropertiesBlockProps {
  lead: LeadRef;
  onSend: () => void;
  /** Abre a folha "Compartilhar imóveis" (a página é dona dela). */
  onShare: () => void;
}

/**
 * As duas seções de imóveis da ficha, com UMA porta de entrada para envio:
 * "Compartilhar imóveis". A tela antiga tinha "Enviar imóvel" no cabeçalho,
 * "Enviar imóvel" na lista e "+ Criar seleção" na seção ao lado, três botões
 * parecidos sem dizer em que diferem. A folha da escolha pertence à página
 * (LeadDetailPage), porque o card "Próxima ação" também abre por ela.
 *
 * As consultas usam as mesmas chaves das seções filhas, então o React Query
 * reaproveita o cache e nada é buscado duas vezes.
 */
export function LeadPropertiesBlock({ lead, onSend, onShare }: LeadPropertiesBlockProps) {
  const selections = useQuery({
    queryKey: ["lead-selections", lead.id],
    queryFn: () => fetchLeadSelections(lead.id),
  });
  const shares = useQuery({
    queryKey: ["lead-shares", lead.id],
    queryFn: () => fetchLeadShares(lead.id),
  });

  const carregando = selections.isPending || shares.isPending;
  const semNada =
    !carregando &&
    !selections.isError &&
    !shares.isError &&
    (selections.data?.length ?? 0) === 0 &&
    (shares.data?.length ?? 0) === 0;

  if (semNada) {
    return (
      <section className="animate-rise rounded-2xl border border-border bg-surface p-4 sm:p-6">
        <h2 className="text-label font-semibold text-text">Imóveis para esta lead</h2>
        <p className="mt-1 text-body-sm text-text-muted">
          Ela ainda não recebeu nenhum imóvel. Há duas formas de enviar, e elas servem a momentos
          diferentes.
        </p>
        <div className="mt-4">
          <EscolhaDeEnvio lead={lead} onSend={onSend} />
        </div>
      </section>
    );
  }

  return (
    <>
      <LeadSharesSection lead={lead} onShare={onShare} />
      <LeadSelectionsSection leadId={lead.id} leadCode={lead.code} />
    </>
  );
}

/**
 * A escolha entre os dois envios, escrita como o corretor pensa: não "seleção
 * ou compartilhamento", e sim "vários imóveis num link" ou "um imóvel agora".
 * Usada no estado vazio (inline) e na folha "Compartilhar imóveis" da página.
 */
export function EscolhaDeEnvio({ lead, onSend }: { lead: LeadRef; onSend: () => void }) {
  const navigate = useNavigate();
  const create = useMutation({
    mutationFn: () => createSelection(lead.id),
    onSuccess: (selection) => navigate(selectionPath(lead.code, selection.code)),
  });

  return (
    <div className="flex flex-col gap-4">
      {create.isError && (
        <Banner variant="danger">Não foi possível criar a seleção agora. Tente novamente.</Banner>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Opcao
          icone={<Layers size={20} aria-hidden="true" />}
          destaque
          titulo="Montar uma seleção"
          texto="Vários imóveis num link só. A lead marca o que gostou, o que descartou e o que quer visitar, e as respostas voltam para esta ficha."
          acao={
            <Button
              type="button"
              variant="accent"
              fullWidth
              loading={create.isPending}
              onClick={() => create.mutate()}
            >
              Criar seleção
            </Button>
          }
        />
        <Opcao
          icone={<House size={20} aria-hidden="true" />}
          titulo="Enviar um imóvel"
          texto="Um imóvel específico, direto no WhatsApp. Bom quando você já sabe exatamente o que ela quer ver."
          acao={
            <Button type="button" variant="ghost" fullWidth onClick={onSend}>
              Escolher imóvel
            </Button>
          }
        />
      </div>
    </div>
  );
}

function Opcao({
  icone,
  titulo,
  texto,
  acao,
  destaque = false,
}: {
  icone: React.ReactNode;
  titulo: string;
  texto: string;
  acao: React.ReactNode;
  destaque?: boolean;
}) {
  return (
    <div
      className={
        "flex flex-col rounded-xl border p-4 " +
        (destaque ? "border-accent/40 bg-accent-soft/30" : "border-border bg-surface-sunken/40")
      }
    >
      <div
        className={
          "flex h-10 w-10 items-center justify-center rounded-xl " +
          (destaque ? "bg-accent-soft text-accent" : "bg-surface text-text-muted")
        }
      >
        {icone}
      </div>
      <p className="mt-4 text-body font-semibold text-text">{titulo}</p>
      <p className="mt-1 flex-1 text-body-sm text-text-muted">{texto}</p>
      <div className="mt-4">{acao}</div>
    </div>
  );
}
