import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GuidanceRecommendation, SaveDiagnosisDto } from "@nexlar/shared";
import {
  dismissGuidance,
  fetchGuidanceState,
  markFirstAccess,
  reopenGuidance,
  saveDiagnosis,
  skipGuidance,
} from "./api";

const CHAVE = ["guidance"] as const;

/** Estado da experiência guiada. Fica levemente "fresco" e revalida sozinho. */
export function useGuidance() {
  return useQuery({
    queryKey: CHAVE,
    queryFn: fetchGuidanceState,
    // O estado depende de ações em outras telas (criar lead, imóvel...). Um
    // tempo curto de frescor evita recomputar a cada foco, sem ficar velho.
    staleTime: 30_000,
  });
}

/**
 * A orientação mais relevante para a tela atual (§4, §13): a experiência guiada
 * não vive só no dashboard, aparece dentro do módulo relacionado. Filtra a
 * lista já ranqueada pelo servidor por rota de ação, e devolve a primeira que
 * casa, preservando a ordem de prioridade.
 */
export function useModuleGuidance(prefixos: string[]): GuidanceRecommendation | null {
  const { data } = useGuidance();
  if (!data) return null;
  const candidatas = [data.primary, ...data.secondary].filter(
    (r): r is GuidanceRecommendation => r !== null,
  );
  return (
    candidatas.find((r) => r.actionUrl && prefixos.some((p) => r.actionUrl!.startsWith(p))) ?? null
  );
}

/**
 * Ações que mudam o estado guiado. Toda mutação invalida a chave, então a
 * recomendação principal e o checklist se atualizam sozinhos depois de agir.
 */
export function useGuidanceActions() {
  const client = useQueryClient();
  const invalidar = () => client.invalidateQueries({ queryKey: CHAVE });

  const dismiss = useMutation({ mutationFn: dismissGuidance, onSuccess: invalidar });
  const skip = useMutation({ mutationFn: skipGuidance, onSuccess: invalidar });
  const reopen = useMutation({ mutationFn: reopenGuidance, onSuccess: invalidar });
  const primeiroAcesso = useMutation({ mutationFn: markFirstAccess, onSuccess: invalidar });
  const diagnostico = useMutation({
    mutationFn: (dto: SaveDiagnosisDto) => saveDiagnosis(dto),
    onSuccess: invalidar,
  });

  return { dismiss, skip, reopen, primeiroAcesso, diagnostico };
}
