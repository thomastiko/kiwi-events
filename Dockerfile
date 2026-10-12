FROM node:22-trixie-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5001
ENV KIWI_EVENTS_CONFIG_FILE=/data/kiwi-events.config.json
ENV KIWI_EVENTS_DATA_DIR=/data
ENV KIWI_EVENTS_LOCAL_STORAGE_DIR=/data/uploads

RUN apt-get update \
    && apt-get upgrade -y \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

RUN npm ci --omit=dev \
    && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx

COPY src ./src
COPY public ./public
COPY LICENSE ./LICENSE
COPY README.md ./README.md

RUN mkdir -p /data/uploads && chown -R node:node /app /data

USER node

EXPOSE 5001

VOLUME ["/data"]

CMD ["node", "src/server.js"]