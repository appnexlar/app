import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LeadShareSummary } from "@nexlar/shared";
import { Banner } from "../../components/ui/Banner";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Modal } from "../../components/ui/Modal";
import { AuthImage } from "../properties/AuthImage";
import {
  fetchLeadShares,
  publicShareUrl,
  resendShare,
  revokeShare,
  setSharePriority,
  setShareResponse,
  whatsappDigits,
} from "./api";
import { leadSharesPath } from "../../lib/routes";
import {
  RESPONSE_OPTIONS,
  SHARE_RESPONSE_LABELS,
  shareDisplayStatus,
  sharePropertyUnavailable,
} from "./labels";

const TONE_CLASSES: Record<string, string> = {
  success: "bg-[var(--success-soft)] text-[var(--success-fg)]",
  accent: "bg-accent-soft text-accent",
  danger: "bg-[var(--danger-soft)] text-[var(--danger-fg)]",
  neutral: "bg-surface-sunken text-text-muted",
};

// Só a cor do texto, para o status caber na linha compacta da lista (sem pill).
const TONE_TEXT: Record<string, string> = {
  success: "text-[var(--success-fg)]",
  accent: "text-accent",
  danger: "text-[var(--danger-fg)]",
  neutral: "text-text-muted",
};

/** Próxima ação sugerida (embrião do assistente): visita > interesse > aguardar. */
function nextAction(share: LeadShareSummary): string {
  if (sharePropertyUnavailable(share)) return "Avisar a lead e enviar uma opção parecida";
  if (share.status === "revogada") return "Gerar novo link, se necessário";
  if (share.visitRequestedAt) return "Confirmar a visita com a lead";
  if (share.response === "tenho_interesse") return "Propor uma visita";
  if (share.response === "quero_visitar") return "Confirmar a visita com a lead";
  if (share.response === "talvez") return "Enviar um empurrãozinho no WhatsApp";
  if (share.response === "sem_interesse") return "Enviar outra opção do perfil";
  if (share.viewCount > 0) return "Perguntar o que achou";
  return "Aguardando a lead abrir o link";
}

type FocusCta = { kind: "whatsapp" | "send" | "resend" | "none"; label: string };

/** O botão certo para o foco atual: quase sempre falar com a lead. */
function focusCta(share: LeadShareSummary): FocusCta {
  if (sharePropertyUnavailable(share)) return { kind: "send", label: "Enviar opção parecida" };
  if (share.status === "revogada") return { kind: "resend", label: "Gerar novo link" };
  if (share.visitRequestedAt || share.response === "quero_visitar")
    return { kind: "whatsapp", label: "Confirmar no WhatsApp" };
  if (share.response === "tenho_interesse")
    return { kind: "whatsapp", label: "Propor visita no WhatsApp" };
  if (share.response === "talvez") return { kind: "whatsapp", label: "Mandar um empurrãozinho" };
  if (share.response === "sem_interesse") return { kind: "send", label: "Enviar outra opção" };
  if (share.viewCount > 0) return { kind: "whatsapp", label: "Perguntar o que achou" };
  return { kind: "whatsapp", label: "Chamar no WhatsApp" };
}

/**
 * O imóvel que merece atenção agora: o marcado como prioritário; sem ele, o
 * mais engajado (visita > interesse > talvez > visto). Ancla o "Foco de agora".
 */
function pickFocus(shares: LeadShareSummary[]): LeadShareSummary | null {
  if (shares.length === 0) return null;
  const priority = shares.find((s) => s.isPriority);
  if (priority) return priority;
  const rank = (s: LeadShareSummary): number => {
    if (s.visitRequestedAt) return 5;
    if (s.response === "quero_visitar" || s.response === "tenho_interesse") return 4;
    if (s.response === "talvez") return 3;
    if (s.viewCount > 0) return 2;
    return 1;
  };
  return [...shares].sort((a, b) => rank(b) - rank(a))[0];
}

/**
 * Baldes de acompanhamento para dar hierarquia quando há muitos imóveis
 * enviados: o que pede ação (interesse) vem antes do que só aguarda, e o que
 * já encerrou (recusado, revogado, imóvel indisponível) desce para o fim.
 */
type ShareBucket = "interesse" | "aguardando" | "sem_interesse" | "encerrados";

