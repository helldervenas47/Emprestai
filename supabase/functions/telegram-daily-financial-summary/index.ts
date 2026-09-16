import { buildScheduledReportHandler } from "../_shared/scheduled-report.ts";

export const handler = buildScheduledReportHandler({
  prefsTable: "telegram_daily_financial_summary_prefs",
  command: "relatorio_financeiro",
  trackSendTimeInLastSent: true,
});

Deno.serve(handler);
