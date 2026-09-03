import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Trash2, Receipt, Check, CheckCircle, Pencil } from "lucide-react";
import { Expense } from "@/types/loan";
import { todayInAppTz } from "@/lib/timezone";
import { getDueStatusBadge } from "@/features/financial/lib/dueStatus";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { ExpenseBoletoLinkButton } from "@/features/financial/components/ExpenseBoletoLinkButton";
import { VehicleExpenseEditDialog, VehiclePayExpenseDialog } from "@/features/sales/components/product-sales/VehicleExpenseDialogs";

import type { EditScope } from "@/features/financial/lib/seriesEdit";
import { isExpenseInSeries } from "@/features/financial/lib/seriesEdit";

interface Props {
  vehicleExpenses: Expense[];
  allVehicleExpenses: Expense[];
  readOnly: boolean;
  formatCurrency: (v: number) => string;
  onPayExpense?: (id: string, skipBalanceAdjust?: boolean, payDate?: string, paidAmount?: number) => void;
  onUpdateExpense?: (id: string, data: Partial<Omit<Expense, "id" | "createdAt">>) => void;
  handleVehicleUpdateExpense: (id: string, data: Partial<Omit<Expense, "id" | "createdAt">>) => void;
  handleVehiclePayExpense: (id: string, payDate: string, paidAmount: number) => void;
  handleVehicleDeleteExpense: (id: string, scope?: EditScope) => void | Promise<void>;
}

