# Plan: Fix Duplicated Credit Card Expenses in Recurrent Payments

The user reported that recurring expenses marked as "Crédito" (Credit Card) are generating new installments in the credit card invoice before the current installment is paid. This typically happens for "recorrente" (recurring) expenses with multiple installments where the system estimated future installments, or for "after payment" recurrence where the logic might be prematurely firing.

## Technical Analysis

1.  **Credit Card Integration**: In this app, credit card expenses are detected by a specific tag in the `notes` field (e.g., `[Crédito] Cartão: Nubank {ID:xxx}`).
2.  **Installment Expansion**: `expandCreditCardExpenses` in `src/features/creditCards/lib/creditCardInstallments.ts` (implied, used in `creditCardInvoiceTotals.ts`) is likely responsible for "virtualizing" future installments of a recurring expense into the appropriate credit card cycles.
3.  **The Issue**: If a recurring expense is marked as credit card, the virtualization logic likely sees all future installments and puts them in future invoices. However, for "Recorrente após pagamento" (recurrenceType: "after_payment"), the system should *not* show future installments because they haven't been created yet.
4.  **Virtualization Overlap**: Even for standard recurring expenses, the user wants the next installment to only appear after payment, or at least not to "clutter" if it's not the intended behavior for specific types.
5.  **Root Cause**: The logic in `getCardInvoiceTotalsForMonth` (and `listPaidInvoicesInRange`) uses `expandCreditCardExpenses`. If that function doesn't check `recurrenceType === 'after_payment'`, it will generate 999 virtual installments immediately for the credit card, even though they aren't meant to exist yet.

## Proposed Changes

### 1. Update `expandCreditCardExpenses` (or the expansion logic)
I need to find where `expandCreditCardExpenses` is defined and ensure it respects `recurrenceType === 'after_payment'`. If it's "after_payment", it should only show the *current* unpaid installment or the already paid ones, never future virtual ones.

### 2. Audit `useExpenses.ts` payment logic
Ensure that when an "after_payment" expense is paid, the newly generated expense also inherits the credit card tags correctly and doesn't create a race condition where the UI shows both.

### 3. Personal Expense Form Fix
The user previously asked for "Recorrente após pagamento" in personal expenses. I'll ensure that when this type is used with "Crédito", it behaves correctly.

## Technical Details

-   **File**: `src/features/creditCards/lib/creditCardInstallments.ts` (Need to read first)
-   **Logic**:
    ```typescript
    if (expense.recurrenceType === 'after_payment') {
      // Only return the root expense, no virtual future installments.
      return [expense];
    }
    ```
-   **File**: `src/features/financial/hooks/useExpenses.ts`
-   **Logic**: verify `payExpense` for `isAfterPaymentRecurrent` correctly transfers card tags to the `nextPayload`.

## User Review Required

> [!IMPORTANT]
> This change will prevent future installments of "Recorrente após pagamento" expenses from appearing in your credit card invoice until the current one is paid. Standard recurring expenses (e.g., a 12x purchase) will still show their future installments as planned.
