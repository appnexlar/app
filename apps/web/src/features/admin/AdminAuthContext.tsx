import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AdminAuthResponse, AdminPermission, AdminProfile } from "@nexlar/shared";
import {
  adminHttp,
  refreshAdminSession,
  setAdminSessionExpiredHandler,
  setAdminToken,
} from "./api/http";

interface AdminAuthState {
  admin: AdminProfile | null;
  /** true enquanto o boot pergunta ao servidor se existe sessão no cookie. */
  booting: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: AdminPermission) => boolean;
}

const AdminAuthContext = createContext<AdminAuthState | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [booting, setBooting] = useState(true);

  // Boot: tenta renovar pelo cookie httpOnly. Sem sessão, segue deslogado
  // sem erro nenhum; é o caso normal de quem abre /admin pela primeira vez.
  useEffect(() => {
    let ativo = true;
    refreshAdminSession()
      .then((data) => {
        if (ativo && data) setAdmin(data.admin);
      })
      .finally(() => {
        if (ativo) setBooting(false);
      });
    return () => {
      ativo = false;
    };
  }, []);

  // Sessão morta no meio do uso (teto de 8h, suspensão): volta ao login.
  useEffect(() => {
    setAdminSessionExpiredHandler(() => {
      setAdminToken(null);
      setAdmin(null);
    });
    return () => setAdminSessionExpiredHandler(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await adminHttp.post<AdminAuthResponse>("/auth/login", { email, password });
    setAdminToken(data.accessToken);
    setAdmin(data.admin);
  }, []);

  const logout = useCallback(async () => {
    await adminHttp.post("/auth/logout").catch(() => undefined);
    setAdminToken(null);
    setAdmin(null);
  }, []);

  const can = useCallback(
    (permission: AdminPermission) => admin?.permissions.includes(permission) ?? false,
    [admin],
  );

  const value = useMemo(
    () => ({ admin, booting, login, logout, can }),
    [admin, booting, login, logout, can],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthState {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth fora do AdminAuthProvider");
  return ctx;
}
