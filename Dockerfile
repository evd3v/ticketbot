# Базовый образ с уже установленным Chromium и зависимостями Puppeteer
FROM ghcr.io/puppeteer/puppeteer:22.15.0

# Не скачивать Chromium заново при установке puppeteer
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_CACHE_DIR=/home/pptruser/.cache/puppeteer

USER root

# Рабочая директория
WORKDIR /app

# Сначала только манифесты, с правильными правами для pptruser
COPY --chown=pptruser:pptruser package.json package-lock.json ./

# Установка зависимостей от имени pptruser (без правовых конфликтов)
USER pptruser
RUN npm ci --omit=dev || npm install --omit=dev

# Копируем остальной код с корректными правами
USER root
COPY --chown=pptruser:pptruser . .
USER pptruser

# Expose the port the app runs on (internal, fronted by Nginx)
EXPOSE 10010

# Command to run your Node.js app
CMD ["node", "index.js"]
