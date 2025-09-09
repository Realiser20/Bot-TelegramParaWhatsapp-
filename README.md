# Bot Telegram → WhatsApp

Bot que conecta Telegram ao WhatsApp usando venom-bot, preparado para deployment no Railway.

## 🚀 Deploy no Railway

### 1. Variáveis de Ambiente

Configure as seguintes variáveis no Railway:

- `TELEGRAM_TOKEN` - Token do seu bot (obtenha em @BotFather)
- `WHATSAPP_DESTINO` - ID do chat/grupo destino (ex: `xxxxx-123@g.us`)
- `PORT` - Porta do servidor (opcional, padrão: 3000)
- `CHROME_PATH` - Caminho do Chrome (opcional, já configurado no Docker)

### 2. Volume para Tokens

Crie um volume no Railway apontando para `/app/tokens` para persistir a sessão do WhatsApp.

### 3. Conectar WhatsApp

1. Após o deploy, acesse a URL pública do seu projeto
2. Escaneie o QR Code com seu WhatsApp
3. O bot ficará conectado e pronto para uso

## 📱 Como Usar

1. Envie qualquer mensagem para o bot no Telegram
2. A mensagem será automaticamente formatada e enviada para o WhatsApp
3. O formato inclui título, link principal, corpo e blocos fixos

## 🔧 Desenvolvimento Local

```bash
# Instalar dependências
npm install

# Copiar e configurar .env
cp .env.example .env

# Executar
npm start
```

## 📋 Formato das Mensagens

O bot formata automaticamente as mensagens seguindo este padrão:

- **1ª linha**: Título da notícia
- **Primeiro link HTTP(S)**: Link principal da matéria
- **Demais linhas**: Corpo da mensagem
- **Blocos fixos**: Links para WhatsApp, Telegram e app

## 🐳 Docker

```bash
# Build
docker build -t telegram-whatsapp-bot .

# Run
docker run -p 3000:3000 --env-file .env telegram-whatsapp-bot
```

## ⚠️ Notas Importantes

- O bot precisa escanear o QR Code a cada reinício (por isso é importante configurar o volume)
- Certifique-se de que o `WHATSAPP_DESTINO` está no formato correto
- O Chrome é instalado automaticamente no container Docker