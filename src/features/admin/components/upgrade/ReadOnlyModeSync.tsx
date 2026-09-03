import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useReadOnlyMode } from "@/hooks/useReadOnlyMode";

/**
 * Mantém o store global readOnlyState sincronizado E aplica um bloqueio
 * global na UI quando o trial estiver expirado:
 *  - Injeta CSS desabilitando inputs, selects, textareas e botões de submit.
 *  - Intercepta eventos de submit/click em forms e botões mutativos.
 *  - Permite navegação e leitura; libera totalmente a rota /planos.
 */
export function ReadOnlyModeSync() {
  const { readOnly } = useReadOnlyMode();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!readOnly) return;

    const isOnPlansRoute = () => location.pathname.startsWith("/planos");

    // 1) Injeta estilos que desabilitam controles de escrita visualmente.
    const style = document.createElement("style");
    style.setAttribute("data-readonly-lock", "true");
    style.textContent = `
      body[data-readonly="true"] :is(input, textarea, select):not([data-allow-readonly]):not([type="search"]):not([type="hidden"]):not([type="button"]) {
        pointer-events: none !important;
        opacity: 0.6 !important;
      }
      body[data-readonly="true"] [data-mutation]:not([data-allow-readonly]) {
        pointer-events: none !important;
        opacity: 0.5 !important;
        cursor: not-allowed !important;
      }
    `;
    document.head.appendChild(style);
    document.body.setAttribute("data-readonly", "true");

    let lastToast = 0;
    const notify = () => {
      const now = Date.now();
      if (now - lastToast < 1500) return;
      lastToast = now;
      toast.error("Plano de teste expirado. Assine para continuar.", {
        action: { label: "Ver planos", onClick: () => navigate("/planos") },
      });
    };

    // 2) Intercepta submits em forms.
    const onSubmit = (e: Event) => {
      if (isOnPlansRoute()) return;
      const form = e.target as HTMLElement | null;
      if (form?.closest("[data-allow-readonly]")) return;
      e.preventDefault();
      e.stopPropagation();
      notify();
    };

    // 3) Intercepta clicks em botões mutativos.
    const onClick = (e: MouseEvent) => {
      if (isOnPlansRoute()) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const btn = target.closest("button, [role='button'], a") as HTMLElement | null;
      if (!btn) return;
      if (btn.closest("[data-allow-readonly]")) return;
      if (btn.hasAttribute("data-allow-readonly")) return;
      // Só bloqueia explicitamente botões marcados como mutação.
      // Submits de formulários já são interceptados pelo listener de 'submit'.
      // Isso garante que Cancelar/Fechar/X de dialogs continuem funcionando.
      const isMutation = btn.hasAttribute("data-mutation");
      if (!isMutation) return;
      e.preventDefault();
      e.stopPropagation();
      notify();
    };

    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("click", onClick, true);

    return () => {
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("click", onClick, true);
      document.body.removeAttribute("data-readonly");
      style.remove();
    };
  }, [readOnly, navigate, location.pathname]);

  return null;
}
