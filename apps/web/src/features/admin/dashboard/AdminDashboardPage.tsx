import { useAdminAuth } from "../AdminAuthContext";

/**
 * Casca do Dashboard administrativo. Os indicadores de verdade (usuários,
 * organizações, uso, alertas) chegam na Fase 2 da épica; esta página existe
 * para a fundação já ter um destino navegável e testável.
 */
export function AdminDashboardPage() {
  const { admin } = useAdminAuth();

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-8">
        <h1 className="text-h1 text-text">Dashboard</h1>
        <p className="mt-2 text-body text-text-muted">
          O que está acontecendo na plataforma agora.
        </p>
      </header>

      <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
        <p className="text-body text-text">
          Os indicadores da plataforma chegam na próxima fase.
        </p>
        <p className="mt-2 text-caption text-text-subtle">
          Você está no Nexlar Admin como {admin?.email}. A fundação (acesso,
          papéis e permissões) está no ar; usuários, organizações e alertas
          entram nas fases seguintes da épica.
        </p>
      </div>
    </div>
  );
}
