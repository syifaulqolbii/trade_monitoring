# ---- Tahap build ----
FROM node:22-alpine AS builder
WORKDIR /app

ENV DATABASE_URL="file:./dev.db"

# install dependensi dulu (cache layer)
COPY package.json package-lock.json ./
RUN npm ci

# salin source & generate prisma client
COPY . .
RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- Tahap runtime ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

ENV DATABASE_URL="file:./dev.db"

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Prisma CLI + engines (untuk inisialisasi skema DB saat container start).
# @prisma/engines juga berisi query engine runtime yang dibutuhkan @prisma/client.
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma/engines ./node_modules/@prisma/engines
COPY --from=builder /app/node_modules/@prisma/config ./node_modules/@prisma/config

# SQLite tersimpan di volume (/app/data) agar tidak hilang saat container restart
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000

# Buat/perbarui skema tabel (idempotent) lalu jalankan server.
# --skip-generate: client sudah di-generate saat build; user nextjs tidak punya
# izin menulis ke node_modules.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js db push --skip-generate && exec node server.js"]