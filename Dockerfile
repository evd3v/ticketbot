# Базовый образ с уже установленным Chromium и зависимостями Puppeteer
FROM ghcr.io/puppeteer/puppeteer:22.15.0

# Не скачивать Chromium заново при установке puppeteer
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_CACHE_DIR=/root/.cache/puppeteer

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json into the container
COPY package.json package-lock.json ./

# Установка зависимостей проекта
RUN npm install --omit=dev

# Copy the rest of the project files into the container
COPY . .

# Expose the port the app runs on (internal, fronted by Nginx)
EXPOSE 10010

# Command to run your Node.js app
CMD ["node", "index.js"]
