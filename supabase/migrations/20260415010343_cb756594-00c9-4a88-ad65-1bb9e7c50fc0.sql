
CREATE TABLE public.plans (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  highlight boolean NOT NULL DEFAULT false,
  features text[] NOT NULL DEFAULT '{}',
  max_loans integer,
  max_users integer,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- Anyone can view active plans (public pricing page)
CREATE POLICY "Anyone can view active plans"
ON public.plans FOR SELECT
TO anon, authenticated
USING (active = true);

-- Only admins can manage plans
CREATE POLICY "Admins can insert plans"
ON public.plans FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update plans"
ON public.plans FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete plans"
ON public.plans FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Admins can also see inactive plans
CREATE POLICY "Admins can view all plans"
ON public.plans FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Insert default plans
INSERT INTO public.plans (name, price, highlight, features, max_loans, max_users, sort_order) VALUES
('Básico', 29, false, ARRAY['Até 50 empréstimos ativos', '1 usuário', 'Controle de parcelas', 'Relatório WhatsApp', 'Suporte por email'], 50, 1, 1),
('Profissional', 59, true, ARRAY['Empréstimos ilimitados', 'Até 3 usuários', 'Relatórios completos', 'Controle de despesas', 'Gestão de clientes', 'Suporte prioritário'], NULL, 3, 2),
('Empresarial', 99, false, ARRAY['Tudo do Profissional', 'Usuários ilimitados', 'Locação de veículos', 'Controle de produtos e vendas', 'Webhooks e integrações', 'Suporte dedicado'], NULL, NULL, 3);
