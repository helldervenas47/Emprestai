import React, { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface FormModalOverlayProps {
  children: React.ReactNode;
  className?: string;
  zIndexClass?: string;
  /** Se true, o modal está visível (padrão: true) */
  open?: boolean;
}

/**
 * Overlay Global e Bloqueante para Telas de Cadastro / Modais.
 *
 * Garante:
 * 1. Renderização no topo absoluto do DOM via createPortal (z-index 100).
 * 2. Bloqueio completo de cliques, toques e scroll do aplicativo de fundo.
 * 3. Aplicação de `inert` no app de fundo enquanto o modal estiver aberto.
 * 4. Trava de foco (Focus Trap) para navegação por teclado (Tab/Shift+Tab).
 * 5. Isolamento total contra fechamento acidental por clique no fundo.
 */
export function FormModalOverlay({
  children,
  className = "flex items-center justify-center p-0 sm:p-4",
  zIndexClass = "z-[100]",
  open = true,
}: FormModalOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!open || typeof window === "undefined" || typeof document === "undefined") return;

    // Guardar elemento ativo anterior para restaurar foco
    if (document.activeElement instanceof HTMLElement) {
      previousActiveElement.current = document.activeElement;
    }

    const rootElement = document.getElementById("root");
    const originalRootInert = rootElement?.getAttribute("inert");
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;

    // Bloquear scroll e interação do fundo
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    // Não aplique `touch-action: none` no body. Componentes Radix como Select
    // são portais filhos do body; no iOS/PWA essa trava também bloqueia o
    // gesto vertical dentro da lista. `overflow: hidden` + `inert` no root já
    // impedem a interação e a rolagem do conteúdo ao fundo.
    document.body.setAttribute("data-form-modal-open", "true");

    if (rootElement) {
      rootElement.setAttribute("inert", "");
    }

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.removeAttribute("data-form-modal-open");

      if (rootElement) {
        if (originalRootInert !== null && originalRootInert !== undefined) {
          rootElement.setAttribute("inert", originalRootInert);
        } else {
          rootElement.removeAttribute("inert");
        }
      }

      // Devolver o foco ao fechar
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === "function") {
        try {
          previousActiveElement.current.focus({ preventScroll: true });
        } catch {
          // Ignorar se o elemento não existir mais
        }
      }
    };
  }, [open]);

  // Focus Trap: prender navegação por Tab dentro do modal
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !containerRef.current) return;

      const focusableElements = containerRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );

      if (focusableElements.length === 0) {
        e.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstElement || !containerRef.current.contains(document.activeElement)) {
          lastElement.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement || !containerRef.current.contains(document.activeElement)) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      className={`fixed inset-0 ${zIndexClass} bg-background/80 backdrop-blur-sm animate-in fade-in-0 duration-200 outline-none select-text ${className}`}
    >
      {children}
    </div>,
    document.body
  );
}
