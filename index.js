// index.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

const TelegramBot = require('node-telegram-bot-api');
const { create } = require('venom-bot');

// ===== ENV =====
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const DESTINO       = process.env.WHATSAPP_DESTINO || ''; // ex: "xxxxx-123@g.us"
const PORT          = process.env.PORT || 3000;
const CHROME_PATH   = process.env.CHROME_PATH || '/usr/bin/google-chrome-stable';
const SESSION_NAME  = process.env.SESSION_NAME || 'noticia-bot-3';
const HEADLESS      = true;

if (!TELEGRAM_TOKEN) {
  console.error('❌ Falta TELEGRAM_TOKEN. Configure em Variables no Railway.');
  process.exit(1);
}

// ===== TOKENS (Persistência no Railway) =====
const TOKENS_DIR = process.env.TOKENS_DIR || '/app/tokens';
if (!fs.existsSync(TOKENS_DIR)) fs.mkdirSync(TOKENS_DIR, { recursive: true });

// Perfil exclusivo do Chrome para essa sessão (evita conflitos/locks)
const CHROME_PROFILE_DIR = path.join(TOKENS_DIR, `chrome-profile-${SESSION_NAME}`);
if (!fs.existsSync(CHROME_PROFILE_DIR)) fs.mkdirSync(CHROME_PROFILE_DIR, { recursive: true });

// Limpeza defensiva de locks antigos (SingletonLock)
function safeRemove(p) { try { if (fs.existsSync(p)) fs.rmSync(p, { force: true }); } catch {} }
[
  path.join(TOKENS_DIR, 'SingletonLock'),
  path.join(TOKENS_DIR, SESSION_NAME, 'SingletonLock'),
  path.join(CHROME_PROFILE_DIR, 'SingletonLock'),
  path.join(CHROME_PROFILE_DIR, 'Default', 'SingletonLock')
].forEach(safeRemove);

// ===== STATE =====
let waClient = null;
let lastQrDataUrl = null;
let waConnected = false;

// ===== HTTP (dashboard/QR) =====
const app = express();

app.get('/', (_req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.end(`
    <html>
      <head><meta charset="utf-8"><title>TG → WA Bridge</title>
      <style>
        body{font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; padding:24px;}
        .ok{color:#0a7d14}.bad{color:#b00020}.card{border:1px solid #ddd;border-radius:10px;padding:16px;margin:8px 0;width:340px}
        a.btn{display:inline-block;padding:8px 12px;border-radius:8px;background:#1b74e4;color:#fff;text-decoration:none}
      </style>
      </head>
      <body>
        <h1>✳️ TG → WA Bridge</h1>

        <div class="card">
          <h3>QR do WhatsApp</h3>
          <a class="btn" href="/qr">/qr</a>
          <p><small>Se expirar, atualize a página.</small></p>
        </div>

        <div class="card">
          <h3>Status JSON</h3>
          <a class="btn" href="/status">/status</a>
        </div>

        <div class="card">
          <h3>Envio de teste</h3>
          <code>GET /send-test?msg=Oi</code>
        </div>

        <h3>Estado atual</h3>
        <ul>
          <li>WhatsApp: ${waConnected ? '<span class="ok">Conectado</span>' : '<span class="bad">Desconectado</span>'}</li>
          <li>Telegram: <span class="ok">Ativo</span></li>
          <li>QR disponível: ${lastQrDataUrl ? '<span class="ok">Sim</span>' : '<span class="bad">Não</span>'}</li>
        </ul>
        <small>Porta: ${PORT} • Sessão: <code>${SESSION_NAME}</code></small>
      </body>
    </html>
  `);
});

