# Dockerfile productivo del backend del Álbum de Fútbol Digital.
#
# Multi-stage:
#   1) deps    — instala TODAS las dependencias (incl. dev) para compilar.
#   2) build   — compila TypeScript a dist/.
#   3) runtime — imagen final mínima: solo dependencias de producción + dist,
#                ejecutada por un usuario no-root.

# ---------- Stage 1: dependencias completas ----------
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- Stage 2: build ----------
FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------- Stage 3: runtime ----------
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Solo dependencias de producción.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Artefactos compilados.
COPY --from=build /app/dist ./dist

# Ejecutar como usuario no-root (la imagen node trae el usuario "node").
USER node

EXPOSE 3000

# Healthcheck contra el endpoint público /health. Envía x-forwarded-proto=https
# porque el gateway exige TLS en el borde; en producción el healthcheck interno
# representa al proxy que ya terminó TLS.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health',{headers:{'x-forwarded-proto':'https'}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/src/main.js"]
