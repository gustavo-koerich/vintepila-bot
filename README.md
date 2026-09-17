# Vintepila Bot

Bot que monitora novas oportunidades de freelance em [vintepila.com.br](https://www.vintepila.com.br) e envia automaticamente para um grupo do Telegram.

## Como funciona

- Busca a listagem de trabalhos freelance (mais recentes primeiro), ignorando cache da página
- Compara com as oportunidades já vistas (guardadas localmente em `seen.json`)
- Envia as novas para um grupo do Telegram via Bot API, respeitando o rate limit
- Na primeira execução, apenas marca tudo como visto — evita disparar de uma vez todo o histórico existente no site

## Tecnologias

- Node.js
- [Cheerio](https://cheerio.js.org/) para parsing de HTML
- API do Telegram (Bot API)
- dotenv para variáveis de ambiente

## Configuração

1. Clone o repositório e instale as dependências
   ```bash
   git clone https://github.com/gustavo-koerich/vintepila-bot.git
   cd vintepila-bot
   npm install
   ```

2. Crie um bot no Telegram com o [@BotFather](https://t.me/BotFather) e copie o token gerado

3. Adicione o bot ao grupo do Telegram para onde as oportunidades serão enviadas

4. Descubra o `chat_id` do grupo (envie uma mensagem qualquer no grupo antes)
   ```bash
   node get-chat-id.js SEU_TOKEN_DO_BOT
   ```

5. Copie `.env.example` para `.env` e preencha com os valores obtidos
   ```bash
   cp .env.example .env
   ```
   ```env
   TELEGRAM_BOT_TOKEN=seu_token_aqui
   TELEGRAM_CHAT_ID=id_do_grupo_aqui
   ```

6. Rode o bot
   ```bash
   npm start
   ```

## Agendamento

O script roda uma vez e encerra — para monitoramento contínuo, agende execuções periódicas via cron (Linux/Mac), Agendador de Tarefas (Windows), ou um job agendado na nuvem (Cloud Run Jobs, GitHub Actions, etc).

## Licença

MIT