app.get('/qr', (_req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.end(`
    <html><head><meta charset="utf-8"><title>QR</title></head>
    <body style="font-family: system-ui; padding:24px">
      <h2>QR do WhatsApp</h2>
      ${lastQrDataUrl
        ? `<img src="${lastQrDataUrl}" style="max-width:320px; image-rendering:pixelated; border:1px solid #ddd; padding:8px; border-radius:8px" />`
        : '<p>Aguardando QR... recarregue em alguns segundos.</p>'}
      <p><a href="/">Voltar</a></p>
    </body></html>
  `);
});

app.get('/status', (_req, res) => {
  res.json({
    whatsapp: waConnected ? 'connected' : 'disconnected',
    telegram: 'active',
    qrAvailable: !!lastQrDataUrl,
    session: SESSION_NAME,
    tokensDir: TOKENS_DIR,
    chromeProfileDir: CHROME_PROFILE_DIR
  });
});

app.get('/send-test', async (req, res) => {
  try {
    const msg = req.query.msg || 'Teste ✅';
    if (!waClient?.sendText) return res.status(400).json({ ok: false, error: 'WhatsApp não está pronto' });
    if (!DESTINO) return res.status(400).json({ ok: false, error: 'WHATSAPP_DESTINO não configurado' });
    await waClient.sendText(DESTINO, msg);
    res.json({ ok: true, sentTo: DESTINO, message: msg });
  } catch (e) {
    console.error('❌ /send-test erro:', e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.listen(PORT, () => console.log(`🌐 HTTP up on :${PORT}`));

// ===== TELEGRAM BOT =====
const tg = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

function formatarNoticia(mensagem) {
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

tg.on('message', async (msg) => {
  const texto = msg?.text;
  if (!texto) return;
  const mensagemFormatada = formatarNoticia(texto);
  console.log('\n📨 Telegram recebeu:\n', texto);

  if (waClient?.sendText && DESTINO) {
    try {
      await waClient.sendText(DESTINO, mensagemFormatada);
      console.log('📤 Enviado ao WhatsApp:', DESTINO);
    } catch (e) {
      console.error('❌ Erro ao enviar ao WhatsApp:', e);
    }
  } else {
    console.log('⚠️ WhatsApp ainda não pronto ou WHATSAPP_DESTINO vazio.');
  }
});

// ============= WHATSAPP (VENOM) =============
(async () => {
  try {
    const venomOptions = {
      multidevice: true,
      headless: HEADLESS,
      logQR: true,
      waitForLogin: true,
      qrTimeout: 0,
      killProcessOnBrowserClose: false,
      waitStartup: true,
      disableWelcome: true,

      // 🔐 Persistência no volume
      folderNameToken: 'tokens',     // nome interno
      mkdirFolderToken: TOKENS_DIR,  // caminho absoluto (/app/tokens)

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
        `--user-data-dir=${CHROME_PROFILE_DIR}`, // perfil exclusivo por sessão (no volume)
        '--profile-directory=Default',           // subperfil padrão
        '--headless=new'                         // headless moderno
      ]
    };

    const client = await create(
      SESSION_NAME,
      // onQR
      (base64Qr, asciiQR) => {
        if (asciiQR) console.log('QR ASCII:\n', asciiQR);
        if (base64Qr) {
          lastQrDataUrl = base64Qr.startsWith('data:image')
            ? base64Qr
            : `data:image/png;base64,${base64Qr}`;
          console.log('🖼️ QR atualizado! Abra /qr');
        }
      },
      // statusFind
      (statusSession, session) => {
        console.log('🔎 Status session:', statusSession, '| Session:', session);
        const s = String(statusSession).toLowerCase();
        if (s.includes('logged') || s.includes('qrreadsuccess')) waConnected = true;
        if (s.includes('not') || s.includes('desconnected') || s.includes('browserclose')) waConnected = false;
      },
      venomOptions
    );

    console.log('✅ WhatsApp conectado!');
    waClient = client;

  } catch (err) {
    console.error('❌ Erro ao iniciar o Venom:', err);
  }
})();

// Keep-alive / logs periódicos
setInterval(() => console.log('⏱️ heartbeat'), 60_000);
