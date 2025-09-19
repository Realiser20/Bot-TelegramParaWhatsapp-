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
const SESSION_NAME = process.env.SESSION_NAME || 'noticia-bot-3';
const HEADLESS = true;

// ===== TOKENS (Persistência no Railway) =====
const TOKENS_DIR = process.env.TOKENS_DIR || '/app/tokens';
if (!fs.existsSync(TOKENS_DIR)) fs.mkdirSync(TOKENS_DIR, { recursive: true });

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
if (!TELEGRAM_TOKEN) {
  console.error('❌ Falta TELEGRAM_TOKEN. Configure em Variables no Railway.');
  process.exit(1);
}
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

// ============= WHATSAPP (VENOM) =============
(async () => {
  try {
    const venomOptions = {
      session: SESSION_NAME,
      multidevice: true,
      headless: HEADLESS,
      logQR: false,
      waitForLogin: true,
      qrTimeout: 0,
      killProcessOnBrowserClose: false,
      waitStartup: true,
      disableWelcome: true,

      // 🔐 Persistência no volume
      folderNameToken: 'tokens',    // nome da pasta interna
      mkdirFolderToken: TOKENS_DIR, // caminho absoluto (/app/tokens)

      useChrome: true,
      executablePath: CHROME_PATH,
      disableSpins: true,
      browserArgs: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-software-rasterizer',
        '--window-size=1280,800',
        '--headless=new'
      ]
    };

    const client = await create(
      SESSION_NAME,
      (base64Qr, asciiQR) => {
        if (asciiQR) console.log('QR ASCII:\n', asciiQR);
        if (base64Qr) {
          lastQrDataUrl = base64Qr.startsWith('data:image')
            ? base64Qr
            : `data:image/png;base64,${base64Qr}`;
          console.log('🖼️ QR atualizado! Veja na rota "/"');
        }
      },
      (statusSession, session) => {
        console.log('🔎 Status session:', statusSession, '| Session:', session);
      },
      venomOptions
    );

    console.log('✅ WhatsApp conectado!');
    whatsAppClient = client;

  } catch (err) {
    console.error('❌ Erro ao iniciar o Venom:', err);
  }
})();

// Keep-alive simples
setInterval(() => console.log('⏱️ heartbeat'), 60_000);
