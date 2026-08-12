import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  SelectionCandidate,
  SelectionExpiryDays,
  SelectionItemView,
  SelectionView,
} from "@nexlar/shared";
import { SELECTION_EXPIRY_OPTIONS, SELECTION_MAX_HIGHLIGHTS } from "@nexlar/shared";
import { ApiError } from "../../lib/http";
import {
  isUuid,
  leadPath,
  selectionPath,
  selectionPreviewPath,
  useCanonicalPath,
} from "../../lib/routes";
import { Button } from "../../components/ui/Button";
import { Banner } from "../../components/ui/Banner";
import { SearchField } from "../../components/ui/SearchField";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { usePageActionBar, usePageEntityLabel } from "../shell/ShellContext";
import { AuthImage } from "../properties/AuthImage";
import { fetchLead } from "../leads/api";
import { whatsappDigits } from "../sharing/api";
import {
  activateSelection,
  addSelectionItem,
  fetchCandidates,
  fetchLeadPreferences,
  fetchSelection,
  removeSelectionItem,
  reorderSelectionItems,
  revokeSelection,
  selectionPublicUrl,
  updateSelection,
  updateSelectionItem,
  type CandidateFilters,
} from "./api";
import {
  COMPATIBILITY_LABELS,
  COMPATIBILITY_TONE_CLASS,
  SELECTION_STATUS_LABELS,
  SELECTION_STATUS_TONE_CLASS,
  preferencePills,
  preferencesUseful,
} from "./labels";
import { PreferencesModal } from "./PreferencesModal";

type Phase = "escolher" | "organizar";

/**
 * Montador da seleção personalizada. Jornada em duas etapas na mesma tela:
 * escolher os imóveis (pesquisa com as preferências da lead já aplicadas) e
 * organizar o envio (ordem, destaques, observações, mensagem e prazo).
 *
 * A Nextlar recomenda pela compatibilidade explicada; quem decide o que entra
 * é sempre o corretor. Rascunho salva a cada gesto: fechar a tela não perde.
 */
