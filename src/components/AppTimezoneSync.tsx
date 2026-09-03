import { useAccountSettings } from "@/hooks/useAccountSettings";

/**
 * Mounted at app root after auth so the configured account timezone is loaded
 * into the in-memory cache before any "is overdue" comparison runs in the UI.
 * Renders nothing.
 */
export function AppTimezoneSync() {
  useAccountSettings();
  return null;
}
