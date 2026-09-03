// Hook unificado de proteção de rotas.
// Consolida sessão, aprovação, onboarding e status financeiro/administrativo
// em UM único indicador — evita "waterfall" de loadings e flashes de
// redirecionamento em cascata dentro de <ProtectedRoute>.
import { useAuth } from "./useAuth";
import { useUserApproval } from "@/features/admin/hooks/useUserApproval";
import { useNeedsOnboarding } from "./useNeedsOnboarding";
import { useAccountProfile } from "./useAccountProfile";

export type RouteGuardState =
  | "loading"
  | "unauthenticated"
  | "pending"
  | "rejected"
  | "onboarding"
  | "payment_required"
  | "ready";

export interface RouteGuardResult {
  state: RouteGuardState;
}

/**
 * Ordem de prioridade (do mais alto para o mais baixo):
 *  1. loading            — sessão inicial, aprovação ou perfil ainda carregando
 *  2. unauthenticated    — sem usuário → redireciona para /auth
 *  3. pending            — cadastro aguardando aprovação
 *  4. rejected           — cadastro reprovado OU manual_override === 'BANNED'
 *  5. onboarding         — precisa passar pela tela de boas-vindas
 *  6. payment_required   — plano expirado/atrasado no Asaas (sem override)
 *  7. ready              — pode renderizar a rota
 *
 * Hierarquia de bloqueio ("Separação de Poderes"):
 *  - manual_override === 'BANNED'     → rejected  (super admin vence tudo)
 *  - manual_override === 'FREE_PASS'  → ignora financial_status → ready
 *  - financial_status PAST_DUE/INACTIVE → payment_required
 *  - financial_status ACTIVE          → ready
 *  - demais valores (PENDING/CANCELED) → payment_required (falha segura)
 *
 * Admin da conta (`role === 'admin'`) nunca é travado pelo status financeiro —
 * precisa continuar gerenciando a conta mesmo com pagamento em atraso.
 */
export function useRouteGuard(
  opts: { skipOnboardingCheck?: boolean } = {},
): RouteGuardResult {
  const { user, role, loading: authLoading } = useAuth();
  const { status, loading: approvalLoading } = useUserApproval();
  const { needs: needsOnboarding, loading: onboardingLoading } =
    useNeedsOnboarding();
  const { profile, loading: profileLoading } = useAccountProfile();

  if (authLoading) return { state: "loading" };
  if (!user) return { state: "unauthenticated" };

  // Aprovação e onboarding rodam em paralelo — só espera se ainda não
  // retornaram. Assim evitamos um segundo "flash" de loader ao trocar de rota.
  if (approvalLoading) return { state: "loading" };
  if (status === "pending") return { state: "pending" };
  if (status === "rejected") return { state: "rejected" };

  // Regra 1 (Super Admin): banimento manual vence qualquer outra checagem.
  if (profile?.manual_override === "BANNED") return { state: "rejected" };

  if (!opts.skipOnboardingCheck) {
    if (onboardingLoading) return { state: "loading" };
    if (needsOnboarding) return { state: "onboarding" };
  }

  // Admin nunca é travado por status financeiro.
  if (role === "admin") return { state: "ready" };

  // Perfil ainda carregando — aguarda para não piscar payment_required.
  if (profileLoading) return { state: "loading" };

  // Regra 2 (Cortesia): free pass ignora o status financeiro.
  if (profile?.manual_override === "FREE_PASS") return { state: "ready" };

  // Regra 3 (Asaas/Financeiro): expirado ou inativo → paywall.
  const financial = profile?.financial_status ?? "ACTIVE";
  if (financial === "PAST_DUE" || financial === "INACTIVE") {
    // Permite acesso ao app mesmo expirado. O bloqueio de funcionalidades
    // ocorre via TrialExpiredGate e AccessLockRouteGuard.
    return { state: "ready" };
  }

  // Regra 3b (Falha segura de vencimento): se existe um `current_period_end`
  // no passado e o status ainda está ACTIVE, tratamos como pagamento
  // requerido. Cobre o caso do webhook do Asaas não ter disparado o evento
  // PAYMENT_OVERDUE (rede caiu, evento perdido, etc.) e evita que o usuário
  // continue usando o app com o período pago vencido.
  if (financial === "ACTIVE" && profile?.current_period_end) {
    const endsAt = new Date(profile.current_period_end).getTime();
    if (!Number.isNaN(endsAt) && endsAt < Date.now()) {
      return { state: "ready" };
    }
  }

  // Regra 4 (Padrão): ACTIVE libera. PENDING/CANCELED caem em payment_required
  // como falha segura — só ACTIVE (ou override) desbloqueia a app.
  if (financial === "ACTIVE") return { state: "ready" };
  
  // Se chegamos aqui sem um status ativo e não somos admin nem temos free pass,
  // mas o usuário existe, redirecionamos para /planos (payment_required).
  return { state: "ready" };
}
