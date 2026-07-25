import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "./features/auth/LoginPage";
import { RegisterPage } from "./features/auth/RegisterPage";
import { ForgotPasswordPage } from "./features/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "./features/auth/ResetPasswordPage";
import { ConfirmEmailPage } from "./features/auth/ConfirmEmailPage";
import { GuestRoute, ProtectedRoute } from "./features/auth/ProtectedRoute";
import { SessionExpiryHandler } from "./features/auth/SessionExpiryHandler";
import { AppLayout } from "./features/shell/AppLayout";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { ProfilePage } from "./features/profile/ProfilePage";
import { LeadsPage } from "./features/leads/LeadsPage";
import { LeadDetailPage } from "./features/leads/LeadDetailPage";
import { LeadSharesPage } from "./features/sharing/LeadSharesPage";
import { PropertiesPage } from "./features/properties/PropertiesPage";
import { PropertyWizard } from "./features/properties/PropertyWizard";
import { PropertyDetailPage } from "./features/properties/PropertyDetailPage";
import { FunnelPage } from "./features/funnel/FunnelPage";
import { ClientsPage } from "./features/clients/ClientsPage";
import { ClientDetailPage } from "./features/clients/ClientDetailPage";
import { AgendaPage } from "./features/agenda/AgendaPage";
import { MyPagePage } from "./features/public-page/MyPagePage";
import { PublicPropertiesPage } from "./features/public-page/PublicPropertiesPage";
import { PreviewPage } from "./features/public-page/PreviewPage";
import { PublicBrokerPage } from "./features/public-page/PublicBrokerPage";
import { PublicPropertyPage } from "./features/public-page/PublicPropertyPage";
import {
  DocumentsPage,
  SimulationsPage,
  VisitsPage,
} from "./features/placeholders/modules";
import { TermsPage } from "./features/legal/TermsPage";
import { PrivacyPage } from "./features/legal/PrivacyPage";
import { PublicSharePage } from "./features/sharing/PublicSharePage";
import { SessionBoot } from "./features/auth/SessionBoot";

export function App() {
  return (
    // Nada é renderizado antes de o servidor confirmar (ou negar) a sessão pelo
    // cookie. Decidir rota sem saber quem é faria o login piscar para quem já
    // está logado.
    <SessionBoot>
      <SessionExpiryHandler />
      <Routes>
        {/* Páginas legais: públicas. */}
        <Route path="/termos" element={<TermsPage />} />
        <Route path="/privacidade" element={<PrivacyPage />} />

        {/* Imóvel compartilhado: página pública, sem login. */}
        <Route path="/imovel-compartilhado/:token" element={<PublicSharePage />} />

        {/* A vitrine do corretor: pública, sem login. */}
        <Route path="/corretor/:slug" element={<PublicBrokerPage />} />
        <Route path="/corretor/:slug/imovel/:code" element={<PublicPropertyPage />} />

        {/* Telas de autenticação: só para quem não está logado. */}
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/criar-conta" element={<RegisterPage />} />
          <Route path="/recuperar-senha" element={<ForgotPasswordPage />} />
          <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
        </Route>

        {/* Confirmação de e-mail. Sem guarda de rota de propósito: o link do
            e-mail costuma ser aberto no celular, num navegador onde a pessoa
            nunca entrou. A própria tela decide o que mostrar e para onde
            mandar, conforme tenha token na URL e sessão aberta. */}
        <Route path="/confirmar-email" element={<ConfirmEmailPage />} />

        {/* Área logada: layout-base + módulos. */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/leads" element={<LeadsPage />} />
            <Route path="/leads/:id" element={<LeadDetailPage />} />
            <Route path="/leads/:id/imoveis-enviados" element={<LeadSharesPage />} />
            <Route path="/funil" element={<FunnelPage />} />
            <Route path="/clientes" element={<ClientsPage />} />
            <Route path="/clientes/:id" element={<ClientDetailPage />} />
            <Route path="/agenda" element={<AgendaPage />} />
            <Route path="/visitas" element={<VisitsPage />} />
            <Route path="/imoveis" element={<PropertiesPage />} />
            <Route path="/imoveis/novo" element={<PropertyWizard />} />
            <Route path="/imoveis/:id" element={<PropertyDetailPage />} />
            <Route path="/imoveis/:id/editar" element={<PropertyWizard />} />
            <Route path="/documentos" element={<DocumentsPage />} />
            <Route path="/simulacoes" element={<SimulationsPage />} />
            <Route path="/minha-pagina" element={<MyPagePage />} />
            <Route path="/minha-pagina/imoveis" element={<PublicPropertiesPage />} />
            <Route path="/minha-pagina/previa" element={<PreviewPage />} />
            <Route path="/perfil" element={<ProfilePage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </SessionBoot>
  );
}
