import type { ReactNode } from "react";

export interface NavItem {
  label: string;
  path: string;
  /** Conteúdo interno de um <svg viewBox="0 0 24 24">. */
  icon: ReactNode;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

const s = { stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };

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
        icon: (
          <>
            <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" {...s} />
            <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" {...s} />
            <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" {...s} />
            <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" {...s} />
          </>
        ),
      },
    ],
  },
  {
    title: "Relacionamento comercial",
    items: [
      {
        label: "Leads",
        path: "/leads",
        icon: (
          <>
            <circle cx="9" cy="8" r="3.2" {...s} />
            <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" {...s} />
            <path d="M16 4.5a3.2 3.2 0 010 6.4M18 19c0-2.4-1-4.2-2.6-5" {...s} />
          </>
        ),
      },
      {
        label: "Funil",
        path: "/funil",
        icon: (
          <>
            <rect x="3.5" y="4" width="4.5" height="16" rx="1.2" {...s} />
            <rect x="9.75" y="4" width="4.5" height="11" rx="1.2" {...s} />
            <rect x="16" y="4" width="4.5" height="7" rx="1.2" {...s} />
          </>
        ),
      },
      {
        label: "Clientes",
        path: "/clientes",
        icon: (
          <>
            <circle cx="12" cy="8" r="3.4" {...s} />
            <path d="M5.5 20c0-3.4 2.9-6 6.5-6s6.5 2.6 6.5 6" {...s} />
            <path d="M17.5 6.5l1.3 1.3 2.2-2.4" {...s} />
          </>
        ),
      },
      {
        label: "Agenda",
        path: "/agenda",
        icon: (
          <>
            <rect x="3.5" y="4.5" width="17" height="16" rx="2.2" {...s} />
            <path d="M3.5 9h17M8 3v3M16 3v3" {...s} />
            <path d="M8 13h3M8 16.5h6" {...s} />
          </>
        ),
      },
    ],
  },
  {
    title: "Operação imobiliária",
    items: [
      {
        label: "Visitas",
        path: "/visitas",
        icon: (
          <>
            <path d="M12 21s-6.5-5.2-6.5-10a6.5 6.5 0 0113 0c0 4.8-6.5 10-6.5 10z" {...s} />
            <circle cx="12" cy="11" r="2.3" {...s} />
          </>
        ),
      },
      {
        label: "Imóveis",
        path: "/imoveis",
        icon: (
          <>
            <path d="M4 10.5L12 4l8 6.5" {...s} />
            <path d="M5.5 9.5V20h13V9.5" {...s} />
            <path d="M10 20v-5h4v5" {...s} />
          </>
        ),
      },
      {
        label: "Documentos",
        path: "/documentos",
        icon: (
          <>
            <path d="M14 3.5H7A2 2 0 005 5.5v13a2 2 0 002 2h10a2 2 0 002-2V8.5z" {...s} />
            <path d="M14 3.5v5h5M8.5 13h7M8.5 16.5h7" {...s} />
          </>
        ),
      },
      {
        label: "Simulações",
        path: "/simulacoes",
        icon: (
          <>
            <rect x="5" y="3.5" width="14" height="17" rx="2" {...s} />
            <path d="M8.5 7.5h7" {...s} />
            <path d="M8.5 11.5h2M13.5 11.5h2M8.5 15h2M13.5 15h2" {...s} />
          </>
        ),
      },
    ],
  },
  {
    title: "Conta",
    items: [
      {
        label: "Minha Página",
        path: "/minha-pagina",
        icon: (
          <>
            <circle cx="12" cy="12" r="8.5" {...s} />
            <path d="M3.5 12h17M12 3.5c2.5 2.3 3.8 5.2 3.8 8.5S14.5 18.2 12 20.5c-2.5-2.3-3.8-5.2-3.8-8.5S9.5 5.8 12 3.5z" {...s} />
          </>
        ),
      },
      {
        label: "Perfil e configurações",
        path: "/perfil",
        icon: (
          <>
            <circle cx="12" cy="8" r="3.4" {...s} />
            <path d="M5.5 20c0-3.4 2.9-6 6.5-6s6.5 2.6 6.5 6" {...s} />
          </>
        ),
      },
    ],
  },
];

/** Todos os itens em ordem, para achar o título da página atual. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export function pageTitleFor(pathname: string): string {
  const match = NAV_ITEMS.find((i) => pathname.startsWith(i.path));
  return match?.label ?? "Nexlar";
}

export interface Crumb {
  label: string;
  /** Ausente no último item (página atual). */
  to?: string;
}

/** Rótulos de subrotas conhecidas (caminho de pão). */
const SUBROUTE_LABELS: Record<string, string> = {
  novo: "Novo imóvel",
  editar: "Editar",
  "imoveis-enviados": "Imóveis enviados",
  imoveis: "Imóveis da página",
  selecoes: "Seleções",
  previa: "Prévia",
};

/** Segmentos que só existem para compor o caminho: não abrem tela sozinhos. */
const SEM_TELA_PROPRIA = new Set(["selecoes"]);

/**
 * Caminho de pão da página atual. Ex.: /imoveis/:id/editar →
 * Imóveis > Detalhes > Editar. UUIDs viram "Detalhes".
 */
export function breadcrumbsFor(pathname: string): Crumb[] {
  const section = NAV_ITEMS.find((i) => pathname.startsWith(i.path));
  if (!section) return [{ label: "Nexlar" }];

  const crumbs: Crumb[] = [{ label: section.label, to: section.path }];
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
  let acc = section.path;
  for (let i = 1; i < crumbs.length - 1; i++) {
    acc += `/${rest[i - 1]}`;
    if (!SEM_TELA_PROPRIA.has(rest[i - 1])) crumbs[i].to = acc;
  }
  return crumbs;
}
