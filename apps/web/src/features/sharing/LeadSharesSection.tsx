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
import { ProposeVisitSheet } from "./ProposeVisitSheet";
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

interface LeadRef {
  id: string;
  code: number;
  fullName: string;
  whatsapp: string;
}

/**
 * Imóveis enviados na ficha da lead: resumo (quando há volume) e uma prévia
 * curta com a resposta de cada um por extenso, sem reticências no que importa.
 * A recomendação do que fazer agora mora no card "Próxima ação" da página; a
 * lista aqui é o registro completo, com a ação contextual em cada linha.
 */
export function LeadSharesSection({ lead, onShare }: { lead: LeadRef; onShare: () => void }) {
  const navigate = useNavigate();
  const [menuShare, setMenuShare] = useState<LeadShareSummary | null>(null);
  const [visitaShare, setVisitaShare] = useState<LeadShareSummary | null>(null);

  const query = useQuery({
    queryKey: ["lead-shares", lead.id],
    queryFn: () => fetchLeadShares(lead.id),
  });

  const shares = query.data ?? [];
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

  const primeiroNome = lead.fullName.split(" ")[0];

  return (
    <>
      {/* Resumo dos imóveis: só a partir de um volume que justifique o apanhado.
          Com poucos imóveis a lista logo abaixo já comunica tudo sem repetir. */}
      {shares.length >= 4 && (
        <section className="animate-rise rounded-2xl border border-border bg-surface p-4 sm:p-6">
          <h2 className="text-label font-semibold text-text">Resumo dos imóveis</h2>
          <ResumoStrip summary={summary} />
        </section>
      )}

      {/* Índice na ficha: prévia dos mais relevantes + atalho para a página. */}
      <section className="animate-rise rounded-2xl border border-border bg-surface p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-label font-semibold text-text">
              Imóveis enviados
              {shares.length > 0 && <span className="ml-1 text-text-subtle">({shares.length})</span>}
            </h2>
            <p className="mt-1 text-body-sm text-text-subtle">o que a lead recebeu e como respondeu</p>
          </div>
          {shares.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              onClick={onShare}
              className="-my-1 shrink-0 !min-h-11 !px-4 text-body-sm"
            >
              Compartilhar
            </Button>
          )}
        </div>

        {query.isPending ? (
          <div className="mt-4 h-24 animate-pulse rounded-xl bg-surface-sunken" />
        ) : query.isError ? (
          <div className="mt-4">
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
            <Button type="button" variant="accent" className="mt-4" onClick={onShare}>
              Compartilhar imóveis
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
                  onProposeVisit={setVisitaShare}
                />
              ))}
            </ul>

            {/* O botão leva à página dedicada com todos os imóveis enviados. */}
            {hasMore && (
              <button
                type="button"
                onClick={() => navigate(leadSharesPath(lead.code))}
                className="mt-4 flex min-h-[var(--tap-target-min)] w-full items-center justify-center gap-2 rounded-xl border border-border text-body-sm font-semibold text-text-muted transition-colors hover:bg-surface-sunken hover:text-text"
              >
                Ver todos os {shares.length} imóveis enviados
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
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

      {visitaShare && (
        <ProposeVisitSheet
          titulo={visitaShare.visitRequestedAt ? "Combinar a visita" : "Propor visita"}
          mensagem={
            visitaShare.visitRequestedAt || visitaShare.response === "quero_visitar"
              ? `Oi ${primeiroNome}! Vi que você quer visitar o ${visitaShare.propertyTitle}. Bora combinar? Me diz o melhor dia e horário que eu organizo tudo.`
              : `Oi ${primeiroNome}! Que bom que você gostou do ${visitaShare.propertyTitle}. Quer marcar uma visita? Me diz o melhor dia e horário que eu organizo tudo.`
          }
          leadWhatsapp={lead.whatsapp}
          onClose={() => setVisitaShare(null)}
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
              <div className="mb-4 flex flex-wrap items-center gap-2">
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
              <div className="mt-4 flex flex-col gap-2">
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
  onProposeVisit,
}: {
  shares: LeadShareSummary[];
  onOpenMenu: (s: LeadShareSummary) => void;
  onOpenProperty: (s: LeadShareSummary) => void;
  /** Mesma ação contextual da ficha: sem ela, a página completa oferece menos. */
  onProposeVisit?: (s: LeadShareSummary) => void;
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
        <ShareRow
          key={s.itemId}
          share={s}
          onOpenMenu={onOpenMenu}
          onOpenProperty={onOpenProperty}
          onProposeVisit={onProposeVisit}
        />
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
            className="w-full rounded-xl border border-border bg-surface py-2 pl-10 pr-10 text-body text-text placeholder:text-text-subtle"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-sunken hover:text-text"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
        <div className="scrollbar-none mt-2 flex gap-2 overflow-x-auto">
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
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <div key={g.bucket}>
              <h3 className="mb-2 text-label font-semibold text-text">
                {BUCKET_LABEL[g.bucket]} <span className="font-normal text-text-subtle">({g.items.length})</span>
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
    <div className="mt-4 flex divide-x divide-border">
      {cells.map((c) => (
        <div key={c.label} className="flex min-w-0 flex-1 flex-col items-center px-1 py-1 text-center">
          <div className={`text-h3 font-extrabold tabular-nums sm:text-h2 ${c.tone}`}>{c.value}</div>
          <div className="mt-1 truncate text-[11px] leading-tight text-text-subtle sm:text-caption">
            {c.label}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Linha da lista: título em até duas linhas (reticências escondem justamente
 * o que diferencia "Cobertura duplex com vista" de "Cobertura duplex sem"),
 * resposta com data, e a ação contextual quando a resposta pede movimento.
 * A linha inteira abre o imóvel (botão de fundo); o que fica por cima (CTA e
 * "...") sobe com z-10.
 */
function ShareRow({
  share,
  onOpenMenu,
  onOpenProperty,
  onProposeVisit,
}: {
  share: LeadShareSummary;
  onOpenMenu: (s: LeadShareSummary) => void;
  onOpenProperty: (s: LeadShareSummary) => void;
  onProposeVisit?: (s: LeadShareSummary) => void;
}) {
  const status = shareDisplayStatus(share);
  const bucket = shareBucket(share);
  const querVisita = Boolean(share.visitRequestedAt) || share.response === "quero_visitar";
  const mostraVisita = onProposeVisit && bucket === "interesse";

  return (
    <li className="relative flex gap-4 bg-surface p-4 transition-colors hover:bg-surface-sunken/60">
      <button
        type="button"
        onClick={() => onOpenProperty(share)}
        aria-label={`Abrir ${share.propertyTitle}`}
        className="absolute inset-0 focus-visible:shadow-focus"
      />

      <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-sunken">
        {share.coverUrl ? (
          <AuthImage src={share.coverUrl} alt={share.propertyTitle} className="h-full w-full object-cover" />
        ) : (
          <CoverFallback />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex items-start gap-2">
          <span className="line-clamp-2 text-body-sm font-semibold leading-snug text-text">
            {share.propertyTitle}
          </span>
          {share.isPriority && <StarIcon className="mt-1 h-3.5 w-3.5 shrink-0 text-accent" filled />}
        </p>
        <p className="mt-1 text-body-sm">
          <span className="font-bold text-text">{share.priceLabel}</span>
          <span className="text-text-subtle"> · </span>
          <span className={`font-semibold ${TONE_TEXT[status.tone]}`}>{status.label}</span>
        </p>
        <p className="mt-1 text-caption text-text-subtle">{quando(share)}</p>

        {mostraVisita && (
          <button
            type="button"
            onClick={() => onProposeVisit(share)}
            className="relative z-10 mt-1 inline-flex min-h-[var(--tap-target-min)] items-center gap-1 rounded-md text-body-sm font-semibold text-accent transition-colors hover:underline"
          >
            {querVisita ? "Combinar visita" : "Propor visita"}
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>

      <button
        type="button"
        aria-label={`Ações de ${share.propertyTitle}`}
        onClick={() => onOpenMenu(share)}
        className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center self-start rounded-md text-text-muted transition-colors hover:bg-surface-sunken hover:text-text"
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

/** Quando aconteceu o que a linha mostra: resposta > visita > envio. */
function quando(share: LeadShareSummary): string {
  if (share.visitRequestedAt) return `visita pedida ${dataCurta(share.visitRequestedAt)}`;
  if (share.respondedAt && share.response !== "nao_visualizado" && share.response !== "visualizado")
    return `respondeu ${dataCurta(share.respondedAt)}`;
  if (share.sentAt) return `enviado ${dataCurta(share.sentAt)}`;
  return `criado ${dataCurta(share.createdAt)}`;
}

function dataCurta(iso: string): string {
  const date = new Date(iso);
  const hoje = new Date();
  const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((inicioDoDia(hoje) - inicioDoDia(date)) / 86_400_000);
  if (dias === 0) return "hoje";
  if (dias === 1) return "ontem";
  return `em ${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`;
}

/** Quando o imóvel não tem foto de capa: ícone de casa em vez de bloco vazio. */
export function CoverFallback() {
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
    <span className={`rounded-full px-2 py-1 text-caption font-semibold ${TONE_CLASSES[s.tone]}`}>
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
        "flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-4 text-body-sm font-semibold transition-colors " +
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