function shareBucket(s: LeadShareSummary): ShareBucket {
  if (sharePropertyUnavailable(s) || s.status === "revogada" || s.status === "expirada")
    return "encerrados";
  if (s.visitRequestedAt || s.response === "quero_visitar" || s.response === "tenho_interesse")
    return "interesse";
  if (s.response === "sem_interesse") return "sem_interesse";
  return "aguardando";
}

const BUCKET_ORDER: ShareBucket[] = ["interesse", "aguardando", "sem_interesse", "encerrados"];
const BUCKET_RANK: Record<ShareBucket, number> = {
  interesse: 0,
  aguardando: 1,
  sem_interesse: 2,
  encerrados: 3,
};
const BUCKET_LABEL: Record<ShareBucket, string> = {
  interesse: "Interesse",
  aguardando: "Aguardando",
  sem_interesse: "Sem interesse",
  encerrados: "Encerrados",
};

function sentTime(s: LeadShareSummary): number {
  return new Date(s.sentAt ?? s.createdAt).getTime();
}

/** Prioritário primeiro, depois por balde, e o mais recente antes dentro do balde. */
export function sortShares(shares: LeadShareSummary[]): LeadShareSummary[] {
  return [...shares].sort((a, b) => {
    if (a.isPriority !== b.isPriority) return a.isPriority ? -1 : 1;
    const byBucket = BUCKET_RANK[shareBucket(a)] - BUCKET_RANK[shareBucket(b)];
    if (byBucket !== 0) return byBucket;
    return sentTime(b) - sentTime(a);
  });
}

/**
 * Bloco de imóveis enviados na ficha da lead: Foco de agora, resumo e uma
 * prévia curta. A lista completa vive em página própria (ver SharesExplorer),
 * alcançada pelo botão "Ver todos".
 */
