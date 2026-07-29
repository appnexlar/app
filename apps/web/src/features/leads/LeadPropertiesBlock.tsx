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

interface LeadPropertiesBlockProps {
  lead: { id: string; code: number; whatsapp: string };
  onSend: () => void;
}

/**
 * Orquestra as duas formas de levar imóvel até a lead.
 *
 * Existe porque, numa lead sem histórico, a ficha mostrava dois cartões vazios
 * quase idênticos ("Seleções de imóveis" e "Imóveis enviados"), cada um com o
 * seu botão, sem dizer em que eles diferem. Quem está começando não escolhe
 * entre duas portas iguais: trava. Enquanto não há nada enviado, a decisão vira
 * um bloco só, com a diferença escrita e uma recomendação. Assim que existe
 * qualquer registro, as seções voltam a ser o que sempre foram, porque aí o
 * corretor já sabe o que cada uma é.
 *
 * As duas consultas usam as mesmas chaves das seções filhas, então o React
 * Query reaproveita o cache e nada é buscado duas vezes.
 */
export function LeadPropertiesBlock({ lead, onSend }: LeadPropertiesBlockProps) {
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

  if (semNada) return <PrimeiroEnvio lead={lead} onSend={onSend} />;

  return (
    <>
      <LeadSelectionsSection leadId={lead.id} leadCode={lead.code} />
      <LeadSharesSection lead={lead} onSend={onSend} />
    </>
  );
}

/**
 * A escolha inicial, escrita como o corretor pensa: não "seleção ou
 * compartilhamento", e sim "vários imóveis num link" ou "um imóvel agora".
 */
function PrimeiroEnvio({ lead, onSend }: LeadPropertiesBlockProps) {
  const navigate = useNavigate();
  const create = useMutation({
    mutationFn: () => createSelection(lead.id),
    onSuccess: (selection) => navigate(selectionPath(lead.code, selection.code)),
  });

  return (
    <section className="animate-rise rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <h2 className="text-label uppercase tracking-wide text-text-subtle">Imóveis para esta lead</h2>
      <p className="mt-1.5 text-body-sm text-text-muted">
        Ela ainda não recebeu nenhum imóvel. Há duas formas de enviar, e elas servem a momentos
        diferentes.
      </p>

      {create.isError && (
        <div className="mt-4">
          <Banner variant="danger">Não foi possível criar a seleção agora. Tente novamente.</Banner>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
    </section>
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
      <p className="mt-3 text-body font-semibold text-text">{titulo}</p>
      <p className="mt-1 flex-1 text-body-sm text-text-muted">{texto}</p>
      <div className="mt-4">{acao}</div>
    </div>
  );
}
