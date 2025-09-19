// index.js
// ====================================================================
// TG -> WA Bridge (Express + Venom-Bot + opcional node-telegram-bot-api)
// - Rotas: /           (home com link pro QR e status)
//         /qr         (mostra o QR atual se disponível)
//         /status     (JSON com estados: whatsappConectado/telegramAtivo/qrDisponivel)
//         /send-test  (GET ?msg=...) envia texto de teste ao WHATSAPP_DESTINO
// ====================================================================

require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

// Telegram (opcional, só liga se TELEGRAM_TOKEN existir)
let TelegramBot = null;
try { TelegramBot = require('node-telegram-bot-api'); } catch (_) { /* lib ausente, sem problemas */ }

// Venom (WhatsApp)
const { create } = require('venom-bot');

// ===================== ENV =====================
const PORT = Number(process.env.PORT || 3000);
const SESSION_NAME = process.env.SESSION_NAME || 'noticia-bot';
const CHROME_PATH = process.env.CHROME_PATH || ''; // Ex.: Windows: C:\Program Files\Google\Chrome\Application\chrome.exe
const HEADLESS = process.env.HEADLESS !== 'false'; // default: true
const WHATSAPP_DESTINO = process.env.WHATSAPP_DESTINO || ''; // Ex.: '555491739682-1532652400@g.us' (grupo) ou '559999999999@c.us' (contato)
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '';
// =================================================

// ===== Estado compartilhado p/ rotas =====
const state = {
  whatsappConectado: false,
  telegramAtivo: false,
  qrDisponivel: false
};

let lastQrDataUrl = null;     // guarda QR atual (data:image/png;base64,...)
let whatsAppClient = null;    // instância do Venom
let telegramBot = null;       // instância do node-telegram-bot-api (opcional)

// ====== Pastas de sessão (persistência do Venom) ======
const TOKENS_DIR = process.env.TOKENS_DIR || '/app/tokens';
if (!fs.existsSync(TOKENS_DIR)) fs.mkdirSync(TOKENS_DIR, { recursive: true });

// ====== Express ======
const app = express();

app.get('/', (_req, res) => {
  const html = `
  <html lang="pt-br">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>TG → WA Bridge</title>
      <style>
        body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 24px; }
        .wrap { max-width: 860px; margin: 0 auto; }
        a.btn { display:inline-block; padding:10px 14px; border-radius:10px; background:#0b5fff; color:#fff; text-decoration:none; }
        .grid { display:grid; gap:12px; grid-template-columns: repeat(auto-fit, minmax(220px,1fr)); margin-top: 16px; }
        .card { border:1px solid #e4e7ee; border-radius:12px; padding:16px; }
        code { background:#f6f8fb; padding:2px 6px; border-radius:6px; }
        .ok { color: #0a7a38; font-weight: 600; }
        .off { color: #c73d2d; font-weight: 600; }
      </style>
    </head>
    <body>
      <div class="wrap">
        <h1>🧩 TG → WA Bridge</h1>
        <p>Use os atalhos abaixo para acompanhar o estado e escanear o QR do WhatsApp.</p>
        <div class="grid">
          <div class="card">
            <h3>QR do WhatsApp</h3>
            <p>Abra: <a class="btn" href="/qr" target="_blank">/qr</a></p>
            <small>Se expirar, atualize a página.</small>
          </div>
          <div class="card">
            <h3>Status JSON</h3>
            <p><a class="btn" href="/status" target="_blank">/status</a></p>
          </div>
          <div class="card">
            <h3>Envio de teste</h3>
            <p>GET <code>/send-test?msg=Olá</code></p>
            <small>Envia a mensagem ao <code>WHATSAPP_DESTINO</code>.</small>
          </div>
        </div>

        <h2 style="margin-top:28px">Estado atual</h2>
        <ul>
          <li>WhatsApp: ${state.whatsappConectado ? '<span class="ok">Conectado</span>' : '<span class="off">Desconectado</span>'}</li>
          <li>Telegram: ${state.telegramAtivo ? '<span class="ok">Ativo</span>' : '<span class="off">Inativo</span>'}</li>
          <li>QR disponível: ${state.qrDisponivel ? '<span class="ok">Sim</span>' : '<span class="off">Não</span>'}</li>
        </ul>

        <p style="margin-top:24px"><small>Porta: ${PORT} • Sessão: <code>${SESSION_NAME}</code></small></p>
      </div>
    </body>
  </html>`;
  res.set('content-type', 'text/html; charset=utf-8').send(html);
});

app.get('/qr', (_req, res) => {
  if (!lastQrDataUrl) return res.status(404).send('QR não disponível no momento.');
  const html = `
  <html lang="pt-br">
    <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>QR • WhatsApp</title>
      <style>
        body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 24px; }
        img { max-width: 320px; image-rendering: pixelated; }
        a { color: #0b5fff; text-decoration: none; }
      </style>
    </head>
    <body>
      <h1>Escaneie o QR no WhatsApp</h1>
      <img src="${lastQrDataUrl}" alt="QR do WhatsApp" />
      <p>Se expirar, atualize a página.</p>
      <p><a href="/status" target="_blank">Ver status</a></p>
    </body>
  </html>`;
  res.set('content-type', 'text/html; charset=utf-8').send(html);
});

app.get('/status', (_req, res) => {
  res.json({
    whatsappConectado: state.whatsappConectado,
    telegramAtivo: state.telegramAtivo,
    qrDisponivel: state.qrDisponivel
  });
});

