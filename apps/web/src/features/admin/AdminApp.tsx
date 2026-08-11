import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Spinner } from "../../components/ui/Spinner";
import { AdminAuthProvider, useAdminAuth } from "./AdminAuthContext";
import { AdminLoginPage } from "./AdminLoginPage";
import { AdminLayout } from "./shell/AdminLayout";
import { AdminDashboardPage } from "./dashboard/AdminDashboardPage";
import { AdminAdminsPage } from "./admins/AdminAdminsPage";
import { AdminUsersPage } from "./users/AdminUsersPage";
import { AdminUserProfilePage } from "./users/AdminUserProfilePage";
import { AdminAuditPage } from "./audit/AdminAuditPage";

/**
 * Universo /admin, carregado por lazy loading: o corretor não baixa um byte
 * disto. A proteção de verdade é do backend; este guard só evita mostrar
 * telas vazias a quem não tem sessão administrativa.
 */
function AdminGuard() {
  const { admin, booting } = useAdminAuth();
  if (booting) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!admin) return <Navigate to="/admin/login" replace />;
  return <Outlet />;
}

export default function AdminApp() {
  return (
    <AdminAuthProvider>
      <Routes>
        <Route path="login" element={<AdminLoginPage />} />
        <Route element={<AdminGuard />}>
          <Route element={<AdminLayout />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="usuarios" element={<AdminUsersPage />} />
            <Route path="usuarios/:id" element={<AdminUserProfilePage />} />
            <Route path="auditoria" element={<AdminAuditPage />} />
            <Route path="administradores" element={<AdminAdminsPage />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Route>
        </Route>
      </Routes>
    </AdminAuthProvider>
  );
}
