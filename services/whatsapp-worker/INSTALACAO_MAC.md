# Instalação do WhatsApp automático em um Mac

Este roteiro instala no Mac:

- WPPConnect Server, responsável pela conexão com o WhatsApp;
- Cloudflare Tunnel, que cria o endereço HTTPS usado pelo EmprestAI;
- worker do EmprestAI, que processa continuamente a fila de cobranças.

## 1. Preparar o Mac

Instale o Docker Desktop:

https://www.docker.com/products/docker-desktop/

Abra o Docker Desktop e aguarde aparecer `Engine running`.

Para impedir que o Mac durma, abra **Ajustes do Sistema > Economia de Energia** (ou **Bateria > Opções**) e ative a opção para impedir o repouso automático quando a tela estiver desligada. Mantenha o Mac ligado à energia.

## 2. Criar a chave do WPPConnect

No Terminal, gere uma chave:

```sh
openssl rand -hex 32
```

Guarde o resultado em um gerenciador de senhas. Ele será a `SECRET_KEY` e não deve ser publicado no GitHub.

## 3. Iniciar o WPPConnect

Substitua `COLE_SUA_SECRET_KEY` pela chave gerada:

```sh
docker run -d \
  --name wppconnect-server \
  --restart unless-stopped \
  -p 21465:21465 \
  -e SECRET_KEY='COLE_SUA_SECRET_KEY' \
  -v wppconnect_tokens:/usr/src/wpp-server/tokens \
  -v wppconnect_user_data:/usr/src/wpp-server/userDataDir \
  wppconnect/wppconnect-server:latest
```

Verifique se o serviço respondeu:

```sh
curl http://localhost:21465/healthz
```

Abra o painel:

http://localhost:21465/manager/

Entre usando a `SECRET_KEY`, crie a sessão `emprestai` e leia o QR Code em **WhatsApp > Configurações > Aparelhos conectados > Conectar aparelho**.

## 4. Gerar o token da sessão

Substitua `COLE_SUA_SECRET_KEY`:

```sh
curl -X POST "http://localhost:21465/api/emprestai/COLE_SUA_SECRET_KEY/generate-token"
```

Copie somente o conteúdo do campo `token`. Esse valor será cadastrado no Supabase como `WPPCONNECT_TOKEN`.

Na pasta principal do EmprestAI, execute:

```sh
npx supabase secrets set WPPCONNECT_TOKEN='COLE_O_TOKEN' --project-ref syyxnqzxqabeuqbuptkh
```

## 5. Criar um endereço HTTPS gratuito

Instale o Cloudflare Tunnel com Homebrew:

```sh
brew install cloudflared
```

Para um primeiro teste, crie um endereço temporário:

```sh
cloudflared tunnel --url http://localhost:21465
```

O Terminal mostrará um endereço semelhante a:

```text
https://palavras-aleatorias.trycloudflare.com
```

Mantenha esse Terminal aberto. Na Central de Cobranças do EmprestAI, configure:

```text
Provedor: WPPConnect
URL do servidor: endereço https gerado pelo Cloudflare
Sessão: emprestai
```

O endereço temporário muda quando o comando é reiniciado. Para operação contínua, configure um túnel nomeado com um domínio adicionado à sua conta gratuita da Cloudflare.

## 6. Configurar o segredo do worker

Gere outro segredo, diferente da chave do WPPConnect:

```sh
openssl rand -hex 32
```

Esse será o `CRON_SECRET`. Cadastre o mesmo valor no Supabase:

```sh
npx supabase secrets set CRON_SECRET='COLE_O_CRON_SECRET' --project-ref syyxnqzxqabeuqbuptkh
```

Crie o arquivo privado do worker:

```sh
cd /Users/hv/Documents/Dev/Emprestai/services/whatsapp-worker
cat > .env <<'EOF'
SUPABASE_URL=https://syyxnqzxqabeuqbuptkh.supabase.co
CRON_SECRET=COLE_O_MESMO_CRON_SECRET
EOF
```

Abra o arquivo `.env` e substitua `COLE_O_MESMO_CRON_SECRET` pelo valor criado. Nunca envie esse arquivo ao GitHub.

## 7. Iniciar o worker

Ainda na pasta `services/whatsapp-worker`:

```sh
docker build -t emprestai-whatsapp-worker .
docker run -d \
  --name emprestai-whatsapp-worker \
  --restart unless-stopped \
  --env-file .env \
  emprestai-whatsapp-worker
```

Confira o funcionamento:

```sh
docker logs --tail=100 emprestai-whatsapp-worker
```

## 8. Fazer o primeiro teste

1. Confirme que a sessão `emprestai` aparece conectada no painel do WPPConnect.
2. Mantenha o Cloudflare Tunnel aberto.
3. Abra a Central de Cobranças no EmprestAI.
4. Escolha um registro de teste com seu próprio telefone.
5. Coloque esse registro na fila.
6. Aguarde o intervalo indicado pela central e confirme o recebimento.

## 9. Operação diária

O Docker reinicia o WPPConnect e o worker automaticamente, desde que o Docker Desktop seja aberto ao entrar no Mac. Ative **Open Docker Desktop when you sign in** nas configurações do Docker.

Verificações rápidas:

```sh
docker ps
docker logs --tail=50 wppconnect-server
docker logs --tail=50 emprestai-whatsapp-worker
```

Para atualizar o WPPConnect:

```sh
docker pull wppconnect/wppconnect-server:latest
docker rm -f wppconnect-server
```

Depois, execute novamente o comando da etapa 3. Os volumes preservam a sessão, mas o WhatsApp ainda pode solicitar um novo QR Code por motivos de segurança.

