-- Ultima verificacao, somente leitura e sem dados pessoais.
-- Mostra apenas contas cujo acesso atual depende de registro live sem vencimento
-- ou de um perfil atualizado pelo ambiente sandbox.
WITH risky AS (
  SELECT p.user_id,
         array_remove(ARRAY[
           CASE WHEN EXISTS (
             SELECT 1 FROM public.subscriptions s
              WHERE s.user_id=p.user_id AND s.environment='live'
                AND s.status IN ('active','paid','trialing','canceled')
                AND s.current_period_end IS NULL
           ) THEN 'live_sem_vencimento' END,
           CASE WHEN nullif(to_jsonb(p)->>'current_period_end','')::timestamptz>now()
             AND NOT EXISTS (
               SELECT 1 FROM public.subscriptions s
                WHERE s.user_id=p.user_id AND s.environment='live'
                  AND s.current_period_end>now()
             ) THEN 'perfil_futuro_sem_assinatura_live' END
         ], NULL) AS reasons
    FROM public.profiles p
), rows AS (
  SELECT substr(md5(r.user_id::text),1,12) AS account_key,
         r.reasons,
         substr(md5(public.get_data_owner_id(r.user_id)::text),1,12) AS owner_key,
         coalesce((SELECT jsonb_agg(ur.role ORDER BY ur.role) FROM public.user_roles ur WHERE ur.user_id=r.user_id),'[]'::jsonb) AS roles,
         to_jsonb(p)->>'financial_status' AS financial_status,
         to_jsonb(p)->>'current_period_end' AS profile_period_end,
         coalesce((SELECT jsonb_agg(jsonb_build_object(
           'environment',s.environment,'status',s.status,'product_id',s.product_id,
           'period_end',s.current_period_end,'manual_override',coalesce((to_jsonb(s)->>'manual_override')::boolean,false),
           'has_asaas_payment',nullif(to_jsonb(s)->>'asaas_payment_id','') IS NOT NULL,
           'has_asaas_subscription',nullif(to_jsonb(s)->>'asaas_subscription_id','') IS NOT NULL
         ) ORDER BY s.environment) FROM public.subscriptions s WHERE s.user_id=r.user_id),'[]'::jsonb) AS subscriptions
    FROM risky r
    JOIN public.profiles p ON p.user_id=r.user_id
   WHERE cardinality(r.reasons)>0
)
SELECT coalesce(jsonb_agg(to_jsonb(rows) ORDER BY account_key),'[]'::jsonb) AS acessos_de_risco
  FROM rows;
