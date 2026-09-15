-- Migration: WhatsApp Customer Service & AI Conversations
-- Creates tables for customer conversations, message logging and idempotency control

CREATE TABLE IF NOT EXISTS public.whatsapp_customer_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL, -- Credor (owner dos dados)
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'human_support', 'closed')),
  last_intent TEXT,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id, phone)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_customer_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES public.whatsapp_customer_conversations(id) ON DELETE CASCADE,
  provider_message_id TEXT UNIQUE, -- Idempotência por ID do provedor WhatsApp
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  phone TEXT NOT NULL,
  intent TEXT,
  content TEXT NOT NULL,
  tool_called TEXT,
  tool_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices de performance e consulta rápida
CREATE INDEX IF NOT EXISTS idx_wa_cust_conv_user_phone ON public.whatsapp_customer_conversations(user_id, phone);
CREATE INDEX IF NOT EXISTS idx_wa_cust_conv_client ON public.whatsapp_customer_conversations(client_id);
CREATE INDEX IF NOT EXISTS idx_wa_cust_conv_status ON public.whatsapp_customer_conversations(status);
CREATE INDEX IF NOT EXISTS idx_wa_cust_msg_conv ON public.whatsapp_customer_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_cust_msg_provider_id ON public.whatsapp_customer_messages(provider_message_id);

-- RLS
ALTER TABLE public.whatsapp_customer_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_customer_messages ENABLE ROW LEVEL SECURITY;

-- Políticas de isolamento por credor (Multi-tenant)
CREATE POLICY "Creditors view own customer conversations"
  ON public.whatsapp_customer_conversations FOR SELECT TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "Creditors manage own customer conversations"
  ON public.whatsapp_customer_conversations FOR ALL TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()))
  WITH CHECK (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Creditors view own customer messages"
  ON public.whatsapp_customer_messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.whatsapp_customer_conversations c
    WHERE c.id = conversation_id AND c.user_id = public.get_data_owner_id(auth.uid())
  ));

-- Acesso total para service_role (Edge Functions / Backend)
CREATE POLICY "Service role manages customer conversations"
  ON public.whatsapp_customer_conversations FOR ALL TO public
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role manages customer messages"
  ON public.whatsapp_customer_messages FOR ALL TO public
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_customer_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_customer_messages TO authenticated;
GRANT ALL ON public.whatsapp_customer_conversations, public.whatsapp_customer_messages TO service_role;

-- Trigger updated_at
CREATE TRIGGER set_whatsapp_customer_conversations_updated_at
  BEFORE UPDATE ON public.whatsapp_customer_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
