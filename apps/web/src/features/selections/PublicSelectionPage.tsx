import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  PublicSelectionBroker,
  PublicSelectionItemCard,
  PublicSelectionResponseDto,
  SelectionDismissReason,
} from "@nexlar/shared";
import { SELECTION_DISMISS_REASONS } from "@nexlar/shared";
import { cancelPublicVisit, fetchPublicSelection, sendPublicResponse } from "./publicApi";
import { useNoIndex } from "./useNoIndex";
import { VisitBookingSheet } from "./VisitBookingSheet";

/**
 * A página que a lead recebe no WhatsApp (/selecao/:token). Mobile first de
 * verdade: é quase certo que ela abre dentro do WebView do WhatsApp.
 *
 * Estrutura: saudação com o primeiro nome, mensagem do corretor, destaques,
 * demais imóveis, corretor em posição secundária. Cada card responde com um
 * toque: Gostei / Não combina (com motivo) / Quero visitar.
 */

const WHATSAPP = "#25D366";

const DISMISS_LABELS: Record<SelectionDismissReason, string> = {
  preco: "Preço",
  localizacao: "Localização",
  tamanho: "Tamanho",
  quartos: "Quartos",
  vagas: "Vagas",
  estilo: "Estilo",
  estado: "Estado do imóvel",
  condominio: "Condomínio",
  outro: "Outro motivo",
};

