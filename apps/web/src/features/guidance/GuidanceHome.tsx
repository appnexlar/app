import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GuidanceRecommendation, SaveDiagnosisDto } from "@nexlar/shared";
import { Banner } from "../../components/ui/Banner";
import { useShell } from "../shell/ShellContext";
import { useGuidance, useGuidanceActions } from "./useGuidance";
import { GuidanceCard } from "./GuidanceCard";
import { ProgressChecklist } from "./ProgressChecklist";
import { FirstAccessWelcome } from "./FirstAccessWelcome";
import { InitialDiagnosis } from "./InitialDiagnosis";

type Fluxo = null | "recepcao" | "diagnostico" | "fechado";

/**
 * Camada de experiência guiada da Home. É o "sistema nervoso" da Jornada 2 na
 * interface: recebe do servidor a próxima orientação e o progresso, e desenha,
 * sem decidir regra nenhuma por conta própria (§23).
 *
 * Trata os quatro estados (carregando, vazio, erro, sucesso). Vazio de verdade
 * (nada pendente e checklist completo) é o corretor tocando a operação sozinho:
 * a camada some, para não virar um tutorial permanente.
 */
export function GuidanceHome() {
  const { data, isLoading, isError, refetch } = useGuidance();
  const { dismiss, primeiroAcesso, diagnostico } = useGuidanceActions();
  const { openNewLead } = useShell();
  const navigate = useNavigate();

  const [fluxo, setFluxo] = useState<Fluxo>(null);

  // Abre a recepção só no primeiro acesso, e uma vez. Depois disso o servidor
  // devolve firstAccessSeen = true e o fluxo fica fechado.
  useEffect(() => {
    if (fluxo !== null || !data) return;
    setFluxo(data.onboarding.firstAccessSeen ? "fechado" : "recepcao");
  }, [data, fluxo]);

  function agir(rec: GuidanceRecommendation) {
    if (rec.actionType === "abrir-novo-lead") {
      openNewLead();
      return;
    }
    if (rec.actionUrl) navigate(rec.actionUrl);
  }

  function comecar() {
    primeiroAcesso.mutate();
    setFluxo("diagnostico");
  }

  function explorar() {
    primeiroAcesso.mutate();
    setFluxo("fechado");
  }

  function salvarDiagnostico(dto: SaveDiagnosisDto) {
    diagnostico.mutate(dto);
    setFluxo("fechado");
  }

  function pularDiagnostico() {
    diagnostico.mutate({ skipped: true });
    setFluxo("fechado");
  }

  return (
    <>
      <FirstAccessWelcome
        open={fluxo === "recepcao"}
        onStart={comecar}
        onExplore={explorar}
        busy={primeiroAcesso.isPending}
      />
      <InitialDiagnosis
        open={fluxo === "diagnostico"}
        onSave={salvarDiagnostico}
        onSkip={pularDiagnostico}
        busy={diagnostico.isPending}
      />

      {isLoading && <Esqueleto />}

      {isError && (
        <div className="mt-4 flex flex-col gap-4">
          <Banner variant="danger">Não foi possível carregar suas orientações agora.</Banner>
          <button
            type="button"
            onClick={() => refetch()}
            className="self-start text-body-sm font-semibold text-accent hover:underline"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {data && <Camada
        primary={data.primary}
        secondary={data.secondary}
        // "Completo" para efeito de esconder ignora o que ainda não é
        // detectável (a agenda): senão a camada nunca sumiria para quem já fez
        // tudo o que dá para medir.
        checklistCompleto={data.checklist.items.every((i) => i.done || i.indisponivel)}
        onAction={agir}
        onDismiss={(rec) => dismiss.mutate(rec.key)}
        dismissBusy={dismiss.isPending}
        checklist={data.checklist}
      />}
    </>
  );
}

function Camada({
  primary,
  secondary,
  checklist,
  checklistCompleto,
  onAction,
  onDismiss,
  dismissBusy,
}: {
  primary: GuidanceRecommendation | null;
  secondary: GuidanceRecommendation[];
  checklist: import("@nexlar/shared").GuidanceChecklist;
  checklistCompleto: boolean;
  onAction: (rec: GuidanceRecommendation) => void;
  onDismiss: (rec: GuidanceRecommendation) => void;
  dismissBusy: boolean;
}) {
  // Nada a orientar e checklist completo: o corretor toca sozinho. Some.
  if (!primary && checklistCompleto) return null;

  return (
    <div className="mt-4 flex flex-col gap-4">
      {primary && (
        <GuidanceCard rec={primary} onAction={onAction} onDismiss={onDismiss} busy={dismissBusy} />
      )}

      {secondary.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
          <h3 className="text-caption font-semibold uppercase tracking-wide text-text-subtle">
            Outras ações
          </h3>
          <div className="mt-4 flex flex-col divide-y divide-border">
            {secondary.map((rec) => (
              <button
                key={rec.key}
                type="button"
                onClick={() => onAction(rec)}
                className="group flex items-center gap-4 py-2 text-left transition-colors hover:text-accent focus-visible:text-accent"
              >
                <span className="min-w-0 flex-1 text-body-sm font-medium text-text group-hover:text-accent">
                  {rec.title}
                </span>
                <svg className="h-4 w-4 flex-none text-text-subtle" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}

      {!checklistCompleto && <ProgressChecklist checklist={checklist} />}
    </div>
  );
}

function Esqueleto() {
  return (
    <div className="mt-4 flex animate-pulse flex-col gap-4" aria-hidden="true">
      <div className="h-28 rounded-2xl bg-surface-sunken" />
      <div className="h-20 rounded-2xl bg-surface-sunken" />
    </div>
  );
}
