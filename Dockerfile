FROM node:20-slim

# Dependências do Chrome (headless)
RUN apt-get update && apt-get install -y \
    wget gnupg ca-certificates procps \
    libnss3 libxss1 libatk-bridge2.0-0 libdrm2 libxcomposite1 libxdamage1 \
    libxrandr2 libgbm1 libgtk-3-0 libasound2 fonts-liberation \
    xdg-utils curl unzip \
 && rm -rf /var/lib/apt/lists/*

# Instala Google Chrome (sem apt-key, usando keyring)
RUN wget -qO - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor > /usr/share/keyrings/google-linux.gpg \
 && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-linux.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
 && apt-get update && apt-get install -y google-chrome-stable \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia manifests primeiro (cache)
COPY package*.json ./

# ✅ Troca que resolve o erro do npm ci/lockfile
RUN npm install --omit=dev

# Copia o restante
COPY . .

# Vars
ENV CHROME_PATH=/usr/bin/google-chrome-stable
ENV NODE_ENV=production

# Sessão do WhatsApp
RUN mkdir -p /app/tokens

EXPOSE 3000
CMD ["node", "index.js"]