// Envio rápido de teste para o destino configurado
app.get('/send-test', async (req, res) => {
  const msg = (req.query.msg || 'Mensagem de teste').toString();
  if (!whatsAppClient || !state.whatsappConectado) {
    return res.status(400).json({ ok: false, error: 'WhatsApp não está conectado.' });
  }
  if (!WHATSAPP_DESTINO) {
    return res.status(400).json({ ok: false, error: 'WHATSAPP_DESTINO não configurado no .env' });
  }
  try {
    await whatsAppClient.sendText(WHATSAPP_DESTINO, msg);
    res.json({ ok: true, sent: msg });
  } catch (err) {
    console.error('Erro ao enviar teste:', err);
    res.status(500).json({ ok: false, error: String(err && err.message || err) });
  }
});

// Sobe o servidor HTTP
app.listen(PORT, () => {
  console.log(`[server] HTTP on :${PORT}`);
});

// ============== WHATSAPP (VENOM) ==============
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
      folderNameToken: TOKENS_DIR,
      // Chrome/Chromium
      useChrome: !!CHROME_PATH,
      browserPathExecutable: CHROME_PATH || undefined,
      disableSpins: true,
      updatesLog: false,
      // Flags recomendadas p/ containers/servers
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
      venomOptions,
      // onQR
      (base64Qr, asciiQR, attempts) => {
        if (asciiQR) console.log('[wa] QR ASCII (preview):\n', asciiQR);
        const dataUrl = base64Qr?.startsWith('data:image') ? base64Qr : `data:image/png;base64,${base64Qr || ''}`;
        lastQrDataUrl = dataUrl || null;
        state.qrDisponivel = !!lastQrDataUrl;
        state.whatsappConectado = false;
        console.log(`[wa] QR gerado (tentativa: ${attempts}). Abra /qr para escanear.`);
      },
      // statusFind
      (statusSession, session) => {
        console.log('[wa] statusFind:', statusSession, '| session:', session);
      }
    );

    whatsAppClient = client;

    // Mudanças de estado
    client.onStateChange((st) => {
      console.log('[wa] onStateChange:', st);
      if (st === 'CONNECTED') {
        state.whatsappConectado = true;
        state.qrDisponivel = false;
        lastQrDataUrl = null;
      } else if (
        ['UNPAIRED', 'UNPAIRED_IDLE', 'CONFLICT', 'UNLAUNCHED', 'DISCONNECTED'].includes(st)
      ) {
        state.whatsappConectado = false;
        // Venom deve voltar a emitir QR — onQR acima reativará qrDisponivel
      }
    });

    client.onStreamChange((stream) => {
      console.log('[wa] onStreamChange:', stream);
      if (stream === 'CONNECTED') {
        state.whatsappConectado = true;
        state.qrDisponivel = false;
        lastQrDataUrl = null;
      }
    });

    // Função utilitária para enviar ao WhatsApp
    async function sendToWhatsApp(texto, destino = WHATSAPP_DESTINO) {
      if (!destino) throw new Error('WHATSAPP_DESTINO não configurado.');
      if (!state.whatsappConectado) throw new Error('WhatsApp não conectado.');
      return client.sendText(destino, texto);
    }

    // Exporte para uso em handlers de Telegram (se quiser)
    globalThis.sendToWhatsApp = sendToWhatsApp;

    // (Opcional) listar chats para debug, alguns segundos após conectar
    setTimeout(async () => {
      try {
        const chats = await client.getAllChats();
        console.log(`\n🧪 Chats detectados (${chats.length}):`);
        for (const chat of chats.slice(0, 25)) {
          const tipo = chat.isGroup ? 'Grupo' : 'Contato';
          const nome = chat.name || 'Sem nome';
          const id = chat?.id?._serialized || chat?.id || 'sem-id';
          console.log(` - ${tipo} | ${nome} | ${id}`);
        }
        if (chats.length > 25) console.log(`... (+${chats.length - 25} ocultos)`);
      } catch (err) {
        console.warn('Não foi possível listar chats agora:', err?.message || err);
      }
    }, 5000);

  } catch (err) {
    console.error('[wa] erro ao iniciar Venom:', err);
  }
})();

// ============== TELEGRAM (OPCIONAL) ==============
(async () => {
  if (!TELEGRAM_TOKEN || !TelegramBot) {
    console.log('[tg] Telegram desativado (sem TELEGRAM_TOKEN ou lib não instalada).');
    return;
  }
  try {
    telegramBot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
    state.telegramAtivo = true;
    console.log('[tg] Bot Telegram em polling.');

    // Exemplo: se você enviar no Telegram a mensagem começando com "!wa "
    // ele encaminha o resto do texto para o WhatsApp destino.
    telegramBot.on('message', async (msg) => {
      const text = (msg.text || '').trim();
      if (!text) return;
      if (text.startsWith('!wa ')) {
        const payload = text.slice(4).trim();
        try {
          await globalThis.sendToWhatsApp(payload);
          await telegramBot.sendMessage(msg.chat.id, '✅ Enviado ao WhatsApp.');
        } catch (e) {
          await telegramBot.sendMessage(msg.chat.id, '❌ Falha ao enviar ao WhatsApp: ' + (e?.message || e));
        }
      }
    });

  } catch (err) {
    state.telegramAtivo = false;
    console.error('[tg] erro ao iniciar Telegram:', err);
  }
})();
