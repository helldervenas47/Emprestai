INSERT INTO public.subscriptions (user_id, paddle_subscription_id, paddle_customer_id, product_id, price_id, status, environment)
SELECT 
  u.id,
  'free_' || u.id::text || '_' || env.e,
  'free_customer_' || u.id::text,
  'free_plan',
  'free',
  'active',
  env.e
FROM auth.users u
CROSS JOIN (VALUES ('sandbox'), ('live')) AS env(e)
ON CONFLICT (user_id, environment) DO NOTHING;