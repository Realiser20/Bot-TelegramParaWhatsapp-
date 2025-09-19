# Dockerfile (opção A)
FROM node:20-slim

ENV DEBIAN_FRONTEND=noninteractive

# Dependências mínimas p/ Chrome headless
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget gnupg ca-certificates procps curl unzip xdg-utils \
    libnss3 libx11-xcb1 libatk-bridge2.0-0 libxcomposite1 libxdamage1 \
    libxrandr2 libgbm1 libgtk-3-0 libasound2 fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

# Repositório do Google Chrome + instalação
RUN wget -qO - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor > /usr/share/keyrings/google-linux.gpg \
 && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-linux.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
    > /etc/apt/sources.list.d/google-chrome.list \
 && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache de deps
COPY package*.json ./
ENV NODE_ENV=production
RUN npm ci --omit=dev || npm install --omit=dev --no-audit --no-fund

# Código
COPY . .

# Vars
ENV CHROME_PATH=/usr/bin/google-chrome-stable

# Tokens (monte Volume em /app/tokens)
RUN mkdir -p /app/tokens

EXPOSE 3000
CMD ["node", "index.js"]
