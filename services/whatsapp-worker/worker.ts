/**
 * Worker leve para uma máquina sempre ligada. Ele não contém credenciais do
 * WPPConnect: apenas autoriza a Edge Function a buscar e enviar um item vencido.
 */
const endpoint = Deno.env.get("SUPABASE_URL") + "/functions/v1/process-whatsapp-billing-queue";
const cronSecret = Deno.env.get("CRON_SECRET");
if (!Deno.env.get("SUPABASE_URL") || !cronSecret) throw new Error("Defina SUPABASE_URL e CRON_SECRET");

for (;;) {
  try {
    const response = await fetch(endpoint, { method: "POST", headers: { "x-cron-secret": cronSecret } });
    if (!response.ok && response.status !== 502) console.error("worker", response.status, await response.text());
  } catch (error) {
    console.error("worker", error);
  }
  await new Promise((resolve) => setTimeout(resolve, 5_000));
}
