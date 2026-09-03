# Plan - Fix Retrospective Default Rate Goal Recalculation

The goal is to ensure that the **Delinquency Rate** (Taxa de Inadimplência) in the "Metas" tab remains immutable for closed months, even if a late payment is made in a subsequent month. This follows the "snapshot" principle where each month represents the real situation at the end of that specific period.

## Proposed Changes

### 1. Unified Delinquency Calculation Logic
- Modify `src/features/piggyBanks/components/GoalsCard.tsx` (the central calculation engine) to allow passing a reference date for the "overdue" check.
- Currently, `computeDefaultRate` uses `todayInAppTz()` to determine if a non-paid installment is overdue. I will change this to use a `referenceDate` (the last day of the month being calculated).

### 2. Snapshot Preservation
- Verify and reinforce the `upsertSnapshot` logic in `src/features/piggyBanks/components/GoalsCard.tsx` and `src/features/piggyBanks/hooks/useGoalSnapshots.ts`.
- Ensure that for the `max_default_rate` goal type, once a snapshot is saved for a closed month, it is never recalculated unless explicitly requested.
- Fix the `auto-fechamento` (auto-closing) logic to ensure it captures the state correctly at the end of the month.

### 3. Historical Consistency in Charts and Reports
- Update `src/features/piggyBanks/lib/metasMonthResult.ts` and `src/features/piggyBanks/lib/metasDailyEvolution.ts` to ensure they respect the "closed month" rule and use snapshots when available.

## Technical Details

- **File:** `src/features/piggyBanks/components/GoalsCard.tsx`
  - Update `computeDefaultRate(loans, payments, installmentSchedules, m)`:
    - Determine `endOfMonth` for `m`.
    - Compare `entry.dueDate` against `min(today, endOfMonth)` instead of just `today`.
    - Filter `payments` to only include those where `payment.date <= endOfMonth`.
- **File:** `src/features/piggyBanks/lib/metasDailyEvolution.ts`
  - Ensure `defaultRateAt` already correctly uses the `cutoff` parameter for both due date checks and payment filtering. (Preliminary check shows it does, but I will verify if it matches the refined logic).

## User Review Required

> [!IMPORTANT]
> The current system already has an "auto-closing" mechanism that saves snapshots. The fix involves making the "live calculation" (used before/during the snapshot) aware of the month's boundaries, so the snapshot itself is recorded with the correct "historical photograph".

### Questions:
1. Should we also apply this "lock" logic to other goal types, or only to the Delinquency Rate as requested? (The plan currently focuses on Delinquency Rate as requested).
