// Centralized helper to classify due-date status across the app.
// Status is derived purely from the due date compared to "today" in the app
// timezone, so all tabs stay consistent and update automatically when the date
// changes.

import { todayInAppTz } from "@/lib/timezone";

export type DueStatus = "paid" | "overdue" | "due_today" | "upcoming";

export interface DueStatusBadge {
  status: DueStatus;
  label: string;
  /** shadcn Badge variant */
  variant: "default" | "secondary" | "destructive" | "outline";
  /** Tailwind classes for fine-grained color control (semantic tokens). */
  className: string;
}

/**
 * Returns the status of an item with a due date.
 * - paid → already settled
 * - overdue → due date is strictly before today (in app tz)
 * - due_today → due date is today (in app tz)
 * - upcoming → due date is after today (in app tz)
 */
export function getDueStatus(dueDate: string | undefined | null, paid = false): DueStatus {
  if (paid) return "paid";
  if (!dueDate) return "upcoming";
  const today = todayInAppTz();
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "due_today";
  return "upcoming";
}

/** Default badge config per status. Uses semantic tokens from index.css. */
export function getDueStatusBadge(
  dueDate: string | undefined | null,
  paid = false,
  labels?: Partial<Record<DueStatus, string>>,
): DueStatusBadge {
  const status = getDueStatus(dueDate, paid);
  const defaults: Record<DueStatus, Omit<DueStatusBadge, "status">> = {
    paid: {
      label: labels?.paid ?? "Paga",
      variant: "secondary",
      className: "bg-success/10 text-success border-success/20",
    },
    overdue: {
      label: labels?.overdue ?? "Vencida",
      variant: "destructive",
      className: "bg-destructive/10 text-destructive border-destructive/20",
    },
    due_today: {
      label: labels?.due_today ?? "Vence hoje",
      variant: "outline",
      className: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
    },
    upcoming: {
      label: labels?.upcoming ?? "A vencer",
      variant: "outline",
      className: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
    },
  };
  return { status, ...defaults[status] };
}

export interface DueAccent {
  status: DueStatus;
  /** Left accent bar / progress fill color */
  bar: string;
  /** Icon container background */
  iconBg: string;
  /** Icon / amount text color */
  text: string;
  /** Card border emphasis */
  border: string;
}

/**
 * Color logic for pending records, driven purely by due date vs today:
 * blue = not due yet, orange = due today, red = overdue. Paid keeps green.
 */
export function getDueAccent(dueDate: string | undefined | null, paid = false): DueAccent {
  const status = getDueStatus(dueDate, paid);
  const map: Record<DueStatus, Omit<DueAccent, "status">> = {
    paid: {
      bar: "bg-emerald-500",
      iconBg: "bg-emerald-500/10",
      text: "text-emerald-600 dark:text-emerald-400",
      border: "",
    },
    overdue: {
      bar: "bg-red-500",
      iconBg: "bg-red-500/10",
      text: "text-red-600 dark:text-red-400",
      border: "border-destructive/30",
    },
    due_today: {
      bar: "bg-amber-500",
      iconBg: "bg-amber-500/10",
      text: "text-amber-600 dark:text-amber-400",
      border: "border-amber-500/30",
    },
    upcoming: {
      bar: "bg-sky-500",
      iconBg: "bg-sky-500/10",
      text: "text-sky-600 dark:text-sky-400",
      border: "border-sky-500/20",
    },
  };
  return { status, ...map[status] };
}