export function SelectionBuilderPage() {
  const { id: leadId, selectionId } = useParams<{ id: string; selectionId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState<Phase>("escolher");
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefsDismissed, setPrefsDismissed] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<CandidateFilters>({});
  const [filtersSeeded, setFiltersSeeded] = useState(false);

  const lead = useQuery({
    queryKey: ["lead", leadId],
    queryFn: () => fetchLead(leadId as string),
    enabled: Boolean(leadId),
  });
  usePageEntityLabel(lead.data ? `Seleção para ${lead.data.fullName.split(" ")[0]}` : undefined);

  const selection = useQuery({
    queryKey: ["selection", selectionId],
    queryFn: () => fetchSelection(selectionId as string),
    enabled: Boolean(selectionId),
  });

  // Só o rascunho tem a barra fixa de rodapé; o layout tira a ajuda da frente.
  usePageActionBar(selection.data?.status === "rascunho");

  // URL canônica com os códigos curtos; link antigo com uuid continua abrindo
  // e é trocado assim que a seleção chega.
  const dadosDaSelecao = selection.data;
  useCanonicalPath(
    Boolean(dadosDaSelecao) && (isUuid(leadId) || isUuid(selectionId)),
    selectionPath(dadosDaSelecao?.leadCode ?? "", dadosDaSelecao?.code ?? ""),
  );

  const preferences = useQuery({
    queryKey: ["lead-preferences", leadId],
    queryFn: () => fetchLeadPreferences(leadId as string),
    enabled: Boolean(leadId),
  });

  // As preferências viram filtros iniciais UMA vez; depois o corretor manda.
  useEffect(() => {
    if (filtersSeeded || preferences.data === undefined) return;
    const pref = preferences.data;
    setFilters({
      purpose: pref?.purpose ?? undefined,
      city: pref?.cities[0] ?? undefined,
      neighborhood: pref?.neighborhoods[0] ?? undefined,
      priceMax: pref?.priceMax ?? undefined,
      bedroomsMin: pref?.bedroomsMin ?? undefined,
    });
    setFiltersSeeded(true);
  }, [filtersSeeded, preferences.data]);

  const candidates = useQuery({
    queryKey: ["selection-candidates", selectionId, filters, q],
    queryFn: () => fetchCandidates(selectionId as string, { ...filters, q: q || undefined }),
    enabled: Boolean(selectionId) && filtersSeeded,
    placeholderData: (prev) => prev,
  });

  const invalidate = (updated: SelectionView) => {
    queryClient.setQueryData(["selection", selectionId], updated);
    queryClient.invalidateQueries({ queryKey: ["selection-candidates", selectionId] });
    queryClient.invalidateQueries({ queryKey: ["lead-selections", leadId] });
  };
  const comErro = (e: unknown) =>
    setErro(e instanceof ApiError ? e.message : "Não foi possível concluir a ação. Tente novamente.");

  const addItem = useMutation({
    mutationFn: (candidate: SelectionCandidate) =>
      addSelectionItem(selectionId as string, {
        propertyId: candidate.propertyId,
        origin: candidate.compatibility && candidate.compatibility !== "fora_do_perfil" ? "preferencia" : "manual",
      }),
    onSuccess: invalidate,
    onError: comErro,
  });
  const removeItem = useMutation({
    mutationFn: (itemId: string) => removeSelectionItem(selectionId as string, itemId),
    onSuccess: invalidate,
    onError: comErro,
  });
  const patchItem = useMutation({
    mutationFn: (input: { itemId: string; dto: Parameters<typeof updateSelectionItem>[2] }) =>
      updateSelectionItem(selectionId as string, input.itemId, input.dto),
    onSuccess: invalidate,
    onError: comErro,
  });
  const patchSelection = useMutation({
    mutationFn: (dto: Parameters<typeof updateSelection>[1]) => updateSelection(selectionId as string, dto),
    onSuccess: invalidate,
    onError: comErro,
  });
  const reorder = useMutation({
    mutationFn: (itemIds: string[]) => reorderSelectionItems(selectionId as string, { itemIds }),
    onSuccess: invalidate,
    onError: comErro,
  });
  const activate = useMutation({
    mutationFn: () => activateSelection(selectionId as string),
    onSuccess: invalidate,
    onError: comErro,
  });
  const revoke = useMutation({
    mutationFn: () => revokeSelection(selectionId as string),
    onSuccess: (updated) => {
      setConfirmRevoke(false);
      invalidate(updated);
    },
    onError: comErro,
  });

  if (lead.isPending || selection.isPending) return <BuilderSkeleton />;

  if (lead.isError || selection.isError || !selection.data) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <Banner variant="danger">Não foi possível carregar a seleção. Verifique a conexão.</Banner>
        <Button type="button" variant="ghost" className="self-start" onClick={() => selection.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const sel = selection.data;
  const pref = preferences.data ?? null;
  const pills = preferencePills(pref);
  const semPerfilUtil = preferences.isSuccess && !preferencesUseful(pref);
  const naSelecao = sel.items.length;

  // Seleção já ativa (ou encerrada): a tela vira acompanhamento e envio.
  if (sel.status !== "rascunho") {
    return (
      <ActiveView
        sel={sel}
        leadName={lead.data.fullName}
        leadWhatsapp={lead.data.whatsapp}
        erro={erro}
        onRevoke={() => setConfirmRevoke(true)}
        confirmRevoke={confirmRevoke}
        revokePending={revoke.isPending}
        onConfirmRevoke={() => revoke.mutate()}
        onCancelRevoke={() => setConfirmRevoke(false)}
        onBack={() => navigate(leadPath(dadosDaSelecao?.leadCode ?? leadId ?? ""))}
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-28">
      {erro && (
        <Banner variant="danger">
          <span className="flex items-center justify-between gap-3">
            {erro}
            <button type="button" className="shrink-0 font-semibold underline" onClick={() => setErro(null)}>
              Fechar
            </button>
          </span>
        </Banner>
      )}

      {/* Resumo da lead: o que ela procura, sempre à vista e editável. */}
      <section className="animate-rise rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-label uppercase tracking-wide text-text-subtle">
              O que {lead.data.fullName.split(" ")[0]} procura
            </h2>
            {pills.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {pills.map((pill) => (
                  <span
                    key={pill}
                    className="rounded-full bg-surface-sunken px-2.5 py-0.5 text-caption font-medium text-text"
                  >
                    {pill}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-body-sm text-text-muted">Nenhuma preferência registrada ainda.</p>
            )}
            {pref?.restrictions && (
              <p className="mt-2 text-caption text-[var(--danger-fg)]">Não aceita: {pref.restrictions}</p>
            )}
          </div>
          <Button type="button" variant="ghost" className="-my-1 shrink-0" onClick={() => setPrefsOpen(true)}>
            {pills.length > 0 ? "Editar" : "Preencher"}
          </Button>
        </div>
      </section>

      {/* Perfil incompleto orienta, nunca bloqueia. */}
      {semPerfilUtil && !prefsDismissed && (
        <div className="animate-rise rounded-2xl border border-border bg-accent-soft p-4">
          <p className="text-body-sm text-text">
            As preferências desta pessoa ainda estão incompletas. Você pode continuar manualmente ou
            completar o perfil para melhorar a pesquisa.
          </p>
          <div className="mt-3 flex gap-2.5">
            <Button type="button" onClick={() => setPrefsOpen(true)}>
              Completar preferências
            </Button>
            <Button type="button" variant="ghost" onClick={() => setPrefsDismissed(true)}>
              Continuar manualmente
            </Button>
          </div>
        </div>
      )}

      {/* Etapas da montagem. Segmented control de verdade: uma linha sempre.
          No celular o rótulo encurta e a contagem vira badge, nunca quebra. */}
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-sunken p-1">
        {(
          [
            { key: "escolher", curto: "Escolher", longo: "Escolher imóveis", n: 1 },
            { key: "organizar", curto: "Organizar", longo: "Organizar e enviar", n: 2 },
          ] as { key: Phase; curto: string; longo: string; n: number }[]
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            aria-pressed={phase === tab.key}
            onClick={() => setPhase(tab.key)}
            className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-2 text-body-sm font-semibold transition-colors duration-fast ${
              phase === tab.key ? "bg-surface text-text shadow-sm" : "text-text-subtle"
            }`}
          >
            <span className="tabular-nums">{tab.n} ·</span>
            <span className="sm:hidden">{tab.curto}</span>
            <span className="hidden sm:inline">{tab.longo}</span>
            {tab.key === "organizar" && naSelecao > 0 && (
              <span
                className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold tabular-nums text-accent-on"
                aria-label={`${naSelecao} na seleção`}
              >
                {naSelecao}
              </span>
            )}
          </button>
        ))}
      </div>

      {phase === "escolher" ? (
        <ChoosePhase
          q={q}
          onQ={setQ}
          filters={filters}
          onFilters={setFilters}
          fromPreferences={{
            purpose: pref?.purpose ?? undefined,
            city: pref?.cities[0] ?? undefined,
            neighborhood: pref?.neighborhoods[0] ?? undefined,
            priceMax: pref?.priceMax ?? undefined,
            bedroomsMin: pref?.bedroomsMin ?? undefined,
          }}
          loading={candidates.isPending}
          result={candidates.data}
          itemsInSelection={new Set(sel.items.map((i) => i.propertyId))}
          onAdd={(c) => addItem.mutate(c)}
          onRemoveByProperty={(propertyId) => {
            const item = sel.items.find((i) => i.propertyId === propertyId);
            if (item) removeItem.mutate(item.id);
          }}
          busy={addItem.isPending || removeItem.isPending}
        />
      ) : (
        <OrganizePhase
          sel={sel}
          onMove={(item, direction) => {
            const ordered = sel.items.map((i) => i.id);
            const idx = ordered.indexOf(item.id);
            const alvo = idx + direction;
            if (alvo < 0 || alvo >= ordered.length) return;
            [ordered[idx], ordered[alvo]] = [ordered[alvo], ordered[idx]];
            reorder.mutate(ordered);
          }}
          onHighlight={(item) => patchItem.mutate({ itemId: item.id, dto: { highlight: !item.highlight } })}
          onNote={(item, brokerNote) => patchItem.mutate({ itemId: item.id, dto: { brokerNote } })}
          onRemove={(item) => removeItem.mutate(item.id)}
          onMessage={(message) => patchSelection.mutate({ message })}
          onExpiry={(expiresInDays) => patchSelection.mutate({ expiresInDays })}
        />
      )}

      {/* Barra fixa de progresso: o próximo passo sempre à mão e numa linha só.
          pr extra no mobile para não colidir com o botão flutuante de ajuda. */}
      {/* O balão de ajuda sobe quando esta barra existe (usePageActionBar),
          então aqui a largura é toda dos botões. */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-3xl">
          {/* No celular a etapa 2 usa a linha inteira para os botões; o que
              falta para ativar vira uma legenda em cima, nunca texto espremido. */}
          {phase === "organizar" && naSelecao > 0 && !sel.expiresInDays && (
            <p className="mb-1.5 text-caption text-text-subtle sm:hidden">Falta escolher o prazo de acesso</p>
          )}
          <div className="flex items-center justify-between gap-3">
            <p
              className={`min-w-0 flex-1 truncate text-body-sm text-text-muted ${
                phase === "organizar" ? "hidden sm:block" : ""
              }`}
            >
              {/* No celular a frase encurta em vez de truncar no meio. */}
              {naSelecao === 0 ? (
                <>
                  <span className="sm:hidden">Nenhum imóvel</span>
                  <span className="hidden sm:inline">Nenhum imóvel na seleção</span>
                </>
              ) : (
                <>
                  <span className="tabular-nums">{naSelecao}</span> {naSelecao === 1 ? "imóvel" : "imóveis"}
                  <span className="hidden sm:inline"> na seleção</span>
                </>
              )}
              {phase === "organizar" && !sel.expiresInDays && naSelecao > 0 && (
                <span className="block text-caption text-text-subtle">Falta escolher o prazo</span>
              )}
            </p>
            {phase === "escolher" ? (
              <Button
                type="button"
                className="shrink-0 whitespace-nowrap"
                disabled={naSelecao === 0}
                onClick={() => setPhase("organizar")}
              >
                Organizar e enviar
              </Button>
            ) : (
              <div className="flex flex-1 items-center gap-2 sm:flex-none">
                <Button
                  type="button"
                  variant="ghost"
                  className="flex-1 whitespace-nowrap sm:flex-none"
                  disabled={naSelecao === 0}
                  onClick={() =>
                    navigate(
                      selectionPreviewPath(
                        dadosDaSelecao?.leadCode ?? leadId ?? "",
                        dadosDaSelecao?.code ?? selectionId ?? "",
                      ),
                    )
                  }
                >
                  Prévia
                </Button>
                <Button
                  type="button"
                  className="flex-1 whitespace-nowrap sm:flex-none"
                  disabled={naSelecao === 0 || !sel.expiresInDays}
                  loading={activate.isPending}
                  onClick={() => activate.mutate()}
                >
                  Ativar e gerar link
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {prefsOpen && (
        <PreferencesModal
          leadId={leadId as string}
          leadName={lead.data.fullName.split(" ")[0]}
          current={pref}
          onClose={() => setPrefsOpen(false)}
          onSaved={() => {
            setFiltersSeeded(false);
            setPrefsDismissed(true);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Etapa 1: escolher imóveis
// ---------------------------------------------------------------------------

interface ChoosePhaseProps {
  q: string;
  onQ: (v: string) => void;
  filters: CandidateFilters;
  onFilters: (f: CandidateFilters) => void;
  fromPreferences: CandidateFilters;
  loading: boolean;
  result: { items: SelectionCandidate[]; total: number } | undefined;
  itemsInSelection: Set<string>;
  onAdd: (c: SelectionCandidate) => void;
  onRemoveByProperty: (propertyId: string) => void;
  busy: boolean;
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function ChoosePhase(props: ChoosePhaseProps) {
  const { q, onQ, filters, onFilters, fromPreferences, loading, result, itemsInSelection, onAdd, onRemoveByProperty, busy } = props;

  // Chips dos filtros ativos: mostra a origem ("do perfil") e remove com um toque.
  const chips = useMemo(() => {
    const list: { key: keyof CandidateFilters; label: string }[] = [];
    if (filters.purpose)
      list.push({ key: "purpose", label: filters.purpose === "venda" ? "Compra" : filters.purpose === "locacao" ? "Locação" : "Temporada" });
    if (filters.city) list.push({ key: "city", label: filters.city });
    if (filters.neighborhood) list.push({ key: "neighborhood", label: filters.neighborhood });
    if (filters.priceMax != null) list.push({ key: "priceMax", label: `Até ${BRL.format(filters.priceMax)}` });
    if (filters.bedroomsMin != null) list.push({ key: "bedroomsMin", label: `${filters.bedroomsMin}+ quartos` });
    return list;
  }, [filters]);

  return (
    <div className="flex flex-col gap-3">
      <SearchField value={q} onChange={onQ} label="Buscar imóvel" placeholder="Buscar por título, bairro ou código" />

      {chips.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {chips.map((chip) => {
            const doPerfil = fromPreferences[chip.key] !== undefined && filters[chip.key] === fromPreferences[chip.key];
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => onFilters({ ...filters, [chip.key]: undefined })}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-accent bg-accent-soft px-3 text-caption font-semibold text-accent"
                title="Remover filtro"
              >
                {chip.label}
                {doPerfil && <span className="font-normal opacity-70">· do perfil</span>}
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => onFilters({})}
            className="inline-flex h-8 shrink-0 items-center rounded-full px-3 text-caption font-semibold text-text-subtle hover:text-text"
          >
            Limpar filtros
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface-sunken" />
          ))}
        </div>
      ) : !result || result.total === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-6 text-center">
          <p className="text-body font-semibold text-text">Nenhum imóvel encontrado</p>
          <p className="mt-1 text-body-sm text-text-muted">
            {chips.length > 0 || q
              ? "Ajuste a busca ou remova filtros. Imóveis fora do perfil também podem ser enviados."
              : "Cadastre imóveis na sua carteira para montar seleções."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {result.items.map((c) => (
            <CandidateCard
              key={c.propertyId}
              candidate={c}
              inSelection={itemsInSelection.has(c.propertyId)}
              busy={busy}
              onAdd={() => onAdd(c)}
              onRemove={() => onRemoveByProperty(c.propertyId)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

const RESPONSE_HISTORY_LABELS: Record<string, string> = {
  visualizado: "visualizou",
  tenho_interesse: "gostou",
  talvez: "ficou em dúvida",
  sem_interesse: "descartou",
  quero_visitar: "pediu visita",
};

function CandidateCard({
  candidate: c,
  inSelection,
  busy,
  onAdd,
  onRemove,
}: {
  candidate: SelectionCandidate;
  inSelection: boolean;
  busy: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const [showReasons, setShowReasons] = useState(false);
  const meta = [c.type, c.neighborhood ?? c.city, detalheCurto(c)].filter(Boolean).join(" · ");
  const historico =
    c.history && c.history.response !== "nao_visualizado"
      ? `Enviado antes: a lead ${RESPONSE_HISTORY_LABELS[c.history.response] ?? "recebeu"}${c.history.responseReason ? ` (${c.history.responseReason})` : ""}`
      : c.history
        ? "Enviado antes, sem resposta"
        : null;

  return (
    <li
      className={`animate-rise overflow-hidden rounded-2xl border bg-surface shadow-sm transition-colors duration-fast ${
        inSelection ? "border-[var(--success)]" : "border-border"
      }`}
    >
      <div className="p-3">
        <div className="flex gap-3">
          <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-surface-sunken">
            {c.coverUrl ? (
              <AuthImage src={c.coverUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-text-subtle">
                <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3 11l9-7 9 7M5 9.5V20a1 1 0 001 1h12a1 1 0 001-1V9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}
            {/* Selo de "já está na seleção" na própria foto: o estado se vê
                de longe, sem depender de ler o rótulo do botão. */}
            {inSelection && (
              <span
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--success)] text-white shadow-sm"
                aria-hidden="true"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            {/* Título em até duas linhas: no celular, truncar em meia palavra
                esconde exatamente o que diferencia um imóvel do outro. */}
            <p className="line-clamp-2 text-body-sm font-semibold text-text">
              {c.title} <span className="font-normal tabular-nums text-text-subtle">#{c.code}</span>
            </p>
            <p className="mt-0.5 line-clamp-1 text-caption text-text-muted">{meta}</p>
            <p className="mt-1 text-body font-bold tabular-nums text-text">{c.priceLabel}</p>
          </div>
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-3">
          {c.compatibility ? (
            <button
              type="button"
              onClick={() => setShowReasons((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-caption font-semibold ${COMPATIBILITY_TONE_CLASS[c.compatibility]}`}
              aria-expanded={showReasons}
            >
              {COMPATIBILITY_LABELS[c.compatibility]}
              <svg className={`h-3 w-3 transition-transform ${showReasons ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : (
            <span />
          )}
          {inSelection ? (
            <Button type="button" variant="ghost" disabled={busy} onClick={onRemove}>
              Remover
            </Button>
          ) : (
            <Button type="button" disabled={busy} onClick={onAdd}>
              Adicionar
            </Button>
          )}
        </div>
      </div>

      {showReasons && (c.compatibilityReasons.length > 0 || c.compatibilityWarnings.length > 0) && (
        <div className="border-t border-border bg-surface-sunken px-4 py-2.5">
          {c.compatibilityReasons.map((r) => (
            <p key={r} className="text-caption text-[var(--success-fg)]">✓ {r}</p>
          ))}
          {c.compatibilityWarnings.map((r) => (
            <p key={r} className="text-caption text-text-muted">• {r}</p>
          ))}
        </div>
      )}

      {historico && (
        <p className="border-t border-border bg-accent-soft px-4 py-2 text-caption font-medium text-accent">
          {historico}
        </p>
      )}
    </li>
  );
}

function detalheCurto(c: SelectionCandidate): string | null {
  const partes: string[] = [];
  if (c.bedrooms != null) partes.push(`${c.bedrooms} q`);
  if (c.bathrooms != null) partes.push(`${c.bathrooms} b`);
  if (c.parkingSpots != null) partes.push(`${c.parkingSpots} v`);
  if (c.area != null) partes.push(`${c.area} m²`);
  return partes.length > 0 ? partes.join(" · ") : null;
}

// ---------------------------------------------------------------------------
// Etapa 2: organizar e enviar
// ---------------------------------------------------------------------------

function OrganizePhase({
  sel,
  onMove,
  onHighlight,
  onNote,
  onRemove,
  onMessage,
  onExpiry,
}: {
  sel: SelectionView;
  onMove: (item: SelectionItemView, direction: -1 | 1) => void;
  onHighlight: (item: SelectionItemView) => void;
  onNote: (item: SelectionItemView, note: string | null) => void;
  onRemove: (item: SelectionItemView) => void;
  onMessage: (message: string | null) => void;
  onExpiry: (days: SelectionExpiryDays) => void;
}) {
  const [message, setMessage] = useState(sel.message ?? "");
  const destaques = sel.items.filter((i) => i.highlight).length;

  if (sel.items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface p-6 text-center">
        <p className="text-body font-semibold text-text">A seleção ainda está vazia</p>
        <p className="mt-1 text-body-sm text-text-muted">Volte à etapa 1 e escolha os imóveis para esta lead.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <h3 className="text-label uppercase tracking-wide text-text-subtle">
          Ordem e destaques
          <span className="ml-2 font-normal normal-case text-text-muted">
            {destaques}/{SELECTION_MAX_HIGHLIGHTS} destaques
          </span>
        </h3>
        <ul className="mt-3 flex flex-col gap-2.5">
          {sel.items.map((item, idx) => (
            <ItemRow
              key={item.id}
              item={item}
              first={idx === 0}
              last={idx === sel.items.length - 1}
              onMove={onMove}
              onHighlight={onHighlight}
              onNote={onNote}
              onRemove={onRemove}
            />
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <label className="text-label uppercase tracking-wide text-text-subtle" htmlFor="sel-mensagem">
          Mensagem para a lead
        </label>
        <textarea
          id="sel-mensagem"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onBlur={() => onMessage(message.trim() || null)}
          rows={3}
          maxLength={1000}
          placeholder="Ex.: Separei estas opções pensando no que conversamos. Me diga o que achou!"
          className="mt-2 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-body text-text placeholder:text-text-subtle focus:border-accent focus:outline-none"
        />
        <p className="mt-1 text-right text-caption tabular-nums text-text-subtle">{message.length}/1000</p>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <h3 className="text-label uppercase tracking-wide text-text-subtle">Prazo de acesso</h3>
        <p className="mt-1 text-body-sm text-text-muted">
          Depois desse prazo o link expira e a lead precisa pedir uma seleção nova.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-surface-sunken p-1">
          {SELECTION_EXPIRY_OPTIONS.map((dias) => (
            <button
              key={dias}
              type="button"
              aria-pressed={sel.expiresInDays === dias}
              onClick={() => onExpiry(dias)}
              className={`rounded-lg px-3 py-2 text-body-sm font-semibold transition-colors duration-fast ${
                sel.expiresInDays === dias ? "bg-surface text-text shadow-sm" : "text-text-subtle"
              }`}
            >
              {dias} dias
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ItemRow({
  item,
  first,
  last,
  onMove,
  onHighlight,
  onNote,
  onRemove,
}: {
  item: SelectionItemView;
  first: boolean;
  last: boolean;
  onMove: (item: SelectionItemView, direction: -1 | 1) => void;
  onHighlight: (item: SelectionItemView) => void;
  onNote: (item: SelectionItemView, note: string | null) => void;
  onRemove: (item: SelectionItemView) => void;
}) {
  const [noteOpen, setNoteOpen] = useState(Boolean(item.brokerNote));
  const [note, setNote] = useState(item.brokerNote ?? "");

  return (
    <li className="rounded-xl border border-border bg-surface p-3">
      {/* Identidade em cima, controles embaixo: no celular os dois juntos
          esmagavam o título até sobrar meia palavra. */}
      <div className="flex gap-3">
        <div className="h-14 w-16 shrink-0 overflow-hidden rounded-lg bg-surface-sunken">
          {item.coverUrl && <AuthImage src={item.coverUrl} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-body-sm font-semibold text-text">{item.propertyTitle}</p>
          <p className="truncate text-caption text-text-muted">
            {[item.neighborhood ?? item.city, item.priceLabel].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2">
        <div className="flex items-center gap-1">
          <ArrowButton label="Subir" disabled={first} onClick={() => onMove(item, -1)} direction="up" />
          <ArrowButton label="Descer" disabled={last} onClick={() => onMove(item, 1)} direction="down" />
          {/* No celular a fileira é dos controles; a compatibilidade já foi
              vista na etapa 1 e quebrada em duas linhas só virava ruído. */}
          {item.compatibility && (
            <span
              className={`ml-1 hidden whitespace-nowrap rounded-full px-2 py-0.5 text-caption font-semibold sm:inline ${COMPATIBILITY_TONE_CLASS[item.compatibility]}`}
            >
              {COMPATIBILITY_LABELS[item.compatibility]}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={item.highlight ? "Remover destaque" : "Destacar"}
            aria-pressed={item.highlight}
            onClick={() => onHighlight(item)}
            className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-fast ${
              item.highlight ? "bg-accent-soft text-accent" : "text-text-subtle hover:bg-surface-sunken"
            }`}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill={item.highlight ? "currentColor" : "none"} aria-hidden="true">
              <path d="M12 3l2.7 5.6 6.3.8-4.6 4.3 1.2 6.1L12 16.9 6.4 19.8l1.2-6.1L3 9.4l6.3-.8L12 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Observação para a lead"
            aria-pressed={noteOpen}
            onClick={() => setNoteOpen((v) => !v)}
            className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-fast ${
              item.brokerNote ? "bg-accent-soft text-accent" : "text-text-subtle hover:bg-surface-sunken"
            }`}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v9a2 2 0 01-2 2H9l-5 4V6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Remover da seleção"
            onClick={() => onRemove(item)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-text-subtle transition-colors duration-fast hover:bg-[var(--danger-soft)] hover:text-[var(--danger-fg)]"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {noteOpen && (
        <div className="mt-2.5 border-t border-border pt-2.5">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => onNote(item, note.trim() || null)}
            rows={2}
            maxLength={500}
            placeholder='Ex.: "Tem a varanda gourmet que você pediu"'
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-body-sm text-text placeholder:text-text-subtle focus:border-accent focus:outline-none"
            aria-label={`Observação sobre ${item.propertyTitle}`}
          />
        </div>
      )}
    </li>
  );
}

function ArrowButton({
  label,
  disabled,
  onClick,
  direction,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  direction: "up" | "down";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-md text-text-subtle transition-colors duration-fast hover:bg-surface-sunken disabled:opacity-30"
    >
      <svg className={`h-4 w-4 ${direction === "down" ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 15l6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Seleção ativa/encerrada: link, envio e acompanhamento
// ---------------------------------------------------------------------------

const dataLonga = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long" });

function ActiveView({
  sel,
  leadName,
  leadWhatsapp,
  erro,
  onRevoke,
  confirmRevoke,
  revokePending,
  onConfirmRevoke,
  onCancelRevoke,
  onBack,
}: {
  sel: SelectionView;
  leadName: string;
  leadWhatsapp: string;
  erro: string | null;
  onRevoke: () => void;
  confirmRevoke: boolean;
  revokePending: boolean;
  onConfirmRevoke: () => void;
  onCancelRevoke: () => void;
  onBack: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const url = selectionPublicUrl(sel.publicToken);
  const primeiroNome = leadName.split(" ")[0];
  const [waMessage, setWaMessage] = useState(
    `Olá, ${primeiroNome}! Preparei uma seleção de imóveis com base no que conversamos. Veja as opções, marque as que gostou e me diga o que achou: ${url}`,
  );

  const copiar = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {erro && <Banner variant="danger">{erro}</Banner>}

      <section className="animate-rise rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-h2 text-text">Seleção para {primeiroNome}</h2>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-caption font-semibold ${SELECTION_STATUS_TONE_CLASS[sel.status]}`}>
            {SELECTION_STATUS_LABELS[sel.status]}
          </span>
        </div>
        <p className="mt-1 text-body-sm text-text-muted">
          {sel.items.length === 1 ? "1 imóvel" : `${sel.items.length} imóveis`}
          {sel.expiresAt && sel.status === "ativa" && ` · válida até ${dataLonga.format(new Date(sel.expiresAt))}`}
          {sel.viewCount > 0 && ` · ${sel.viewCount} ${sel.viewCount === 1 ? "visualização" : "visualizações"}`}
        </p>

        {sel.status === "ativa" && (
          <>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-surface-sunken px-3 py-2.5">
              <span className="min-w-0 flex-1 truncate text-body-sm tabular-nums text-text">{url}</span>
              {/* Fundo branco de propósito: o ghost é transparente e, em cima
                  da faixa recuada do link, o botão sumia dentro dela. */}
              <Button
                type="button"
                variant="ghost"
                onClick={copiar}
                className="shrink-0 !bg-surface !px-4 hover:!bg-surface-hover"
              >
                {copied ? "Copiado!" : "Copiar"}
              </Button>
            </div>

            <label className="mt-4 block text-label text-text" htmlFor="wa-mensagem">
              Mensagem do WhatsApp
            </label>
            <textarea
              id="wa-mensagem"
              value={waMessage}
              onChange={(e) => setWaMessage(e.target.value)}
              rows={4}
              className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-body-sm text-text focus:border-accent focus:outline-none"
            />
            <a
              href={`https://wa.me/${whatsappDigits(leadWhatsapp)}?text=${encodeURIComponent(waMessage)}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--success-fg)] font-semibold text-white transition-transform duration-fast hover:-translate-y-0.5 active:translate-y-0"
            >
              Enviar pelo WhatsApp
            </a>
          </>
        )}

        {sel.status !== "ativa" && (
          <p className="mt-3 text-body-sm text-text-muted">
            {sel.status === "expirada"
              ? "O prazo desta seleção terminou. Crie uma nova seleção para reenviar opções atualizadas."
              : sel.status === "revogada"
                ? "Você encerrou o acesso a esta seleção. O histórico continua aqui."
                : "Seleção arquivada."}
          </p>
        )}
      </section>

      {/* Respostas da lead, imóvel a imóvel. */}
      <section className="animate-rise rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h3 className="text-label uppercase tracking-wide text-text-subtle">Imóveis e respostas</h3>
        <ul className="mt-3 flex flex-col divide-y divide-border">
          {sel.items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-2.5">
              <div className="h-12 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-sunken">
                {item.coverUrl && <AuthImage src={item.coverUrl} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-sm font-semibold text-text">
                  {item.highlight && <span className="mr-1 text-accent">★</span>}
                  {item.propertyTitle}
                </p>
                <p className="truncate text-caption text-text-muted">{item.priceLabel}</p>
              </div>
              <ResponseBadge item={item} />
            </li>
          ))}
        </ul>
      </section>

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={onBack}>
          Voltar à ficha
        </Button>
        {sel.status === "ativa" && (
          <button type="button" onClick={onRevoke} className="text-body-sm font-semibold text-[var(--danger-fg)]">
            Encerrar acesso
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmRevoke}
        title="Encerrar acesso"
        description="A lead deixa de ver os imóveis imediatamente. O histórico das respostas continua na ficha."
        confirmLabel={revokePending ? "Encerrando..." : "Encerrar acesso"}
        danger
        loading={revokePending}
        onConfirm={onConfirmRevoke}
        onCancel={onCancelRevoke}
      />
    </div>
  );
}

const RESPONSE_BADGES: Record<string, { label: string; className: string }> = {
  nao_visualizado: { label: "Sem resposta", className: "bg-surface-sunken text-text-subtle" },
  visualizado: { label: "Visualizou", className: "bg-surface-sunken text-text" },
  tenho_interesse: { label: "Gostou", className: "bg-[var(--success-soft)] text-[var(--success-fg)]" },
  talvez: { label: "Em dúvida", className: "bg-accent-soft text-accent" },
  sem_interesse: { label: "Não combina", className: "bg-[var(--danger-soft)] text-[var(--danger-fg)]" },
  quero_visitar: { label: "Quer visitar", className: "bg-[var(--success-soft)] text-[var(--success-fg)]" },
};

function ResponseBadge({ item }: { item: SelectionItemView }) {
  const badge = RESPONSE_BADGES[item.response] ?? RESPONSE_BADGES.nao_visualizado;
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-caption font-semibold ${badge.className}`}>
      {badge.label}
    </span>
  );
}

function BuilderSkeleton() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4" role="status" aria-label="Carregando seleção">
      <div className="h-24 animate-pulse rounded-2xl bg-surface-sunken" />
      <div className="h-12 animate-pulse rounded-xl bg-surface-sunken" />
      <div className="h-28 animate-pulse rounded-2xl bg-surface-sunken" />
      <div className="h-28 animate-pulse rounded-2xl bg-surface-sunken" />
    </div>
  );
}
