ALTER TABLE public.whatsapp_billing_messages
  ADD COLUMN IF NOT EXISTS message_center_single text,
  ADD COLUMN IF NOT EXISTS message_center_multiple text;

UPDATE public.whatsapp_billing_messages
SET
  message_center_single = COALESCE(
    message_center_single,
    E'Olá, {nome_cliente}!\n\nIdentificamos o seguinte contrato pendente:\n\n• {etiqueta} — {valor_total} — {situacao}\n\nCaso já tenha realizado o pagamento, desconsidere este item.\n\nEmprestAI'
  ),
  message_center_multiple = COALESCE(
    message_center_multiple,
    E'Olá, {nome_cliente}!\n\nIdentificamos os seguintes contratos pendentes:\n\n{lista_contratos}\n\nTotal: {valor_total}\n\nCaso já tenha realizado algum pagamento, desconsidere o respectivo item.\n\nEmprestAI'
  );
