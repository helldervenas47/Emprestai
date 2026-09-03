/**
 * Rota temporária do diagnóstico financeiro (Fase 2).
 * Protegida por flag (`VITE_FINANCIAL_DIFF_DIAGNOSTICS`) + admin/preview.
 */

import { FinancialDiagnosticsPanel } from "@/features/loans/components/diagnostics/FinancialDiagnosticsPanel";

export default function PainelMigracao() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 pb-24">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Diagnóstico financeiro — antigo × novo</h1>
        <p className="text-sm text-muted-foreground">
          Comparação somente leitura por contrato. Nenhum valor é gravado, corrigido ou recalculado no banco.
        </p>
      </header>
      <FinancialDiagnosticsPanel />
    </div>
  );
}
