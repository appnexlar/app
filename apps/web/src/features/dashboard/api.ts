import type { DashboardSummary } from "@nexlar/shared";
import { http } from "../../lib/http";

/**
 * Resumo do Dashboard. Quem calcula é a API, a partir dos dados reais do
 * corretor: leads, tarefas da agenda, visitas, documentos e conversões. A tela
 * não faz conta de negócio, só apresenta o que recebe.
 */
export function fetchDashboard(): Promise<DashboardSummary> {
  return http.get<DashboardSummary>("/dashboard");
}
