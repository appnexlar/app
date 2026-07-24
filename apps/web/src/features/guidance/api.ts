import type {
  GuidanceChecklist,
  GuidanceState,
  HelpContent,
  OnboardingStatus,
  SaveDiagnosisDto,
} from "@nexlar/shared";
import { http } from "../../lib/http";

/**
 * Cliente da experiência guiada (Jornada 2). O front nunca decide elegibilidade:
 * pede o estado pronto ao servidor e desenha. Todas as rotas são isoladas por
 * corretor pelo token, então não há nada a passar além do corpo das ações.
 */

export function fetchGuidanceState(): Promise<GuidanceState> {
  return http.get<GuidanceState>("/guidance");
}

export function fetchChecklist(): Promise<GuidanceChecklist> {
  return http.get<GuidanceChecklist>("/guidance/checklist");
}

export function markFirstAccess(): Promise<void> {
  return http.post<void>("/guidance/first-access");
}

export function saveDiagnosis(dto: SaveDiagnosisDto): Promise<OnboardingStatus> {
  return http.post<OnboardingStatus>("/guidance/onboarding", dto);
}

export function dismissGuidance(key: string): Promise<void> {
  return http.post<void>(`/guidance/${key}/dismiss`);
}

export function skipGuidance(key: string): Promise<void> {
  return http.post<void>(`/guidance/${key}/skip`);
}

export function reopenGuidance(key: string): Promise<void> {
  return http.post<void>(`/guidance/${key}/reopen`);
}

export function fetchHelp(route: string): Promise<HelpContent | null> {
  return http.get<HelpContent | null>(`/guidance/help?route=${encodeURIComponent(route)}`);
}
