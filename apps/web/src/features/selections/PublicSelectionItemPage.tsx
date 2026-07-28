import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PublicSelectionInfoDto, SelectionInfoKind } from "@nexlar/shared";
import { PropertyDetailBody } from "../public-page/PropertyDetailBody";
import { fetchPublicSelectionItem, sendPublicInfoRequest, sendPublicResponse } from "./publicApi";
import { useNoIndex } from "./useNoIndex";
import { VisitBookingSheet } from "./VisitBookingSheet";

/**
 * Detalhe de um imóvel dentro da seleção (/selecao/:token/imovel/:itemId).
 * Mesmo corpo caprichado do anúncio da vitrine, com as ações da lead no fim
 * e na barra fixa: Gostei, Quero visitar, Mais informações.
 */

const WHATSAPP = "#25D366";

const INFO_OPTIONS: { kind: SelectionInfoKind; label: string }[] = [
  { kind: "mais_informacoes", label: "Quero mais informações" },
  { kind: "falar_com_corretor", label: "Quero falar com o corretor" },
  { kind: "tenho_duvida", label: "Tenho uma dúvida" },
  { kind: "opcoes_semelhantes", label: "Quero opções semelhantes" },
];

export function PublicSelectionItemPage() {
  const { token = "", itemId = "" } = useParams();
  useNoIndex();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [infoOpen, setInfoOpen] = useState(false);
  const [feito, setFeito] = useState<string | null>(null);

  const consulta = useQuery({
    queryKey: ["selecao-publica", token, "item", itemId],
    queryFn: () => fetchPublicSelectionItem(token, itemId),
    staleTime: 30_000,
    retry: 1,
  });

  const atualizar = () => {
    queryClient.invalidateQueries({ queryKey: ["selecao-publica", token] });
    return consulta.refetch();
  };

  const gostar = useMutation({
    mutationFn: () => sendPublicResponse(token, itemId, { response: "tenho_interesse" }),
    onSuccess: () => {
      setFeito("Resposta enviada! O corretor já sabe que você gostou.");
      void atualizar();
    },
  });
  const [bookingOpen, setBookingOpen] = useState(false);
  const pedirInfo = useMutation({
    mutationFn: (dto: PublicSelectionInfoDto) => sendPublicInfoRequest(token, itemId, dto),
    onSuccess: () => {
      setInfoOpen(false);
      setFeito("Pedido enviado! O corretor entra em contato em breve.");
    },
  });

  if (consulta.isLoading) {
    return (
      <div className="min-h-dvh bg-bg px-5 pt-16" aria-busy="true">
        <div className="mx-auto flex max-w-4xl flex-col gap-5">
          <div className="aspect-[16/10] animate-pulse rounded-2xl bg-surface-sunken" />
          <div className="h-8 w-64 animate-pulse rounded-md bg-surface-sunken" />
        </div>
      </div>
    );
  }

  const dados = consulta.data;
  if (consulta.isError || !dados?.available || !dados.item) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-6 text-center font-sans">
        <h1 className="text-h1 text-text">Este imóvel não está mais disponível</h1>
        <p className="mt-2 max-w-sm text-body text-text-muted">
          Ele pode ter sido vendido ou retirado. Veja as outras opções da sua seleção.
        </p>
        <Link
          to={`/s/${token}`}
          className="mt-6 flex min-h-12 items-center justify-center rounded-xl bg-accent px-6 text-body font-bold text-accent-on"
        >
          Voltar à seleção
        </Link>
      </div>
    );
  }

  const { item } = dados;
  const gostou = item.response === "tenho_interesse";
  const querVisitar = item.response === "quero_visitar" || item.visitRequestedAt != null;

  return (
    <div className="min-h-dvh bg-bg pb-32 font-sans text-text sm:pb-16">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4 sm:px-8">
        <button
          type="button"
          onClick={() => navigate(`/s/${token}`)}
          className="flex items-center gap-2 text-body-sm font-semibold text-text-muted transition-colors hover:text-text"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Sua seleção
        </button>
        <span className="text-caption font-semibold text-text-subtle">Imóvel #{item.property.code}</span>
      </header>

      <main className="mx-auto max-w-4xl px-5 sm:px-8">
        {feito && (
          <p className="mb-4 rounded-xl bg-[var(--success-soft)] px-4 py-3 text-body-sm font-semibold text-[var(--success-fg)]">
            {feito}
          </p>
        )}

        <PropertyDetailBody property={item.property} extraBadge={item.highlight ? "Escolhido para você" : null} />

        {item.brokerNote && (
          <p className="mt-6 rounded-xl bg-accent-soft px-4 py-3 text-body text-text">
            <span className="font-semibold text-accent">Nota do corretor: </span>
            {item.brokerNote}
          </p>
        )}

        {/* Ações no fim da leitura (desktop) e na barra fixa (celular). */}
        <section className="mt-8 hidden gap-3 sm:flex">
          <Acoes
            gostou={gostou}
            querVisitar={querVisitar}
            busy={gostar.isPending}
            onLike={() => gostar.mutate()}
            onVisit={() => setBookingOpen(true)}
            onInfo={() => setInfoOpen(true)}
          />
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg p-3 sm:hidden">
        <div className="flex gap-2.5">
          <Acoes
            gostou={gostou}
            querVisitar={querVisitar}
            busy={gostar.isPending}
            onLike={() => gostar.mutate()}
            onVisit={() => setBookingOpen(true)}
            onInfo={() => setInfoOpen(true)}
          />
        </div>
      </div>

      {bookingOpen && (
        <VisitBookingSheet
          token={token}
          itemId={itemId}
          propertyTitle={item.property.title}
          onClose={() => setBookingOpen(false)}
          onDone={(mensagem) => {
            setBookingOpen(false);
            setFeito(mensagem);
            void atualizar();
          }}
        />
      )}

      {infoOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setInfoOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Mais informações"
            className="animate-rise relative w-full max-w-md rounded-t-2xl bg-surface p-5 shadow-lg sm:rounded-2xl"
          >
            <h2 className="text-h3 text-text">Como podemos ajudar?</h2>
            <div className="mt-4 flex flex-col gap-2">
              {INFO_OPTIONS.map((o) => (
                <button
                  key={o.kind}
                  type="button"
                  disabled={pedirInfo.isPending}
                  onClick={() => pedirInfo.mutate({ kind: o.kind })}
                  className="min-h-12 rounded-xl border border-border bg-surface px-4 text-left text-body-sm font-semibold text-text transition-colors hover:border-accent hover:text-accent"
                >
                  {o.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setInfoOpen(false)}
              className="mt-4 min-h-11 w-full rounded-xl bg-surface-sunken text-body-sm font-bold text-text"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Acoes({
  gostou,
  querVisitar,
  busy,
  onLike,
  onVisit,
  onInfo,
}: {
  gostou: boolean;
  querVisitar: boolean;
  busy: boolean;
  onLike: () => void;
  onVisit: () => void;
  onInfo: () => void;
}) {
  return (
    <>
      {!gostou && !querVisitar && (
        <button
          type="button"
          disabled={busy}
          onClick={onLike}
          className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--success-soft)] text-body font-bold text-[var(--success-fg)]"
        >
          Gostei
        </button>
      )}
      {!querVisitar && (
        <button
          type="button"
          disabled={busy}
          onClick={onVisit}
          className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl text-body font-bold text-white"
          style={{ backgroundColor: WHATSAPP }}
        >
          Quero visitar
        </button>
      )}
      {querVisitar && (
        <p className="flex min-h-12 flex-1 items-center justify-center rounded-xl bg-[var(--success-soft)] px-3 text-center text-body-sm font-bold text-[var(--success-fg)]">
          Visita solicitada!
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={onInfo}
        className="flex min-h-12 flex-1 items-center justify-center rounded-xl bg-surface-sunken text-body font-bold text-text"
      >
        Mais informações
      </button>
    </>
  );
}
