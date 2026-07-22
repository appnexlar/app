import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";

/** Área interna: exige corretor autenticado E com e-mail confirmado. */
export function ProtectedRoute() {
  const { isAuthenticated, emailVerified } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!emailVerified) return <Navigate to="/confirmar-email" replace />;
  return <Outlet />;
}

/** Telas de autenticação: só para quem não está logado. */
export function GuestRoute() {
  const { isAuthenticated, emailVerified } = useAuth();
  if (!isAuthenticated) return <Outlet />;
  return <Navigate to={emailVerified ? "/dashboard" : "/confirmar-email"} replace />;
}

/** Gate de confirmação de e-mail: logado, mas ainda não confirmou. */
export function EmailGateRoute() {
  const { isAuthenticated, emailVerified } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (emailVerified) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
