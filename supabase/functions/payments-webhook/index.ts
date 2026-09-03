import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyWebhook, EventName, type PaddleEnv } from '../_shared/paddle.ts';

const supabase = createClient(
  Deno.env.get('EXTERNAL_SUPABASE_URL')!,
  Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!
);

// Map product_id from subscription to plan name
const PRODUCT_TO_PLAN_NAME: Record<string, string> = {
  free_plan: 'Free',
  basico_plan: 'Básico',
  profissional_plan: 'Profissional',
  empresarial_plan: 'Empresarial',
};

async function syncTabPermissions(userId: string, productId: string) {
  const planName = PRODUCT_TO_PLAN_NAME[productId];
  if (!planName) {
    console.log('Unknown product_id for tab sync:', productId);
    return;
  }

  const { data: plan } = await supabase
    .from('plans')
    .select('allowed_tabs')
    .eq('name', planName)
    .eq('active', true)
    .maybeSingle();

  if (!plan) {
    console.log('Plan not found for name:', planName);
    return;
  }

  const allowedTabs = plan.allowed_tabs;

  // Upsert user_tab_permissions
  const { data: existing } = await supabase
    .from('user_tab_permissions')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('user_tab_permissions')
      .update({ allowed_tabs: allowedTabs, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
  } else {
    await supabase
      .from('user_tab_permissions')
      .insert({ user_id: userId, allowed_tabs: allowedTabs });
  }

  console.log('Tab permissions synced for user', userId, 'plan', planName, 'tabs', allowedTabs);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const env = (url.searchParams.get('env') || 'sandbox') as PaddleEnv;

  try {
    const event = await verifyWebhook(req, env);
    console.log('Received event:', event.eventType, 'env:', env);

    switch (event.eventType) {
      case EventName.SubscriptionCreated:
        await handleSubscriptionCreated(event.data, env);
        break;
      case EventName.SubscriptionUpdated:
        await handleSubscriptionUpdated(event.data, env);
        break;
      case EventName.SubscriptionCanceled:
        await handleSubscriptionCanceled(event.data, env);
        break;
      case EventName.TransactionCompleted:
        console.log('Transaction completed:', event.data.id, 'env:', env);
        break;
      case EventName.TransactionPaymentFailed:
        console.log('Payment failed:', event.data.id, 'env:', env);
        break;
      default:
        console.log('Unhandled event:', event.eventType);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('Webhook error:', e);
    return new Response('Webhook error', { status: 400 });
  }
});

async function handleSubscriptionCreated(data: any, env: PaddleEnv) {
  const { id, customerId, items, status, currentBillingPeriod, customData } = data;

  const userId = customData?.userId;
  if (!userId) {
    console.error('No userId in customData');
    return;
  }

  const item = items[0];
  const priceId = item.price.importMeta?.externalId || item.price.id;
  const productId = item.product.importMeta?.externalId || item.product.id;

  await supabase.from('subscriptions').upsert({
    user_id: userId,
    paddle_subscription_id: id,
    paddle_customer_id: customerId,
    product_id: productId,
    price_id: priceId,
    status: status,
    current_period_start: currentBillingPeriod?.startsAt,
    current_period_end: currentBillingPeriod?.endsAt,
    environment: env,
    updated_at: new Date().toISOString(),
  }, {
    onConflict: 'user_id,environment',
  });

  // Sync tab permissions based on plan
  await syncTabPermissions(userId, productId);
}

async function handleSubscriptionUpdated(data: any, env: PaddleEnv) {
  const { id, status, currentBillingPeriod, scheduledChange, items } = data;

  await supabase.from('subscriptions')
    .update({
      status: status,
      current_period_start: currentBillingPeriod?.startsAt,
      current_period_end: currentBillingPeriod?.endsAt,
      cancel_at_period_end: scheduledChange?.action === 'cancel',
      updated_at: new Date().toISOString(),
    })
    .eq('paddle_subscription_id', id)
    .eq('environment', env);

  // If plan changed, sync tab permissions
  if (items?.length > 0) {
    const productId = items[0].product.importMeta?.externalId || items[0].product.id;
    // Get user_id from subscription
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('paddle_subscription_id', id)
      .eq('environment', env)
      .maybeSingle();

    if (sub?.user_id) {
      await syncTabPermissions(sub.user_id, productId);
    }
  }
}

async function handleSubscriptionCanceled(data: any, env: PaddleEnv) {
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('paddle_subscription_id', data.id)
    .eq('environment', env)
    .maybeSingle();

  await supabase.from('subscriptions')
    .update({
      status: 'canceled',
      updated_at: new Date().toISOString(),
    })
    .eq('paddle_subscription_id', data.id)
    .eq('environment', env);

  // Revert to free plan tabs
  if (sub?.user_id) {
    await syncTabPermissions(sub.user_id, 'free_plan');
  }
}