export function PublicSelectionPage() {
  const { token = "" } = useParams();
  useNoIndex();
  const queryClient = useQueryClient();
  const [dismissing, setDismissing] = useState<PublicSelectionItemCard | null>(null);
  const [booking, setBooking] = useState<PublicSelectionItemCard | null>(null);
  const [canceling, setCanceling] = useState<PublicSelectionItemCard | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const consulta = useQuery({
    queryKey: ["selecao-publica", token],
    queryFn: () => fetchPublicSelection(token),
    staleTime: 30_000,
    retry: 1,
  });

  const atualizar = () => queryClient.invalidateQueries({ queryKey: ["selecao-publica", token] });

  const responder = useMutation({
    mutationFn: (input: { itemId: string; dto: PublicSelectionResponseDto }) =>
      sendPublicResponse(token, input.itemId, input.dto),
    onSuccess: atualizar,
  });
  const cancelarVisita = useMutation({
    mutationFn: (itemId: string) => cancelPublicVisit(token, itemId),
    onSuccess: () => {
      setCanceling(null);
      setAviso("Visita cancelada. Seu interesse no imóvel continua registrado.");
      atualizar();
    },
  });

  if (consulta.isLoading) return <Esqueleto />;

  const dados = consulta.data;
  if (consulta.isError || !dados) return <Encerrada broker={null} reason="indisponivel" />;
  if (!dados.available || !dados.selection) {
    return <Encerrada broker={dados.broker} reason={dados.unavailableReason ?? "indisponivel"} />;
  }

  const sel = dados.selection;
  const destaques = sel.items.filter((i) => i.highlight);
  const demais = sel.items.filter((i) => !i.highlight);
  const respondidos = sel.items.filter((i) => !["nao_visualizado", "visualizado"].includes(i.response)).length;

  return (
    <div className="min-h-dvh bg-bg pb-16 font-sans text-text">
      {/* Saudação: a página é da lead, o corretor assina embaixo. */}
      <header className="bg-primary px-5 pb-10 pt-8 text-primary-on sm:pb-12">
        <div className="mx-auto max-w-3xl">
          <p className="text-caption font-bold uppercase tracking-wide text-white/60">
            Seleção de imóveis
          </p>
          <h1 className="mt-2 text-h1 sm:text-display">
            {sel.leadFirstName ? `Olá, ${sel.leadFirstName}!` : "Olá!"}
          </h1>
          <p className="mt-2 max-w-xl text-body-lg text-white/85">
            {sel.message ??
              `${sel.broker.name} preparou ${sel.itemCount === 1 ? "uma opção" : `${sel.itemCount} opções`} pensando no que você procura.`}
          </p>
          <p className="mt-4 text-body-sm text-white/60">
            {sel.itemCount === 1 ? "1 imóvel" : `${sel.itemCount} imóveis`}
            {sel.expiresAtLabel && ` · disponível até ${sel.expiresAtLabel}`}
          </p>
        </div>
      </header>

      <main className="mx-auto -mt-4 max-w-3xl px-4 sm:px-6">
        {aviso && (
          <p className="mb-3 rounded-2xl bg-[var(--success-soft)] px-4 py-3 text-body-sm font-semibold text-[var(--success-fg)]">
            {aviso}
          </p>
        )}
        {/* Como funciona, em uma linha: a página pede reação, não só olhar. */}
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-body-sm text-text-muted">
            Toque em <span className="font-semibold text-text">Gostei</span> nos que agradarem e em{" "}
            <span className="font-semibold text-text">Não combina</span> nos que não. Suas respostas
            chegam direto para {sel.broker.name.split(" ")[0]}.
            {respondidos > 0 && (
              <span className="mt-1 block font-semibold text-accent">
                {respondidos} de {sel.itemCount} respondidos
              </span>
            )}
          </p>
        </div>

        {destaques.length > 0 && (
          <section className="mt-6">
            <h2 className="text-caption font-extrabold uppercase tracking-wide text-accent">
              Destaques para você
            </h2>
            <div className="mt-3 flex flex-col gap-4">
              {destaques.map((item) => (
                <ItemCard
                  key={item.itemId}
                  token={token}
                  item={item}
                  busy={responder.isPending || cancelarVisita.isPending}
                  onLike={() => responder.mutate({ itemId: item.itemId, dto: { response: "tenho_interesse" } })}
                  onUndo={() => responder.mutate({ itemId: item.itemId, dto: { response: "visualizado" } })}
                  onDismiss={() => setDismissing(item)}
                  onVisit={() => setBooking(item)}
                  onCancelVisit={() => setCanceling(item)}
                />
              ))}
            </div>
          </section>
        )}

        {demais.length > 0 && (
          <section className="mt-6">
            {destaques.length > 0 && (
              <h2 className="text-caption font-extrabold uppercase tracking-wide text-text-subtle">
                Mais opções
              </h2>
            )}
            <div className="mt-3 flex flex-col gap-4">
              {demais.map((item) => (
                <ItemCard
                  key={item.itemId}
                  token={token}
                  item={item}
                  busy={responder.isPending || cancelarVisita.isPending}
                  onLike={() => responder.mutate({ itemId: item.itemId, dto: { response: "tenho_interesse" } })}
                  onUndo={() => responder.mutate({ itemId: item.itemId, dto: { response: "visualizado" } })}
                  onDismiss={() => setDismissing(item)}
                  onVisit={() => setBooking(item)}
                  onCancelVisit={() => setCanceling(item)}
                />
              ))}
            </div>
          </section>
        )}

        <BrokerFooter broker={sel.broker} />
      </main>

      {booking && (
        <VisitBookingSheet
          token={token}
          itemId={booking.itemId}
          propertyTitle={booking.title}
          onClose={() => setBooking(null)}
          onDone={(mensagem) => {
            setBooking(null);
            setAviso(mensagem);
            atualizar();
          }}
        />
      )}

      {canceling && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCanceling(null)} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Cancelar visita"
            className="animate-rise relative w-full max-w-md rounded-t-2xl bg-surface p-5 shadow-lg sm:rounded-2xl"
          >
            <h2 className="text-h3 text-text">Cancelar esta visita?</h2>
            <p className="mt-1 text-body-sm text-text-muted">
              {canceling.visit?.scheduledAtLabel}. Seu interesse no imóvel continua registrado e você
              pode agendar outro horário depois.
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setCanceling(null)}
                className="min-h-11 flex-1 rounded-xl bg-surface-sunken text-body-sm font-bold text-text"
              >
                Manter visita
              </button>
              <button
                type="button"
                disabled={cancelarVisita.isPending}
                onClick={() => cancelarVisita.mutate(canceling.itemId)}
                className="min-h-11 flex-1 rounded-xl bg-[var(--danger-soft)] text-body-sm font-bold text-[var(--danger-fg)]"
              >
                {cancelarVisita.isPending ? "Cancelando..." : "Cancelar visita"}
              </button>
            </div>
          </div>
        </div>
      )}

      {dismissing && (
        <DismissSheet
          item={dismissing}
          busy={responder.isPending}
          onConfirm={(reason) => {
            responder.mutate(
              { itemId: dismissing.itemId, dto: { response: "sem_interesse", reason } },
              { onSuccess: () => setDismissing(null) },
            );
          }}
          onClose={() => setDismissing(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card do imóvel
// ---------------------------------------------------------------------------

export function ItemCard({
  token,
  item,
  busy = false,
  readOnly = false,
  renderImage,
  onLike,
  onUndo,
  onDismiss,
  onVisit,
  onCancelVisit,
}: {
  token?: string;
  item: PublicSelectionItemCard;
  busy?: boolean;
  /** Prévia do corretor: mesma aparência, sem ações nem navegação. */
  readOnly?: boolean;
  /** A prévia injeta AuthImage; a página pública usa img comum. */
  renderImage?: (src: string, alt: string) => JSX.Element;
  onLike?: () => void;
  onUndo?: () => void;
  onDismiss?: () => void;
  onVisit?: () => void;
  onCancelVisit?: () => void;
}) {
  const gostou = item.response === "tenho_interesse";
  const descartou = item.response === "sem_interesse";
  const querVisitar = item.response === "quero_visitar" || item.visitRequestedAt != null;

  const atributos = [
    item.bedrooms != null ? `${item.bedrooms} q` : null,
    item.bathrooms != null ? `${item.bathrooms} b` : null,
    item.parkingSpots != null ? `${item.parkingSpots} v` : null,
    item.area != null ? `${item.area} m²` : null,
  ].filter(Boolean);

  // Descartado recolhe: continua na página (dá para desfazer), sem gritar.
  const apagado = descartou || item.unavailable;

  return (
    <article
      className={`overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition-opacity ${apagado ? "opacity-60" : ""}`}
    >
      <CardWrapper
        readOnly={readOnly}
        to={token ? `/s/${token}/imovel/${item.itemId}` : undefined}
      >
        <div className="relative aspect-[16/10] bg-surface-sunken">
          {item.coverUrl ? (
            renderImage ? (
              renderImage(item.coverUrl, item.title)
            ) : (
              <img src={item.coverUrl} alt={item.title} loading="lazy" className="h-full w-full object-cover" />
            )
          ) : (
            <div className="flex h-full items-center justify-center text-text-subtle">
              <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 10.5L12 4l8 6.5M5.5 9.5V20h13V9.5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
            </div>
          )}
          {item.highlight && !item.unavailable && (
            <span className="absolute left-3 top-3 rounded-full bg-accent px-2.5 py-1 text-caption font-bold uppercase tracking-wide text-accent-on">
              Destaque
            </span>
          )}
          {item.unavailable && (
            <span className="absolute left-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-caption font-bold uppercase tracking-wide text-white">
              Não está mais disponível
            </span>
          )}
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="line-clamp-2 text-body-lg font-bold text-text">{item.title}</h3>
              {item.locationLine && (
                <p className="mt-0.5 text-body-sm text-text-muted">{item.locationLine}</p>
              )}
            </div>
            <p className="shrink-0 text-right text-body-lg font-bold tabular-nums text-text">
              {item.priceLabel}
            </p>
          </div>
          {atributos.length > 0 && (
            <p className="mt-2 text-body-sm text-text-muted">{atributos.join(" · ")}</p>
          )}
          {item.brokerNote && (
            <p className="mt-3 rounded-xl bg-accent-soft px-3 py-2 text-body-sm text-text">
              <span className="font-semibold text-accent">Nota do corretor: </span>
              {item.brokerNote}
            </p>
          )}
          {!readOnly && (
            <p className="mt-3 text-body-sm font-semibold text-accent">Ver detalhes e fotos →</p>
          )}
        </div>
      </CardWrapper>

      {/* Ações de resposta: fora do link, um toque cada. */}
      {!item.unavailable && !readOnly && (
        <div className="flex items-center gap-2 border-t border-border px-4 py-3">
          {item.visit ? (
            <>
              <p className="flex items-center gap-2 text-body-sm font-semibold text-[var(--success-fg)]">
                <CheckIcon /> Visita: {item.visit.scheduledAtLabel}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => onCancelVisit?.()}
                className="ml-auto min-h-10 shrink-0 rounded-xl px-3 text-body-sm font-semibold text-text-subtle hover:text-text"
              >
                Cancelar
              </button>
            </>
          ) : querVisitar ? (
            <p className="flex items-center gap-2 text-body-sm font-semibold text-[var(--success-fg)]">
              <CheckIcon /> Visita solicitada! O corretor vai combinar o horário.
            </p>
          ) : gostou ? (
            <>
              <p className="flex items-center gap-1.5 text-body-sm font-semibold text-[var(--success-fg)]">
                <CheckIcon /> Você gostou
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => onVisit?.()}
                className="ml-auto flex min-h-10 items-center justify-center rounded-xl px-4 text-body-sm font-bold text-white"
                style={{ backgroundColor: WHATSAPP }}
              >
                Quero visitar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onUndo?.()}
                className="min-h-10 rounded-xl px-3 text-body-sm font-semibold text-text-subtle hover:text-text"
              >
                Desfazer
              </button>
            </>
          ) : descartou ? (
            <>
              <p className="text-body-sm text-text-muted">
                Não combina{item.responseReason ? ` (${DISMISS_LABELS[item.responseReason as SelectionDismissReason] ?? item.responseReason})` : ""}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => onUndo?.()}
                className="ml-auto min-h-10 rounded-xl px-3 text-body-sm font-semibold text-accent"
              >
                Desfazer
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => onLike?.()}
                className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--success-soft)] text-body-sm font-bold text-[var(--success-fg)] transition-transform duration-fast active:scale-[0.98]"
              >
                <HeartIcon /> Gostei
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onDismiss?.()}
                className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-surface-sunken text-body-sm font-bold text-text-muted transition-transform duration-fast active:scale-[0.98]"
              >
                Não combina
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Folha do "não combina": motivo opcional, nunca obrigatório
// ---------------------------------------------------------------------------

function DismissSheet({
  item,
  busy,
  onConfirm,
  onClose,
}: {
  item: PublicSelectionItemCard;
  busy: boolean;
  onConfirm: (reason: SelectionDismissReason | undefined) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<SelectionDismissReason | undefined>(undefined);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="O que não combinou?"
        className="animate-rise relative w-full max-w-md rounded-t-2xl bg-surface p-5 shadow-lg sm:rounded-2xl"
      >
        <h2 className="text-h3 text-text">O que não combinou?</h2>
        <p className="mt-1 text-body-sm text-text-muted">
          Opcional, mas ajuda o corretor a acertar nas próximas opções.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {SELECTION_DISMISS_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={reason === r}
              onClick={() => setReason(reason === r ? undefined : r)}
              className={`min-h-10 rounded-full border px-4 text-body-sm font-semibold transition-colors duration-fast ${
                reason === r
                  ? "border-accent bg-accent text-accent-on"
                  : "border-border bg-surface text-text hover:border-accent"
              }`}
            >
              {DISMISS_LABELS[r]}
            </button>
          ))}
        </div>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded-xl bg-surface-sunken text-body-sm font-bold text-text"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm(reason)}
            className="min-h-11 flex-1 rounded-xl bg-primary text-body-sm font-bold text-primary-on"
          >
            {busy ? "Enviando..." : "Confirmar"}
          </button>
        </div>
        <p className="mt-2 text-center text-caption text-text-subtle">{item.title}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Corretor e estados de borda
// ---------------------------------------------------------------------------

export function BrokerFooter({ broker }: { broker: PublicSelectionBroker }) {
  return (
    <section className="mt-10 flex flex-col items-start gap-4 rounded-2xl bg-primary p-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-body-lg font-bold text-primary-on">{broker.name}</p>
        <p className="mt-0.5 text-body-sm text-white/70">
          {[
            broker.agencyName,
            broker.verified && broker.creci ? `CRECI ${broker.creci}${broker.creciUf ? `/${broker.creciUf}` : ""}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || "Seu corretor"}
        </p>
        {broker.verified && (
          <p className="mt-1 flex items-center gap-1 text-caption font-semibold text-white/70">
            <CheckIcon /> Corretor verificado
          </p>
        )}
      </div>
      {broker.whatsapp && (
        <a
          href={`https://wa.me/${broker.whatsapp.replace(/\D/g, "").length <= 11 ? "55" : ""}${broker.whatsapp.replace(/\D/g, "")}`}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-6 text-body font-bold text-white sm:w-auto"
          style={{ backgroundColor: WHATSAPP }}
        >
          Falar com {broker.name.split(" ")[0]}
        </a>
      )}
    </section>
  );
}

function Esqueleto() {
  return (
    <div className="min-h-dvh bg-bg" aria-busy="true">
      <div className="h-52 animate-pulse bg-primary/80" />
      <div className="mx-auto -mt-4 flex max-w-3xl flex-col gap-4 px-4">
        <div className="h-16 animate-pulse rounded-2xl bg-surface-sunken" />
        <div className="h-72 animate-pulse rounded-2xl bg-surface-sunken" />
        <div className="h-72 animate-pulse rounded-2xl bg-surface-sunken" />
      </div>
    </div>
  );
}

/** Expirada/revogada: sem imóveis, mas com o caminho até o corretor. */
export function Encerrada({
  broker,
  reason,
}: {
  broker: PublicSelectionBroker | null;
  reason: "expirado" | "revogado" | "indisponivel";
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-6 text-center font-sans">
      <span className="text-h3 font-extrabold tracking-tight text-text-muted">
        ne<span className="text-accent">x</span>tlar
      </span>
      <h1 className="mt-6 text-h1 text-text">Esta seleção não está mais disponível</h1>
      <p className="mt-2 max-w-sm text-body text-text-muted">
        {reason === "expirado"
          ? "O prazo de acesso terminou, e os imóveis e condições podem ter mudado. Fale com o corretor para receber opções atualizadas."
          : "Os imóveis e as condições podem ter mudado. Fale com o corretor para receber opções atualizadas."}
      </p>
      {broker?.whatsapp && (
        <a
          href={`https://wa.me/${broker.whatsapp.replace(/\D/g, "").length <= 11 ? "55" : ""}${broker.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent("Olá! Recebi uma seleção de imóveis sua que expirou. Pode me enviar opções atualizadas?")}`}
          target="_blank"
          rel="noreferrer"
          className="mt-6 flex min-h-12 items-center justify-center rounded-xl px-6 text-body font-bold text-white"
          style={{ backgroundColor: WHATSAPP }}
        >
          Pedir uma nova seleção
        </a>
      )}
      {broker && (
        <p className="mt-3 text-body-sm text-text-muted">
          {broker.name}
          {broker.verified ? " · Corretor verificado" : ""}
        </p>
      )}
    </div>
  );
}

/** Link navegável na página real; bloco inerte na prévia. */
function CardWrapper({
  readOnly,
  to,
  children,
}: {
  readOnly: boolean;
  to?: string;
  children: React.ReactNode;
}) {
  if (readOnly || !to) return <div>{children}</div>;
  return (
    <Link to={to} className="block">
      {children}
    </Link>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 21c-4.8-3.6-8-6.7-8-10a4.6 4.6 0 018-3.2A4.6 4.6 0 0120 11c0 3.3-3.2 6.4-8 10z" />
    </svg>
  );
}
