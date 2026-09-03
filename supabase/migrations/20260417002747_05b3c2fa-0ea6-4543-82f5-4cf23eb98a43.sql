CREATE TABLE public.credit_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nickname TEXT NOT NULL DEFAULT '',
  bank TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT 'visa',
  last_four TEXT NOT NULL DEFAULT '',
  credit_limit NUMERIC NOT NULL DEFAULT 0,
  closing_day INTEGER NOT NULL DEFAULT 1 CHECK (closing_day BETWEEN 1 AND 31),
  due_day INTEGER NOT NULL DEFAULT 10 CHECK (due_day BETWEEN 1 AND 31),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view credit_cards"
ON public.credit_cards FOR SELECT
TO authenticated
USING (user_id = get_data_owner_id(auth.uid()));

CREATE POLICY "Users can insert credit_cards"
ON public.credit_cards FOR INSERT
TO authenticated
WITH CHECK (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

CREATE POLICY "Users can update credit_cards"
ON public.credit_cards FOR UPDATE
TO authenticated
USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

CREATE POLICY "Users can delete credit_cards"
ON public.credit_cards FOR DELETE
TO authenticated
USING (user_id = get_data_owner_id(auth.uid()) AND can_write_data(auth.uid()));

CREATE TRIGGER update_credit_cards_updated_at
BEFORE UPDATE ON public.credit_cards
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_credit_cards_user_id ON public.credit_cards(user_id);