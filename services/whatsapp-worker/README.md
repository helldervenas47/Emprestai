# Worker da Central de Cobranças

Este processo deve ficar ativo ao lado do WPPConnect. Ele consulta a fila a cada
5 segundos; cada item já recebe `scheduled_at` com 30 segundos de diferença no
backend. Assim o envio continua mesmo que o usuário feche o navegador.

Variáveis necessárias no ambiente do container:

- `SUPABASE_URL`: URL pública do projeto Supabase.
- `CRON_SECRET`: o mesmo segredo configurado nas Edge Functions.

No Supabase, configure também `WPPCONNECT_TOKEN`. O token nunca é enviado ao
frontend. A URL e o nome da sessão são configurados pelo usuário no EmprestAI.

Exemplo de execução:

```sh
docker build -t emprestai-whatsapp-worker .
docker run -d --restart unless-stopped --env-file .env emprestai-whatsapp-worker
```
