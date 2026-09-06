// Auth, authoritative pricing and durable order handling are shared with PIX checkout.
import { handleCheckout } from "../_shared/billing-checkout.ts";
Deno.serve((req) => handleCheckout(req, true));
