import {getExternalAdmin} from "../_shared/external-supabase.ts";
import {requireCronOrAdmin} from "../_shared/require-cron-or-admin.ts";
import {asaasFetch,billingConfig,billingJson} from "../_shared/asaas.ts";
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return billingJson({});
 if(req.method!=="POST")return billingJson({error:"method_not_allowed"},405);
 const guard=await requireCronOrAdmin(req);if(guard instanceof Response)return guard;
  let runId: string | undefined;
  let admin: any;
  let environment = "live";
  const started = Date.now();
  let ordersChecked = 0;
  let paymentsChecked = 0;
  let updatedCount = 0;
  let failedCount = 0;
  let requiresReviewCount = 0;

  try {
    admin = getExternalAdmin();
    environment = billingConfig().environment;

    // Registra início da execução
    const { data: runRow } = await admin
      .from("billing_reconciliation_runs")
      .insert({
        environment,
        started_at: new Date().toISOString(),
        status: "running",
      })
      .select("id")
      .maybeSingle();

    if (runRow?.id) runId = runRow.id;

    const orders = await admin.from("billing_orders").select("*").eq("environment", environment)
      .order("checked_at", { ascending: true, nullsFirst: true }).limit(20);
    if (orders.error) throw new Error(orders.error.message);

    const results = [];
    for (const order of orders.data ?? []) {
      if (Date.now() - started > 35_000) break;
      ordersChecked++;
      try {
        if (!order.payment_id && order.checkout_kind === "recurring") {
          const matches = await asaasFetch(`/subscriptions?externalReference=${encodeURIComponent(order.id)}`);
          if (matches.data?.length === 1) {
            const saved = await admin.from("billing_contracts").upsert({ environment, subscription_id: matches.data[0].id, order_id: order.id });
            if (saved.error) throw new Error("contract_save_failed");
          }
        }
        const payment = order.payment_id
          ? await asaasFetch(`/payments/${encodeURIComponent(order.payment_id)}`)
          : (await asaasFetch(`/payments?externalReference=${encodeURIComponent(order.id)}`)).data?.[0];

        if (!payment) {
          await admin.from("billing_orders").update({ checked_at: new Date().toISOString(), review_reason: "creation_result_unknown" }).eq("id", order.id);
          requiresReviewCount++;
          results.push({ orderId: order.id, review: "creation_result_unknown" });
          continue;
        }
        paymentsChecked++;
        const applied = await admin.rpc("billing_apply_payment", {
          _env: environment,
          _event_id: `reconcile:${crypto.randomUUID()}`,
          _event_type: "RECONCILE",
          _payment: payment,
        });
        if (applied.error) throw new Error(applied.error.message);
        if (applied.data?.review) requiresReviewCount++;
        else updatedCount++;
        results.push({ orderId: order.id, ...applied.data });
      } catch (e) {
        failedCount++;
        await admin.from("billing_orders").update({ checked_at: new Date().toISOString(), review_reason: "reconciliation_failed" }).eq("id", order.id);
        results.push({ orderId: order.id, error: (e as Error).message });
      }
    }

    const contracts = await admin.from("billing_contracts").select("*").eq("environment", environment)
      .order("checked_at", { ascending: true, nullsFirst: true }).limit(5);

    if (contracts.error) throw new Error("contract_lookup_failed");

    for (const contract of contracts.data ?? []) {
      if (Date.now() - started > 45_000) break;
      const page = await asaasFetch(`/payments?subscription=${encodeURIComponent(contract.subscription_id)}&limit=100&offset=${contract.scan_offset}`);
      for (const payment of page.data ?? []) {
        paymentsChecked++;
        const applied = await admin.rpc("billing_apply_payment", {
          _env: environment,
          _event_id: `reconcile:${crypto.randomUUID()}`,
          _event_type: "RECONCILE",
          _payment: payment,
        });
        if (applied.error) throw new Error(applied.error.message);
        if (applied.data?.review) requiresReviewCount++;
        else updatedCount++;
      }
      const saved = await admin.from("billing_contracts").update({
        checked_at: new Date().toISOString(),
        scan_offset: page.hasMore ? contract.scan_offset + 100 : 0,
      }).eq("environment", environment).eq("subscription_id", contract.subscription_id);
      if (saved.error) throw new Error("contract_cursor_save_failed");
    }

    const duration = Date.now() - started;
    const finalStatus = failedCount > 0 ? (updatedCount > 0 ? "degraded" : "failed") : "success";

    if (runId) {
      await admin.from("billing_reconciliation_runs").update({
        finished_at: new Date().toISOString(),
        duration_ms: duration,
        orders_checked: ordersChecked,
        payments_checked: paymentsChecked,
        updated_count: updatedCount,
        failed_count: failedCount,
        requires_review_count: requiresReviewCount,
        status: finalStatus,
      }).eq("id", runId);
    }

    return billingJson({
      results,
      summary: {
        durationMs: duration,
        ordersChecked,
        paymentsChecked,
        updatedCount,
        failedCount,
        requiresReviewCount,
        status: finalStatus,
      },
    }, results.some((x) => x.error) ? 503 : 200);
  } catch (e) {
    const duration = Date.now() - started;
    if (admin && runId) {
      await admin.from("billing_reconciliation_runs").update({
        finished_at: new Date().toISOString(),
        duration_ms: duration,
        failed_count: failedCount + 1,
        status: "failed",
        error_message: (e as Error).message?.slice(0, 500),
      }).eq("id", runId);
    }
    return billingJson({ error: (e as Error).message }, 500);
  }
});