export function VehicleExpensesSection({
  vehicleExpenses,
  allVehicleExpenses,
  readOnly,
  formatCurrency,
  onPayExpense,
  onUpdateExpense,
  handleVehicleUpdateExpense,
  handleVehiclePayExpense,
  handleVehicleDeleteExpense,
}: Props) {
  const [showDeleteAllExpenses, setShowDeleteAllExpenses] = useState(false);
  const [viewPaymentsExpenseId, setViewPaymentsExpenseId] = useState<string | null>(null);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [deleteExpenseId, setDeleteExpenseId] = useState<string | null>(null);
  const [deleteScope, setDeleteScope] = useState<EditScope>("this");
  const [payingExpenseId, setPayingExpenseId] = useState<string | null>(null);

  const deleteTarget = deleteExpenseId ? allVehicleExpenses.find((e) => e.id === deleteExpenseId) : null;
  const deleteTargetIsSeries = deleteTarget ? isExpenseInSeries(deleteTarget) : false;

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Despesas de Veículos ({vehicleExpenses.length})
          </h3>
        </div>

        {/* Dialog de confirmação para limpar pagamentos */}
        <Dialog open={showDeleteAllExpenses} onOpenChange={setShowDeleteAllExpenses}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Limpar Pagamentos</DialogTitle>
              <DialogDescription>
                Tem certeza que deseja limpar todos os dados de pagamento das despesas de veículos? As despesas serão mantidas, mas marcadas como não pagas.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteAllExpenses(false)}>Cancelar</Button>
              <Button data-mutation variant="destructive" onClick={() => {
                allVehicleExpenses.forEach(exp => {
                  if (exp.paid || (exp.paidInstallments && exp.paidInstallments > 0)) {
                    handleVehicleUpdateExpense(exp.id, { paid: false, paidDate: undefined, paidInstallments: 0 });
                  }
                });
                setShowDeleteAllExpenses(false);
              }}>
                <Trash2 className="h-4 w-4 mr-1" />
                Limpar Pagamentos
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {vehicleExpenses.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            <Receipt className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nenhuma despesa de veículo registrada.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {vehicleExpenses.map((exp, idx) => {
              const isOverdue = !exp.paid && exp.dueDate < todayInAppTz();
              void isOverdue;
              const hasPaidSomething = exp.paid || (exp.paidInstallments && exp.paidInstallments > 0);
              const isRecorrente = exp.type === "recorrente" && exp.installments && exp.installments > 1;
              const origMatch = (exp.notes ?? "").match(/\[OrigParcela:\s*([\d.]+)\]/i);
              const originalInstallment = origMatch ? parseFloat(origMatch[1]) : (isRecorrente ? exp.amount / exp.installments! : exp.amount);
              const installmentAmount = isRecorrente ? originalInstallment : exp.amount;

              return (
                <Card key={exp.id} className={`${exp.paid ? "opacity-60" : ""} hover:shadow-[0_4px_16px_-6px_hsl(0_0%_0%/0.08)] hover:-translate-y-[1px] transition-all duration-400 ease-out animate-fade-in`} style={{ animationDelay: `${idx * 50}ms`, animationFillMode: 'backwards' }}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-sm truncate">{exp.description}</p>
                          {(() => {
                            const badge = getDueStatusBadge(exp.dueDate, exp.paid, { paid: "Pago", overdue: "Vencido" });
                            return (
                              <Badge variant={badge.variant} className={`${badge.className} text-[10px] shrink-0`}>
                                {badge.label}
                              </Badge>
                            );
                          })()}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-muted-foreground">
                          <span>{exp.category}</span>
                          <span>Venc: {new Date(exp.dueDate + "T00:00:00").toLocaleDateString("pt-BR")}</span>
                          {isRecorrente && (
                            <span>{exp.paidInstallments || 0}/{exp.installments} parcelas</span>
                          )}
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-2 pt-2 border-t border-border/40">
                          {isRecorrente ? (
                            <div className="flex flex-col">
                              <p className="font-bold text-sm leading-tight">
                                {formatCurrency(installmentAmount)}
                                <span className="ml-1 text-xs font-normal text-muted-foreground">/parcela</span>
                              </p>
                              <p className="text-[11px] text-muted-foreground leading-tight">
                                Total: {formatCurrency(exp.amount)} ({exp.installments}x)
                              </p>
                            </div>
                          ) : (
                            <p className="font-bold text-sm">{formatCurrency(exp.amount)}</p>
                          )}
                          <div className="flex items-center gap-1.5 flex-wrap justify-end w-full sm:w-auto">
                            {hasPaidSomething && onUpdateExpense && (
                              <Button size="sm" variant="outline" onClick={() => setViewPaymentsExpenseId(exp.id)} className="h-8 px-2.5 text-xs flex-1 sm:flex-none min-w-0">
                                <Receipt className="h-3.5 w-3.5 sm:mr-1" />
                                <span className="hidden xs:inline">Pagamentos</span>
                              </Button>
                            )}
                            {!readOnly && !exp.paid && onPayExpense && (
                              <Button data-mutation size="sm" variant="outline" onClick={() => setPayingExpenseId(exp.id)} className="h-8 px-2.5 text-xs flex-1 sm:flex-none min-w-0 text-success border-success/30 hover:bg-success hover:text-success-foreground">
                                <CheckCircle className="h-3.5 w-3.5 sm:mr-1" />
                                <span className="hidden xs:inline">Pagar</span>
                              </Button>
                            )}
                            {!readOnly && onUpdateExpense && (
                              <Button data-mutation size="sm" variant="ghost" onClick={() => setEditingExpenseId(exp.id)} className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground shrink-0">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {!readOnly && (
                              <ExpenseBoletoLinkButton expenseId={exp.id} />
                            )}
                            {!readOnly && (
                              <Button size="sm" variant="ghost" onClick={() => setDeleteExpenseId(exp.id)} className="h-8 w-8 p-0 text-destructive hover:text-destructive shrink-0">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>

                  {/* Dialog de pagamentos individuais */}
                  <Dialog open={viewPaymentsExpenseId === exp.id} onOpenChange={(open) => { if (!open) setViewPaymentsExpenseId(null); }}>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Pagamentos - {exp.description}</DialogTitle>
                        <DialogDescription>Gerencie os pagamentos desta despesa.</DialogDescription>
                      </DialogHeader>
                      <div className="divide-y divide-border/30 max-h-64 overflow-y-auto">
                        {isRecorrente ? (
                          Array.from({ length: exp.paidInstallments || 0 }, (_, i) => (
                            <div key={i} className="flex items-center gap-3 py-3">
                              <span className="w-7 h-7 rounded-full bg-success/20 text-success flex items-center justify-center text-xs font-bold shrink-0">
                                {i + 1}ª
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground">{formatCurrency(installmentAmount)}</p>
                                <p className="text-xs text-muted-foreground">Parcela {i + 1} de {exp.installments}</p>
                              </div>
                              <Badge className="bg-success/20 text-success border-success/30 text-xs">Paga</Badge>
                              {!readOnly && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                                onClick={() => {
                                  const newPaid = i;
                                  const fullyPaid = false;
                                  handleVehicleUpdateExpense(exp.id, { paidInstallments: newPaid, paid: fullyPaid, paidDate: undefined });
                                  if (newPaid === 0) setViewPaymentsExpenseId(null);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                              )}
                            </div>
                          ))
                        ) : (
                          exp.paid && (
                            <div className="flex items-center gap-3 py-3">
                              <span className="w-7 h-7 rounded-full bg-success/20 text-success flex items-center justify-center text-xs font-bold shrink-0">
                                <Check className="h-4 w-4" />
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground">{formatCurrency(exp.amount)}</p>
                                {exp.paidDate && <p className="text-xs text-muted-foreground">{new Date(exp.paidDate + "T00:00:00").toLocaleDateString("pt-BR")}</p>}
                              </div>
                              <Badge className="bg-success/20 text-success border-success/30 text-xs">Paga</Badge>
                              {!readOnly && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                                onClick={() => {
                                  handleVehicleUpdateExpense(exp.id, { paid: false, paidDate: undefined, paidInstallments: 0 });
                                  setViewPaymentsExpenseId(null);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                              )}
                            </div>
                          )
                        )}
                        {(!isRecorrente && !exp.paid && !(exp.paidInstallments && exp.paidInstallments > 0)) && (
                          <div className="py-4 text-center text-sm text-muted-foreground">Nenhum pagamento registrado.</div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>

                  {/* Dialog de edição */}
                  <VehicleExpenseEditDialog
                    expense={exp}
                    open={editingExpenseId === exp.id}
                    onOpenChange={(open) => { if (!open) setEditingExpenseId(null); }}
                    onSave={(data) => {
                      onUpdateExpense!(exp.id, data);
                      setEditingExpenseId(null);
                    }}
                    formatCurrency={formatCurrency}
                  />

                  {/* Dialog de pagamento (data + valor pago) */}
                  <VehiclePayExpenseDialog
                    expense={exp}
                    open={payingExpenseId === exp.id}
                    onOpenChange={(open) => { if (!open) setPayingExpenseId(null); }}
                    onConfirm={(payDate, paidAmount) => {
                      handleVehiclePayExpense(exp.id, payDate, paidAmount);
                      setPayingExpenseId(null);
                    }}
                    formatCurrency={formatCurrency}
                  />
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {deleteTarget && !deleteTargetIsSeries && (
        <ConfirmDeleteDialog
          open={!!deleteExpenseId}
          onOpenChange={() => setDeleteExpenseId(null)}
          onConfirm={() => {
            if (deleteExpenseId) {
              handleVehicleDeleteExpense(deleteExpenseId, "this");
              setDeleteExpenseId(null);
            }
          }}
          title="Excluir despesa"
          description="Tem certeza que deseja excluir esta despesa? Se ela já estava paga, o valor será devolvido ao saldo da conta."
        />
      )}

      {deleteTarget && deleteTargetIsSeries && (
        <Dialog
          open={!!deleteExpenseId}
          onOpenChange={(o) => { if (!o) { setDeleteExpenseId(null); setDeleteScope("this"); } }}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Excluir despesa recorrente</DialogTitle>
              <DialogDescription>
                Esta despesa faz parte de uma série parcelada. Escolha o que deseja excluir.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              {[
                { value: "this", label: "Apenas esta", desc: "Exclui somente a ocorrência selecionada." },
                { value: "pending", label: "Esta e as futuras", desc: "Exclui esta e todas as parcelas ainda não pagas." },
                { value: "all", label: "Todas da série", desc: "Exclui todas as parcelas, inclusive já pagas (o valor pago será devolvido ao saldo)." },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDeleteScope(opt.value as EditScope)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${deleteScope === opt.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                >
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDeleteExpenseId(null); setDeleteScope("this"); }}>Cancelar</Button>
              <Button
                data-mutation
                variant="destructive"
                onClick={async () => {
                  if (deleteExpenseId) {
                    await handleVehicleDeleteExpense(deleteExpenseId, deleteScope);
                    setDeleteExpenseId(null);
                    setDeleteScope("this");
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Excluir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
