import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAccessLock } from "@/hooks/useAccessLock";

/**
 * Quando o usuário está bloqueado (plano expirado ou bloqueio admin), impede
 * o acesso a qualquer rota autenticada que não seja a Home (`/`) — onde a aba
 * Sistema continua acessível. Rotas como `/cofrinhos`, `/planejamento-do-dia`,
 * `/cofrinho/:id`, `/bem-vindo` são redirecionadas para `/?tab=system`.
 *
 * A rota `/planos` permanece livre (é rota pública) para permitir o upgrade.
 */
export function AccessLockRouteGuard() {
  const { locked, loading } = useAccessLock();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !locked) return;
    // Só redireciona rotas autenticadas que não são a home.
    if (location.pathname === "/" || location.pathname.startsWith("/planos")) return;
    navigate("/?tab=system", { replace: true });
  }, [locked, loading, location.pathname, navigate]);

  return null;
}
