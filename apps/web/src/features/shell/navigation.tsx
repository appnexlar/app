import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  Calculator,
  FileText,
  Globe,
  House,
  LayoutGrid,
  MapPin,
  SquareKanban,
  User,
  UserCheck,
  Users,
} from "lucide-react";

export interface NavItem {
  label: string;
  path: string;
  /** Componente do ícone. Quem renderiza escolhe o tamanho pelo papel (ICON). */
  icon: LucideIcon;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/**
 * Menu da área interna, agrupado por contexto e na ordem definida.
 * Perfil entra no grupo Conta; "Sair" é ação do menu de conta, não item de rota.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Visão geral",
    items: [
      {
        label: "Dashboard",
        path: "/dashboard",
        icon: LayoutGrid,
      },
    ],
  },
  {
    title: "Relacionamento comercial",
    items: [
      {
        label: "Leads",
        path: "/leads",
        icon: Users,
      },
      {
        label: "Funil",
        path: "/funil",
        icon: SquareKanban,
      },
      {
        label: "Clientes",
        path: "/clientes",
        icon: UserCheck,
      },
      {
        label: "Agenda",
        path: "/agenda",
        icon: CalendarDays,
      },
    ],
  },
  {
    title: "Operação imobiliária",
    items: [
      {
        label: "Visitas",
        path: "/visitas",
        icon: MapPin,
      },
      {
        label: "Imóveis",
        path: "/imoveis",
        icon: House,
      },
      {
        label: "Documentos",
        path: "/documentos",
        icon: FileText,
      },
      {
        label: "Simulações",
        path: "/simulacoes",
        icon: Calculator,
      },
    ],
  },
  {
    title: "Conta",
    items: [
      {
        label: "Minha Página",
        path: "/minha-pagina",
        icon: Globe,
      },
      {
        label: "Perfil e configurações",
        path: "/perfil",
        icon: User,
      },
    ],
  },
];

/** Todos os itens em ordem, para achar o título da página atual. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export function pageTitleFor(pathname: string): string {
  const match = NAV_ITEMS.find((i) => pathname.startsWith(i.path));
  return match?.label ?? "Nextlar";
}

/** A Home do app: começo de todo caminho de pão e destino do "Voltar". */
export const HOME_PATH = "/dashboard";

export interface Crumb {
  label: string;
  /** Ausente no último item (página atual). */
  to?: string;
}

/** Rótulos de subrotas conhecidas (caminho de pão). */
const SUBROUTE_LABELS: Record<string, string> = {
  novo: "Novo imóvel",
  importar: "Importar por link",
  editar: "Editar",
  "imoveis-enviados": "Imóveis enviados",
  imoveis: "Imóveis da página",
  selecoes: "Seleções",
  previa: "Prévia",
  financiamento: "Financiamento",
};

/** Segmentos que só existem para compor o caminho: não abrem tela sozinhos. */
const SEM_TELA_PROPRIA = new Set(["selecoes", "financiamento"]);

/**
 * Caminho de pão da página atual. Ex.: /imoveis/:id/editar →
 * Imóveis > Detalhes > Editar. UUIDs viram "Detalhes".
 */
export function breadcrumbsFor(pathname: string): Crumb[] {
  const section = NAV_ITEMS.find((i) => pathname.startsWith(i.path));
  if (!section) return [{ label: "Nextlar" }];

  // A Home abre o caminho de toda página, menos dela mesma. Sem ela, uma
  // página de seção teria um único item, que só repetiria o título logo
  // abaixo; com ela, a mesma tela ganha contexto e um atalho de volta.
  const crumbs: Crumb[] = [];
  if (section.path !== HOME_PATH) crumbs.push({ label: "Início", to: HOME_PATH });
  crumbs.push({ label: section.label, to: section.path });
  const rest = pathname.slice(section.path.length).split("/").filter(Boolean);

  for (const segment of rest) {
    // Identificador na URL: uuid (link antigo) ou o código curto do registro.
    const isId = /^[0-9a-f-]{36}$/i.test(segment) || /^\d+$/.test(segment);
    crumbs.push({
      label: isId ? "Detalhes" : SUBROUTE_LABELS[segment] ?? segment,
      to: undefined,
    });
  }

  // Itens intermediários continuam clicáveis (ex.: Detalhes em .../editar),
  // menos os que não têm tela própria: link para lugar nenhum é pior que texto.
  // Os intermediários continuam clicáveis (ex.: Detalhes em .../editar),
  // menos os que não têm tela própria: link para lugar nenhum é pior que
  // texto. O deslocamento pula a Home e a seção, que já têm destino.
  const inicioDosSegmentos = crumbs.length - rest.length;
  let acc = section.path;
  for (let i = 0; i < rest.length - 1; i++) {
    acc += `/${rest[i]}`;
    if (!SEM_TELA_PROPRIA.has(rest[i])) crumbs[inicioDosSegmentos + i].to = acc;
  }
  return crumbs;
}
