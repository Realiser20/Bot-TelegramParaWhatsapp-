// index.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

const TelegramBot = require('node-telegram-bot-api');
const { create } = require('venom-bot');

// ===== ENV =====
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const DESTINO = process.env.WHATSAPP_DESTINO || '555491739682-1532652400@g.us';
const PORT = process.env.PORT || 3000;
const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome-stable';

if (!TELEGRAM_TOKEN) {
  console.error('❌ Falta TELEGRAM_TOKEN. Configure em Variables no Railway.');
  process.exit(1);
}

// ===== STATE =====
let whatsAppClient = null;
let lastQrDataUrl = null;

// ===== HTTP (QR viewer) =====
const app = express();
app.get('/', (_req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.end(`
    <html>
      <head><meta charset="utf-8"><title>QR WhatsApp</title></head>
      <body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; padding: 24px">
        <h1>QR do WhatsApp</h1>
        ${lastQrDataUrl
          ? `<img src="${lastQrDataUrl}" style="max-width: 320px; image-rendering: pixelated; border:1px solid #ddd; padding:8px; border-radius:8px;" />`
          : `<p>Aguardando QR... recarregue em alguns segundos.</p>`}
        <hr/>
        <p>Status: ${whatsAppClient ? 'Conectado' : 'Aguardando conexão...'}</p>
      </body>
    </html>
  `);
});
app.listen(PORT, () => console.log(`🌐 HTTP up on :${PORT} (QR viewer)`));

// ===== TELEGRAM BOT =====
const telegramBot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Formatter
async function formatarNoticia(mensagem) {
  const linhas = (mensagem || '').split('\n').map(s => s.trim()).filter(Boolean);
  const titulo = linhas[0] || '';
  const linkPrincipal = (linhas.find(l => /^https?:\/\//.test(l)) || '').trim();
  const corpo = linhas.slice(1).filter(l => !/^https?:\/\//.test(l)).join('\n');

  return `📰 ${titulo}

📖 Leia a matéria completa:
🔗 ${linkPrincipal}

${corpo}

---

📢 Compartilhe com seus contatos:

👉 Canal do WhatsApp:
https://whatsapp.com/channel/0029Va6bZj9KGGGAJWEOvM30

👉 Canal do Telegram:
https://t.me/jornaldacidadeonline

---

📱 Baixe o aplicativo e acompanhe tudo em primeira mão:
https://www.jornaldacidadeonline.com.br/paginas/aplicativo`;
}

// Recebe mensagem no Telegram e repassa ao WhatsApp
telegramBot.on('message', async (msg) => {
  const texto = msg?.text;
  if (!texto) return;

  console.log('\n📨 Telegram:\n', texto);
  const mensagemFormatada = await formatarNoticia(texto);
  console.log('\n✅ Formatada:\n', mensagemFormatada);

  if (whatsAppClient?.sendText) {
    try {
      await whatsAppClient.sendText(DESTINO, mensagemFormatada);
      console.log('📤 Enviado ao WhatsApp:', DESTINO);
    } catch (e) {
      console.error('❌ Erro ao enviar ao WhatsApp:', e);
    }
  } else {
    console.log('⚠️ WhatsApp ainda não está pronto.');
  }
});

// ===== Iniciar VENOM =====
const TOKENS_DIR = path.join(process.cwd(), 'tokens');
if (!fs.existsSync(TOKENS_DIR)) fs.mkdirSync(TOKENS_DIR, { recursive: true });

create(
  {
    session: 'noticia-bot',       // troque o nome se quiser forçar QR novo
    multidevice: true,
    headless: true,
    logQR: true,                  // loga o QR em ASCII nos logs
    qrTimeout: 0,                 // NUNCA expira esperando o QR
    browserArgs: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      // '--headless=new', // opcional: pode ativar se precisar
    ],
    useChrome: true,
    executablePath: CHROME_PATH,
    disableSpins: true,
    autoClose: 0,
    folderNameToken: TOKENS_DIR,
    updatesLog: false
  },
  // onQR
  (base64Qr, asciiQR, attempts) => {
    console.log('🔳 onQR chamado. Tentativas:', attempts);
    console.log('QR ASCII:\n', asciiQR);
    lastQrDataUrl = base64Qr.startsWith('data:image')
      ? base64Qr
      : `data:image/png;base64,${base64Qr}`;
    console.log('ℹ️ Abra a URL pública (/) e escaneie o QR pelo WhatsApp → Aparelhos conectados.');
  },
  // statusFind
  (statusSession, session) => {
    console.log('🔎 Status session:', statusSession, '| Session:', session);
  }
)
  .then((client) => {
    console.log('✅ WhatsApp conectado!');
    whatsAppClient = client;

    setTimeout(() => {
      client.getAllChats()
        .then((chats) => {
          console.log('\n🧪 Chats detectados:\n');
          chats.forEach((chat) => {
            const tipo = chat.isGroup ? 'Grupo' : 'Contato';
            const nome = chat.name || 'Sem nome';
            const id = chat?.id?._serialized || chat?.id || 'sem-id';
            console.log(`📦 Tipo: ${tipo} | Nome: ${nome} | ID: ${id}`);
          });
        })
        .catch((err) => console.error('❌ Erro ao buscar chats:', err));
    }, 4000);
  })
  .catch((error) => {
    console.error('❌ Erro ao iniciar o Venom:', error);
  });
