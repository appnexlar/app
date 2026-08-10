/**
 * RBAC do Nexlar Admin: papéis concedem permissões, e quem é verificado nas
 * rotas é SEMPRE a permissão, nunca o nome do papel (docs/10, §5.4).
 *
 * Este arquivo é a fonte única dos dois lados: a API monta os guards a partir
 * dele e o front esconde o que a pessoa não pode fazer. Esconder é cortesia;
 * quem nega de verdade é o backend.
 */

export const ADMIN_ROLES = ["super_admin", "admin", "suporte", "financeiro"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/** Rótulos para telas. A chave técnica nunca aparece para gente. */
export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: "Super admin",
  admin: "Administração",
  suporte: "Suporte",
  financeiro: "Financeiro",
};

export const ADMIN_PERMISSIONS = [
  "admin.users.view",
  "admin.users.manage",
  "admin.organizations.view",
  "admin.organizations.manage",
  "admin.audit.view",
  "admin.security.view",
  "admin.billing.view",
  "admin.billing.manage",
  // Gestão dos próprios administradores: só o super_admin.
  "admin.admins.view",
  "admin.admins.manage",
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

/**
 * O que cada papel pode. Papel novo ou permissão nova entram aqui e valem
 * nos dois lados no mesmo commit.
 *
 * suporte e financeiro já nascem com o desenho final da épica, mesmo que
 * nem toda tela deles exista ainda: o que não tem permissão hoje continua
 * negado, então preparar o papel não abre porta nenhuma.
 */
export const ROLE_PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
  super_admin: ADMIN_PERMISSIONS,
  admin: [
    "admin.users.view",
    "admin.users.manage",
    "admin.organizations.view",
    "admin.organizations.manage",
    "admin.audit.view",
    "admin.admins.view",
  ],
  suporte: ["admin.users.view", "admin.organizations.view"],
  financeiro: ["admin.billing.view", "admin.billing.manage"],
};

export function permissionsForRole(role: AdminRole): readonly AdminPermission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function roleHasPermission(role: AdminRole, permission: AdminPermission): boolean {
  return permissionsForRole(role).includes(permission);
}
