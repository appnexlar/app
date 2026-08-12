/**
 * Planos do Nextlar exibidos no cadastro.
 *
 * VALORES PROVISÓRIOS: o Rafaelle vai definir os dois valores finais.
 * Troque apenas `priceMonthly`/`priceTotal` aqui; a interface formata sozinha.
 * A cobrança real (gateway de pagamento) entra numa fatia futura; nada é
 * cobrado hoje.
 */

export type PlanId = "mensal" | "anual";

export interface Plan {
  id: PlanId;
  name: string;
  /** Valor mensal equivalente, em reais. */
  priceMonthly: number;
  /** Valor total cobrado por ciclo (mês ou ano), em reais. */
  priceTotal: number;
  cycleLabel: string;
  highlight?: string;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: "mensal",
    name: "Mensal",
    priceMonthly: 49.9,
    priceTotal: 49.9,
    cycleLabel: "por mês",
    features: [
      "Leads e funil ilimitados",
      "Tarefas e follow-up",
      "Documentos com checklist",
      "Dashboard de métricas",
    ],
  },
  {
    id: "anual",
    name: "Anual",
    priceMonthly: 39.9,
    priceTotal: 478.8,
    cycleLabel: "por mês, cobrado anualmente",
    highlight: "Economize 20%",
    features: [
      "Tudo do plano Mensal",
      "2 meses grátis no ano",
      "Prioridade nas novidades",
    ],
  },
];

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(value: number): string {
  return brl.format(value);
}
