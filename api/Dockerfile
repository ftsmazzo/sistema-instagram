# API FabriaIA (Fastify)
# Build context = raiz do repo; Dockerfile em api/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY api/package.json api/tsconfig.json ./
COPY api/src ./src
RUN npm install
RUN npm run build

FROM node:20-alpine
WORKDIR /app
# Fontes para o Sharp/librsvg renderizar texto no overlay do carrossel (sem isso só a faixa aparece)
RUN apk add --no-cache fontconfig ttf-dejavu ffmpeg curl
COPY api/package.json ./
COPY api/scripts/download-music-assets.sh ./scripts/download-music-assets.sh
RUN chmod +x ./scripts/download-music-assets.sh && ./scripts/download-music-assets.sh
COPY --from=builder /app/dist ./dist
RUN npm install --omit=dev
EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000
CMD ["node", "dist/index.js"]
