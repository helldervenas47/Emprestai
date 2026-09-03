ALTER TABLE public.telegram_image_delivery_prefs
ADD COLUMN IF NOT EXISTS allowed_user_ids uuid[];