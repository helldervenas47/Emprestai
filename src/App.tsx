import React, { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { AppSonner } from "@/components/ui/app-sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/hooks/useAuth";
import { useRouteGuard } from "@/hooks/useRouteGuard";
import { PendingApprovalScreen } from "./components/PendingApprovalScreen";
import { useAuth } from "@/hooks/useAuth";
import PWAInstallPrompt from "./components/PWAInstallPrompt";
import { BrandTitleSync } from "./components/BrandTitleSync";
import { BrandFaviconSync } from "./components/BrandFaviconSync";
import { OfflineBadge } from "./components/OfflineBadge";
import { AppTimezoneSync } from "./components/AppTimezoneSync";
import { StatusBarScrollSync } from "./components/StatusBarScrollSync";
import { ViewAsBanner } from "./features/admin/components/ViewAsBanner";
import { AppFontSync } from "./hooks/useAppFont";
import { wireAutoSync } from "./lib/offline/sync";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { PaymentCelebrationProvider } from "./hooks/usePaymentCelebration";
import ScrollToTop from "./components/ScrollToTop";
import { TrialExpiredGate } from "./features/admin/components/upgrade/TrialExpiredGate";
import { ReadOnlyModeSync } from "./features/admin/components/upgrade/ReadOnlyModeSync";
import { AccessLockRouteGuard } from "./features/admin/components/upgrade/AccessLockRouteGuard";
import { LazyChunkErrorBoundary } from "./components/LazyChunkErrorBoundary";

wireAutoSync();

const Index = lazy(() => import("./pages/Index.tsx"));
const Auth = lazy(() => import("./pages/Auth.tsx"));
const Cadastro = lazy(() => import("./pages/Cadastro.tsx"));
const ResetPassword = lazy(() => import("./pages/ResetPassword.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const Pricing = lazy(() => import("./pages/Pricing.tsx"));
const Terms = lazy(() => import("./pages/Terms.tsx"));
const RefundPolicy = lazy(() => import("./pages/RefundPolicy.tsx"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy.tsx"));
const DailyPlanning = lazy(() => import("./pages/DailyPlanning.tsx"));
const PiggyBankDetail = lazy(() => import("./pages/PiggyBankDetail.tsx"));
const PiggyBanks = lazy(() => import("./pages/PiggyBanks.tsx"));
const Welcome = lazy(() => import("./pages/Welcome.tsx"));
const PainelMigracao = lazy(() => import("./pages/PainelMigracao.tsx"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      gcTime: 1000 * 60 * 15,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
      networkMode: "offlineFirst",
    },
    mutations: {
      networkMode: "offlineFirst",
      retry: 0,
    },
  },
});


const PageLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
  </div>
);

function ProtectedRoute({
  children,
  skipOnboardingCheck = false,
}: {
  children: React.ReactNode;
  skipOnboardingCheck?: boolean;
}) {
  const { state } = useRouteGuard({ skipOnboardingCheck });

  switch (state) {
    case "loading":
      return <PageLoader />;
    case "unauthenticated":
      return <Navigate to="/auth" replace />;
    case "pending":
      return <PendingApprovalScreen />;
    case "rejected":
      return <PendingApprovalScreen rejected />;
    case "onboarding":
      return <Navigate to="/bem-vindo" replace />;
    case "payment_required":
      // Qualquer usuário ao realizar o login deve ter acesso ao app.
      // O bloqueio de funcionalidades ou aviso de expiração deve ocorrer
      // via TrialExpiredGate / AccessLockRouteGuard, e não por redirecionamento
      // forçado para a tela de planos.
      // 
      // OBS: Após a remoção dos retornos "payment_required" no useRouteGuard,
      // este caso tornou-se código morto, mas é mantido por segurança tipográfica.
      return (
        <TrialExpiredGate>
          <ReadOnlyModeSync />
          <AccessLockRouteGuard />
          {children}
        </TrialExpiredGate>
      );
    case "ready":
    default:
      return (
        <TrialExpiredGate>
          <ReadOnlyModeSync />
          <AccessLockRouteGuard />
          {children}
        </TrialExpiredGate>
      );
  }
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const App = () => (
  <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AppSonner />
        <PWAInstallPrompt />
        <OfflineBadge />
        <BrowserRouter>
          <ScrollToTop />
          <AuthProvider>
            <PaymentCelebrationProvider>
              <BrandTitleSync />
              <BrandFaviconSync />
              <AppTimezoneSync />
              <StatusBarScrollSync />
              <AppFontSync />
              <ViewAsBanner />
              <Suspense fallback={<PageLoader />}>
                <LazyChunkErrorBoundary>
                <Routes>
                  <Route
                    path="/"
                    element={
                      <ProtectedRoute>
                        <Index />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/auth"
                    element={
                      <PublicRoute>
                        <Auth />
                      </PublicRoute>
                    }
                  />
                  <Route
                    path="/cadastro"
                    element={
                      <PublicRoute>
                        <Cadastro />
                      </PublicRoute>
                    }
                  />
                  <Route path="/planos" element={<Pricing />} />
                  <Route path="/termos" element={<Terms />} />
                  <Route path="/reembolso" element={<RefundPolicy />} />
                  <Route path="/privacidade" element={<PrivacyPolicy />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route
                    path="/planejamento-do-dia"
                    element={
                      <ProtectedRoute>
                        <DailyPlanning />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/cofrinhos"
                    element={
                      <ProtectedRoute>
                        <PiggyBanks />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/bem-vindo"
                    element={
                      <ProtectedRoute skipOnboardingCheck>
                        <Welcome />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/ajuda" element={<Navigate to="/?tab=help" replace />} />
                  <Route
                    path="/cofrinho/:id"
                    element={
                      <ProtectedRoute>
                        <PiggyBankDetail />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/diagnostico-financeiro"
                    element={
                      <ProtectedRoute>
                        <PainelMigracao />
                      </ProtectedRoute>
                    }
                  />

                  <Route path="*" element={<NotFound />} />
                </Routes>
                </LazyChunkErrorBoundary>
              </Suspense>
            </PaymentCelebrationProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