export function LeadSharesSection({
  lead,
  onSend,
}: {
  lead: { id: string; code: number; whatsapp: string };
  onSend: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [menuShare, setMenuShare] = useState<LeadShareSummary | null>(null);

  const query = useQuery({
    queryKey: ["lead-shares", lead.id],
    queryFn: () => fetchLeadShares(lead.id),
  });

  // Reenvio direto do "Foco de agora" (a folha de ações tem o seu próprio).
  const resend = useMutation({
    mutationFn: resendShare,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-shares", lead.id] });
      queryClient.invalidateQueries({ queryKey: ["lead", lead.id] });
    },
  });

  const shares = query.data ?? [];
  const focus = pickFocus(shares);
  const cta = focus ? focusCta(focus) : null;
  const summary = {
    enviados: shares.length,
    visualizados: shares.filter((s) => s.viewCount > 0 || s.response !== "nao_visualizado").length,
    interesse: shares.filter((s) => s.response === "tenho_interesse" || s.response === "quero_visitar").length,
    rejeitados: shares.filter((s) => s.response === "sem_interesse").length,
    visitas: shares.filter((s) => s.visitRequestedAt).length,
  };

  // Na ficha só uma prévia curta ordenada por relevância; o botão leva à
  // página completa, que escala para dezenas de imóveis.
  const sorted = sortShares(shares);
  const PREVIEW_LIMIT = 3;
  const preview = sorted.slice(0, PREVIEW_LIMIT);
  const hasMore = shares.length > PREVIEW_LIMIT;

  return (
    <>
      {/* Foco de agora: a próxima ação certa fica no topo, no espírito do
          assistente. Ancorada no imóvel prioritário (ou no mais engajado). */}
      {focus && cta && (
        <section className="animate-rise overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 sm:px-5">
            <TargetIcon className="h-4 w-4 text-accent" />
            <span className="text-label uppercase tracking-wide text-text-subtle">Foco de agora</span>
          </div>
          <div className="p-4 sm:p-5">
            <p className="text-h3 text-text">{nextAction(focus)}</p>

            <button
              type="button"
              onClick={() => navigate(`/imoveis/${focus.propertyId}`)}
              className="mt-3 flex w-full items-center gap-3 rounded-xl border border-border bg-surface-sunken/40 p-2.5 text-left transition-colors hover:bg-surface-sunken"
            >
              <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-sunken">
                {focus.coverUrl ? (
                  <AuthImage src={focus.coverUrl} alt={focus.propertyTitle} className="h-full w-full object-cover" />
                ) : (
                  <CoverFallback />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-body-sm font-semibold text-text">{focus.propertyTitle}</span>
                  {focus.isPriority && <StarIcon className="h-3.5 w-3.5 shrink-0 text-accent" filled />}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <StatusBadge share={focus} />
                  <span className="text-caption text-text-subtle">{focus.priceLabel}</span>
                </span>
              </span>
              <svg className="h-5 w-5 shrink-0 text-text-subtle" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {cta.kind === "whatsapp" ? (
              <button
                type="button"
                onClick={() => openWhatsapp(focus, lead.whatsapp)}
                className="mt-4 flex min-h-[var(--tap-target-min)] w-full items-center justify-center gap-2 rounded-xl bg-success px-4 text-body font-semibold text-white shadow-xs transition-[transform,filter] duration-fast ease-standard hover:brightness-105 active:scale-[0.99] focus-visible:shadow-focus"
              >
                <WhatsAppGlyph className="h-5 w-5" />
                {cta.label}
              </button>
            ) : cta.kind === "resend" ? (
              <Button
                type="button"
                variant="accent"
                fullWidth
                className="mt-4"
                disabled={resend.isPending}
                onClick={() => resend.mutate(focus.id)}
              >
                {resend.isPending ? "Gerando..." : cta.label}
              </Button>
            ) : (
              <Button type="button" variant="accent" fullWidth className="mt-4" onClick={onSend}>
                {cta.label}
              </Button>
            )}
          </div>
        </section>
      )}

      {/* Resumo dos imóveis: só a partir de um volume que justifique o apanhado.
          Com poucos imóveis a lista logo abaixo já comunica tudo sem repetir. */}
      {shares.length >= 4 && (
        <section className="animate-rise rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
          <h2 className="text-label uppercase tracking-wide text-text-subtle">
            Resumo dos imóveis
          </h2>
          <ResumoStrip summary={summary} />
        </section>
      )}

      {/* Índice na ficha: prévia dos mais relevantes + atalho para a página. */}
      <section className="animate-rise rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-label uppercase tracking-wide text-text-subtle">
              Imóveis enviados
              {shares.length > 0 && <span className="ml-1.5 text-text-muted">({shares.length})</span>}
            </h2>
            <p className="mt-0.5 text-body-sm text-text-subtle">o que a lead recebeu e como respondeu</p>
          </div>
          {shares.length > 0 && (
            <Button type="button" variant="accent" onClick={onSend} className="hidden shrink-0 sm:inline-flex">
              Enviar imóvel
            </Button>
          )}
        </div>

        {query.isPending ? (
          <div className="mt-4 h-24 animate-pulse rounded-xl bg-surface-sunken" />
        ) : query.isError ? (
          <div className="mt-3">
            <Banner variant="danger">Não foi possível carregar os imóveis enviados.</Banner>
          </div>
        ) : shares.length === 0 ? (
          <div className="mt-4 flex flex-col items-center rounded-xl border border-dashed border-border-strong bg-surface-sunken/40 px-6 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 11l9-7 9 7M5 9.5V20a1 1 0 001 1h12a1 1 0 001-1V9.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="mt-4 text-body font-semibold text-text">Nenhum imóvel enviado</p>
            <p className="mt-1 max-w-sm text-body-sm text-text-muted">
              Envie imóveis da sua carteira que combinem com o perfil desta lead.
            </p>
            <Button type="button" variant="accent" className="mt-5" onClick={onSend}>
              Enviar imóvel
            </Button>
          </div>
        ) : (
          <>
            <ul className="mt-4 overflow-hidden rounded-xl border border-border divide-y divide-border">
              {preview.map((share) => (
                <ShareRow
                  key={share.itemId}
                  share={share}
                  onOpenMenu={setMenuShare}
                  onOpenProperty={(s) => navigate(`/imoveis/${s.propertyId}`)}
                />
              ))}
            </ul>

            {/* O botão leva à página dedicada com todos os imóveis enviados. */}
            {hasMore && (
              <button
                type="button"
                onClick={() => navigate(leadSharesPath(lead.code))}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-body-sm font-semibold text-text-muted transition-colors hover:bg-surface-sunken hover:text-text"
              >
                Ver todos os {shares.length} imóveis enviados
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}

            {/* No mobile o botão fica no fim da lista, perto do polegar. */}
            <Button type="button" variant="accent" fullWidth onClick={onSend} className="mt-4 sm:hidden">
              Enviar imóvel
            </Button>
          </>
        )}
      </section>

      {menuShare && (
        <ShareActionSheet
          share={menuShare}
          leadId={lead.id}
          leadWhatsapp={lead.whatsapp}
          onClose={() => setMenuShare(null)}
        />
      )}
    </>
  );
}

/** Abre o WhatsApp da lead com a mensagem e o link público do imóvel. */
function openWhatsapp(share: LeadShareSummary, leadWhatsapp: string) {
  const text = `${share.message ?? ""}\n${publicShareUrl(share.publicToken)}`.trim();
  window.open(
    `https://wa.me/${whatsappDigits(leadWhatsapp)}?text=${encodeURIComponent(text)}`,
    "_blank",
    "noopener",
  );
}

/**
 * Folha de ações de um imóvel enviado. Autossuficiente: cuida das mutações
 * (reenviar, revogar, registrar resposta, prioridade) e do próprio diálogo de
 * revogação. Usada tanto na prévia da ficha quanto na página completa.
 */
export function ShareActionSheet({
  share,
  leadId,
  leadWhatsapp,
  onClose,
}: {
  share: LeadShareSummary;
  leadId: string;
  leadWhatsapp: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [view, setView] = useState<"acoes" | "resposta" | "revogar">("acoes");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["lead-shares", leadId] });
    queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
  };

  const resend = useMutation({ mutationFn: resendShare, onSuccess: invalidate });
  const revoke = useMutation({
    mutationFn: revokeShare,
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });
  const respond = useMutation({
    mutationFn: (response: LeadShareSummary["response"]) =>
      setShareResponse(share.id, share.itemId, response),
    onSuccess: invalidate,
  });
  const priority = useMutation({
    mutationFn: (value: boolean) => setSharePriority(share.id, share.itemId, value),
    onSuccess: invalidate,
  });

  return (
    <>
      {view !== "revogar" && (
        <Modal open onClose={onClose} title={share.propertyTitle}>
          {view === "acoes" ? (
            <div className="flex flex-col">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <StatusBadge share={share} />
                <span className="text-body-sm text-text-muted">{share.priceLabel}</span>
                {share.viewCount > 0 && (
                  <span className="text-body-sm text-text-subtle">
                    {share.viewCount} {share.viewCount === 1 ? "visualização" : "visualizações"}
                  </span>
                )}
              </div>
              <div className="overflow-hidden rounded-xl border border-border">
                <SheetItem
                  label="Abrir imóvel"
                  onClick={() => {
                    onClose();
                    navigate(`/imoveis/${share.propertyId}`);
                  }}
                />
                <SheetItem label="Registrar resposta da lead" onClick={() => setView("resposta")} />
                <SheetItem
                  label={share.isPriority ? "Remover prioridade" : "Marcar como prioritário"}
                  onClick={() => {
                    priority.mutate(!share.isPriority);
                    onClose();
                  }}
                />
                {share.status !== "revogada" && (
                  <>
                    <SheetItem
                      label="Abrir WhatsApp"
                      onClick={() => {
                        onClose();
                        openWhatsapp(share, leadWhatsapp);
                      }}
                    />
                    {!sharePropertyUnavailable(share) && (
                      <SheetItem
                        label="Reenviar link"
                        disabled={resend.isPending}
                        onClick={() => {
                          resend.mutate(share.id);
                          onClose();
                        }}
                      />
                    )}
                    <SheetItem label="Revogar link" danger onClick={() => setView("revogar")} />
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col">
              <p className="text-body-sm text-text-muted">Como a lead respondeu sobre este imóvel?</p>
              <div className="mt-3 flex flex-col gap-2">
                {RESPONSE_OPTIONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      respond.mutate(r);
                      onClose();
                    }}
                    className={
                      "flex min-h-[var(--tap-target-min)] items-center justify-between rounded-xl border px-4 text-left text-body font-medium transition-colors " +
                      (share.response === r
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-border bg-surface text-text hover:bg-surface-sunken")
                    }
                  >
                    {SHARE_RESPONSE_LABELS[r]}
                    {share.response === r && (
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
              <Button type="button" variant="ghost" className="mt-4 self-start" onClick={() => setView("acoes")}>
                Voltar
              </Button>
            </div>
          )}
        </Modal>
      )}

      <ConfirmDialog
        open={view === "revogar"}
        title="Revogar link"
        description={`O link de "${share.propertyTitle}" deixa de funcionar para esta lead. O histórico é mantido.`}
        confirmLabel={revoke.isPending ? "Revogando..." : "Revogar link"}
        danger
        loading={revoke.isPending}
        onConfirm={() => revoke.mutate(share.id)}
        onCancel={onClose}
      />
    </>
  );
}

/**
 * Explorador da lista completa de imóveis enviados: busca por título/bairro,
 * filtros por balde e agrupamento em "Todos". Sem layout de tela: quem usa
 * (a página dedicada) fornece o cabeçalho e a rolagem.
 */
export function SharesExplorer({
  shares,
  onOpenMenu,
  onOpenProperty,
}: {
  shares: LeadShareSummary[];
  onOpenMenu: (s: LeadShareSummary) => void;
  onOpenProperty: (s: LeadShareSummary) => void;
}) {
  const [filter, setFilter] = useState<ShareBucket | "todos">("todos");
  const [search, setSearch] = useState("");

  const sorted = sortShares(shares);
  const bucketCounts = shares.reduce(
    (acc, s) => {
      acc[shareBucket(s)] += 1;
      return acc;
    },
    { interesse: 0, aguardando: 0, sem_interesse: 0, encerrados: 0 } as Record<ShareBucket, number>,
  );

  const term = search.trim().toLowerCase();
  const filtered = sorted.filter((s) => {
    if (filter !== "todos" && shareBucket(s) !== filter) return false;
    if (!term) return true;
    return [s.propertyTitle, s.neighborhood, s.city].some((v) => v?.toLowerCase().includes(term));
  });
  // Agrupa por balde só em "Todos" sem busca, quando a estrutura ajuda a ler.
  const grouped = filter === "todos" && !term;
  const groups = grouped
    ? BUCKET_ORDER.map((b) => ({ bucket: b, items: filtered.filter((s) => shareBucket(s) === b) })).filter(
        (g) => g.items.length > 0,
      )
    : [];

  const list = (items: LeadShareSummary[]) => (
    <ul className="overflow-hidden rounded-xl border border-border divide-y divide-border">
      {items.map((s) => (
        <ShareRow key={s.itemId} share={s} onOpenMenu={onOpenMenu} onOpenProperty={onOpenProperty} />
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Busca + filtros grudados no topo enquanto a lista rola. */}
      <div className="sticky top-0 z-[1] -mx-1 bg-[var(--bg)] px-1 pb-2 pt-1">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" />
              <path d="M20 20l-3.2-3.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título ou bairro"
            className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-9 text-body text-text placeholder:text-text-subtle"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-sunken hover:text-text"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
        <div className="scrollbar-none mt-3 flex gap-2 overflow-x-auto">
          <FilterChip label="Todos" count={shares.length} active={filter === "todos"} onClick={() => setFilter("todos")} />
          {BUCKET_ORDER.filter((b) => bucketCounts[b] > 0).map((b) => (
            <FilterChip
              key={b}
              label={BUCKET_LABEL[b]}
              count={bucketCounts[b]}
              active={filter === b}
              onClick={() => setFilter(b)}
            />
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-14 text-center">
          <p className="text-body font-semibold text-text">Nenhum imóvel encontrado</p>
          <p className="mt-1 text-body-sm text-text-muted">
            {term ? "Tente outro termo de busca." : "Nenhum imóvel neste filtro."}
          </p>
        </div>
      ) : grouped ? (
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <div key={g.bucket}>
              <h3 className="mb-2 text-label uppercase tracking-wide text-text-subtle">
                {BUCKET_LABEL[g.bucket]} <span className="text-text-muted">({g.items.length})</span>
              </h3>
              {list(g.items)}
            </div>
          ))}
        </div>
      ) : (
        list(filtered)
      )}
    </div>
  );
}

function SheetItem({
  label,
  onClick,
  danger,
  disabled,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        "flex min-h-[var(--tap-target-min)] w-full items-center border-b border-border px-4 text-left text-body transition-colors last:border-b-0 hover:bg-surface-sunken disabled:opacity-50 " +
        (danger ? "font-semibold text-[var(--danger-fg)]" : "text-text")
      }
    >
      {label}
    </button>
  );
}

/**
 * Faixa de métricas no padrão da App Store: os cinco números sempre visíveis,
 * lado a lado, separados por fio, sem rolagem. Cor por significado.
 */
function ResumoStrip({
  summary,
}: {
  summary: { enviados: number; visualizados: number; interesse: number; rejeitados: number; visitas: number };
}) {
  const cells = [
    { label: "Enviados", value: summary.enviados, tone: "text-text" },
    { label: "Vistos", value: summary.visualizados, tone: "text-[var(--highlight-fg)]" },
    { label: "Interesse", value: summary.interesse, tone: "text-[var(--success-fg)]" },
    { label: "Visitas", value: summary.visitas, tone: "text-accent" },
    {
      label: "Rejeitados",
      value: summary.rejeitados,
      tone: summary.rejeitados > 0 ? "text-[var(--danger-fg)]" : "text-text-muted",
    },
  ];
  return (
    <div className="mt-3 flex divide-x divide-border">
      {cells.map((c) => (
        <div key={c.label} className="flex min-w-0 flex-1 flex-col items-center px-1 py-1 text-center">
          <div className={`text-h3 font-extrabold tabular-nums sm:text-h2 ${c.tone}`}>{c.value}</div>
          <div className="mt-0.5 truncate text-[11px] leading-tight text-text-subtle sm:text-caption">
            {c.label}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Linha compacta da lista. A linha inteira abre o imóvel (botão de fundo);
 * o "..." fica acima (z-10) e abre a folha de ações.
 */
function ShareRow({
  share,
  onOpenMenu,
  onOpenProperty,
}: {
  share: LeadShareSummary;
  onOpenMenu: (s: LeadShareSummary) => void;
  onOpenProperty: (s: LeadShareSummary) => void;
}) {
  const status = shareDisplayStatus(share);
  return (
    <li className="relative flex items-center gap-3 bg-surface px-3 py-2.5 transition-colors hover:bg-surface-sunken/60 sm:px-4">
      <button
        type="button"
        onClick={() => onOpenProperty(share)}
        aria-label={`Abrir ${share.propertyTitle}`}
        className="absolute inset-0 focus-visible:shadow-focus"
      />

      <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-sunken">
        {share.coverUrl ? (
          <AuthImage src={share.coverUrl} alt={share.propertyTitle} className="h-full w-full object-cover" />
        ) : (
          <CoverFallback />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5">
          <span className="truncate text-body-sm font-semibold text-text">{share.propertyTitle}</span>
          {share.isPriority && <StarIcon className="h-3.5 w-3.5 shrink-0 text-accent" filled />}
        </p>
        <p className="mt-0.5 truncate text-body-sm">
          <span className="font-bold text-text">{share.priceLabel}</span>
          <span className="text-text-subtle"> · </span>
          <span className={`font-semibold ${TONE_TEXT[status.tone]}`}>{status.label}</span>
        </p>
      </div>

      <button
        type="button"
        aria-label={`Ações de ${share.propertyTitle}`}
        onClick={() => onOpenMenu(share)}
        className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-md text-text-muted transition-colors hover:bg-surface-sunken hover:text-text"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.9" />
          <circle cx="12" cy="12" r="1.9" />
          <circle cx="12" cy="19" r="1.9" />
        </svg>
      </button>
    </li>
  );
}

/** Quando o imóvel não tem foto de capa: ícone de casa em vez de bloco vazio. */
function CoverFallback() {
  return (
    <span className="flex h-full w-full items-center justify-center text-text-subtle">
      <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 11l9-7 9 7M5 9.5V20a1 1 0 001 1h12a1 1 0 001-1V9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function StatusBadge({ share }: { share: LeadShareSummary }) {
  const s = shareDisplayStatus(share);
  return (
    <span className={`rounded-full px-2 py-0.5 text-caption font-semibold ${TONE_CLASSES[s.tone]}`}>
      {s.label}
    </span>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-body-sm font-semibold transition-colors " +
        (active
          ? "border-accent bg-accent-soft text-accent"
          : "border-border bg-surface text-text-muted hover:bg-surface-sunken")
      }
    >
      {label}
      <span className={active ? "text-accent" : "text-text-subtle"}>{count}</span>
    </button>
  );
}

function TargetIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="3.4" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.611-.916-2.206-.242-.58-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12.05 21.785h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885" />
    </svg>
  );
}

function StarIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} aria-hidden="true">
      <path
        d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9L12 3.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
