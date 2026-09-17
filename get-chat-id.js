// Ajuda a descobrir o chat_id de um grupo do Telegram.
// Uso: 1) adicione o bot ao grupo  2) mande qualquer mensagem no grupo
//      3) rode: node get-chat-id.js SEU_TOKEN_DO_BOTFATHER
const token = process.argv[2] || require('dotenv').config({ path: require('path').join(__dirname, '.env') }).parsed?.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('Uso: node get-chat-id.js <TOKEN_DO_BOT>  (ou defina TELEGRAM_BOT_TOKEN no .env)');
  process.exit(1);
}

fetch(`https://api.telegram.org/bot${token}/getUpdates`)
  .then((r) => r.json())
  .then((data) => {
    if (!data.ok) {
      console.error('Erro da API do Telegram:', data);
      return;
    }
    if (data.result.length === 0) {
      console.log('Nenhuma atualização encontrada. Mande uma mensagem no grupo (com o bot já adicionado) e rode este script de novo.');
      return;
    }
    const chats = new Map();
    for (const update of data.result) {
      const chat = update.message?.chat || update.my_chat_member?.chat;
      if (chat) chats.set(chat.id, chat);
    }
    console.log('Chats encontrados:');
    for (const chat of chats.values()) {
      console.log(`  id: ${chat.id}  |  tipo: ${chat.type}  |  título/nome: ${chat.title || chat.username || chat.first_name}`);
    }
  })
  .catch((err) => console.error('Falha na requisição:', err.message));
