import { NAV_ITEMS } from "../shell/navigation";
import { ModulePlaceholder, type ModuleContent } from "./ModulePlaceholder";

function iconFor(path: string) {
  return NAV_ITEMS.find((i) => i.path === path)?.icon ?? null;
}

const CONTENT: Record<string, ModuleContent> = {
  "/funil": {
    icon: iconFor("/funil"),
    description: "A visão por etapas dos seus leads, em quadro arrastável.",
    emptyTitle: "Seu funil aparece aqui",
    emptyDescription:
      "Acompanhe cada lead pelas etapas, do primeiro contato ao fechamento, movendo entre as colunas.",
    actionLabel: "Cadastrar primeiro lead",
  },
  "/agenda": {
    icon: iconFor("/agenda"),
    description: "Suas tarefas e follow-ups, para nenhum lead esfriar.",
    emptyTitle: "Nenhuma tarefa agendada",
    emptyDescription:
      "Organize seus follow-ups e compromissos. Cada tarefa vira a próxima ação de um lead.",
    actionLabel: "Criar primeira tarefa",
  },
  "/visitas": {
    icon: iconFor("/visitas"),
    description: "As visitas aos imóveis e o retorno do cliente em cada uma.",
    emptyTitle: "Nenhuma visita registrada",
    emptyDescription:
      "Agende e registre as visitas aos imóveis, com o feedback do cliente após cada uma.",
    actionLabel: "Agendar visita",
  },
  "/documentos": {
    icon: iconFor("/documentos"),
    description: "A documentação de cada cliente, organizada por etapa.",
    emptyTitle: "Nenhum documento ainda",
    emptyDescription:
      "Reúna a documentação de cada cliente, com checklist do que já foi entregue e do que falta.",
    actionLabel: "Ver documentos",
  },
  "/simulacoes": {
    icon: iconFor("/simulacoes"),
    description: "O registro das simulações de financiamento dos seus clientes.",
    emptyTitle: "Nenhuma simulação registrada",
    emptyDescription:
      "Registre as simulações de financiamento, com atalho para o simulador da Caixa.",
    actionLabel: "Registrar simulação",
  },
};

export function FunnelPage() {
  return <ModulePlaceholder content={CONTENT["/funil"]} />;
}
export function AgendaPage() {
  return <ModulePlaceholder content={CONTENT["/agenda"]} />;
}
export function VisitsPage() {
  return <ModulePlaceholder content={CONTENT["/visitas"]} />;
}
export function DocumentsPage() {
  return <ModulePlaceholder content={CONTENT["/documentos"]} />;
}
export function SimulationsPage() {
  return <ModulePlaceholder content={CONTENT["/simulacoes"]} />;
}
