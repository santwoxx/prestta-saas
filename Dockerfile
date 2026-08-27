# ---------------------------------------------------------------------------
# Prestta - imagem de producao
# Node 24: o modulo `node:sqlite` ja e estavel (no Node 22 exigiria a flag
# --experimental-sqlite).
# ---------------------------------------------------------------------------
FROM node:24-alpine

# su-exec: usado no entrypoint para largar o root depois de ajustar o volume.
RUN apk add --no-cache su-exec

ENV NODE_ENV=production
ENV PORT=8080
# Banco e uploads ficam no volume persistente montado em /data.
ENV DATA_DIR=/data/db
ENV UPLOAD_DIR=/data/uploads

WORKDIR /app

# Dependencias primeiro (aproveita o cache de camada).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY server ./server
COPY public ./public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server/index.js"]
