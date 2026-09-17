// Verifica novas oportunidades em vintepila.com.br e envia para um grupo do Telegram.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

// order=desc (mais recentes primeiro) + sort=50 (50 resultados por página, o máximo do site)
// para minimizar o risco de uma vaga cair para a página 2 antes do próximo check
const LISTING_URL = 'https://www.vintepila.com.br/trabalhos-freelance/?order=desc&sort=50';
const SEEN_FILE = path.join(__dirname, 'seen.json');
const LOG_FILE = path.join(__dirname, 'run.log');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function loadSeen() {
  try {
    return new Set(JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8')));
  } catch {
    return new Set();
  }
}

function saveSeen(seenSet) {
  // mantém só os últimos 2000 IDs para o arquivo não crescer para sempre
  const arr = Array.from(seenSet).slice(-2000);
  fs.writeFileSync(SEEN_FILE, JSON.stringify(arr, null, 0));
}

async function fetchListing() {
  // o site cacheia essa página (visto via header "Age", até ~50min de defasagem);
  // um parâmetro aleatório força o cache a ser ignorado (Age: 0 / x-cache-debug: MISS)
  const url = `${LISTING_URL}&_cb=${Date.now()}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    },
  });
  if (!res.ok) throw new Error(`Falha ao buscar listagem: HTTP ${res.status}`);
  return res.text();
}

function parseOpportunities(html) {
  const $ = cheerio.load(html);
  const items = [];

  $('div.item').each((_, el) => {
    const $el = $(el);
    const classAttr = $el.attr('class') || '';
    const idMatch = classAttr.match(/h_p_(\d+)/);
    if (!idMatch) return; // não é um card de oportunidade

    const id = idMatch[1];
    const $headerLink = $el.find('a.header').first();
    const title = $headerLink.text().trim();
    const link = $headerLink.attr('href');
    if (!title || !link) return;

    // vagas "DESTAQUE" usam <div class="green header"> em vez de <span id="project-price">,
    // por isso o seletor busca por qualquer elemento com essas duas classes
    const price = $el.find('.content > .green.header').first().text().replace(/\s+/g, ' ').trim();
    const description = $el.find('.description p').first().text().replace(/\s+/g, ' ').trim();
    const deadline = $el.find('.extra i.truck.icon').parent().first().text().replace(/\s+/g, ' ').trim();

    items.push({ id, title, link, price, description, deadline });
  });

  return items;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatMessage(item) {
  const parts = [
    `🆕 <b>${escapeHtml(item.title)}</b>`,
  ];
  parts.push(`💰 <b>Valor:</b> ${escapeHtml(item.price || 'A combinar')}`);
  if (item.deadline) parts.push(`⏰ <b>Prazo:</b> ${escapeHtml(item.deadline)}`);
  if (item.description) parts.push(`📝 ${escapeHtml(item.description)}`);
  parts.push(`🔗 <a href="${item.link}">Ver oportunidade completa</a>`);
  return parts.join('\n\n');
}

async function sendToTelegram(text, attempt = 1) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    }),
  });
  const data = await res.json().catch(() => ({}));

  // respeita o rate limit do Telegram (429) esperando o tempo indicado e tentando de novo
  if (res.status === 429 && attempt <= 3) {
    const waitSec = data?.parameters?.retry_after || 5;
    await new Promise((r) => setTimeout(r, (waitSec + 1) * 1000));
    return sendToTelegram(text, attempt + 1);
  }

  if (!res.ok || !data.ok) {
    throw new Error(`Telegram API error: ${res.status} ${JSON.stringify(data)}`);
  }
}

async function main() {
  if (!BOT_TOKEN || !CHAT_ID) {
    log('ERRO: defina TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID no arquivo .env');
    process.exit(1);
  }

  const seen = loadSeen();
  const isFirstRun = seen.size === 0;

  let html;
  try {
    html = await fetchListing();
  } catch (err) {
    log(`ERRO ao buscar página: ${err.message}`);
    process.exit(1);
  }

  const opportunities = parseOpportunities(html);
  if (opportunities.length === 0) {
    log('ATENÇÃO: nenhuma oportunidade encontrada. O site pode ter mudado a estrutura do HTML.');
    return;
  }

  const newOnes = opportunities.filter((o) => !seen.has(o.id));

  if (isFirstRun) {
    // Na primeira execução só marca tudo como visto, sem disparar mensagens
    // (evita enviar de uma vez todas as oportunidades já existentes no site).
    opportunities.forEach((o) => seen.add(o.id));
    saveSeen(seen);
    log(`Primeira execução: ${opportunities.length} oportunidades marcadas como já vistas. Nenhuma mensagem enviada.`);
    return;
  }

  if (newOnes.length === 0) {
    log('Nenhuma oportunidade nova.');
    return;
  }

  log(`${newOnes.length} oportunidade(s) nova(s) encontrada(s).`);

  // envia da mais antiga para a mais nova, mantendo ordem cronológica no grupo
  for (const item of newOnes.reverse()) {
    try {
      await sendToTelegram(formatMessage(item));
      seen.add(item.id);
      saveSeen(seen); // salva a cada envio bem-sucedido para não reenviar em caso de falha no meio
      log(`Enviado: [${item.id}] ${item.title}`);
      await new Promise((r) => setTimeout(r, 3500)); // Telegram permite ~20 msgs/min por grupo
    } catch (err) {
      log(`ERRO ao enviar [${item.id}] ${item.title}: ${err.message}`);
    }
  }
}

main().catch((err) => {
  log(`ERRO fatal: ${err.stack || err.message}`);
  process.exit(1);
});
