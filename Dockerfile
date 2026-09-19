FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY public ./public
COPY src ./src
COPY rsbuild.config.ts tsconfig.json ./
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# ssh-клиент нужен, чтобы поднимать backend.ps1 на выключенной Windows-машине.
RUN apk add --no-cache openssh-client

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./server.js
COPY --from=builder /app/dist ./dist

EXPOSE 4180
CMD ["node", "server.js"]
