FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
COPY requirements.txt /tmp/requirements.txt
RUN python3 -m venv /opt/ytdlp && /opt/ytdlp/bin/pip install --no-cache-dir -r /tmp/requirements.txt
ENV PATH="/opt/ytdlp/bin:${PATH}"
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p /app/cache /app/cookies && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node","server.mjs"]
