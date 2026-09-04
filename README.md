# Freebuff Monitor 📊

Dashboard monitoring trading ala **Myfxbook** untuk akun MT5 kamu — di-host sendiri,
tanpa bayar langganan, data 100% milik kamu.

## Fitur

- **Dashboard** — equity, balance, growth %, net profit, max drawdown, win rate,
  profit factor, lots bulan ini
- **Kurva equity** — grafik equity & balance dari snapshot berkala
- **Statistik bulanan** — lots, jumlah trade, win rate, profit, balance akhir per bulan
- **Riwayat Trade** — semua posisi tertutup dengan filter simbol/bulan/tipe + pagination
- **Posisi Terbuka** — posisi live dengan floating P&L, SL/TP, swap
- **Konversi USC → USD** — akun cent otomatis dibagi 100 di seluruh tampilan
- **Input Akun** — broker, login, password investor (terenkripsi AES-256-GCM), server,
  flag cent, token bridge unik per akun
- **Login single-user** — session cookie bertanda tangan HMAC
- **Bridge Python** — sinkronisasi dari terminal MT5 di VPS tiap 30 detik,
  aman dipakai berdampingan dengan copier

## Arsitektur

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  VPS Windows (MT5)          │        │  Web App (Next.js)           │
│  Terminal MT5 + copier      │        │  - Halaman dashboard         │
│  mt5_bridge.py (tiap 30 dtk)│ ─────► │  - SQLite via Prisma         │
└─────────────────────────────┘  POST  └──────────────────────────────┘
   /api/bridge/sync + Bearer token
```

## Teknologi

- **Next.js 16** (App Router, `proxy.ts`), TypeScript, Tailwind CSS 4, Recharts
- **Prisma 6 + SQLite** (tanpa server DB terpisah)
- **bcryptjs** (opsional: hash password admin), **node:crypto** (HMAC session + AES-GCM)
- **Python 3.8+** + paket `MetaTrader5` untuk bridge (Windows saja)

## Mulai cepat (development)

```bash
npm install

# 1. Siapkan environment
cp .env.example .env        # lalu isi SESSION_SECRET & ENCRYPTION_KEY
                            # (lihat perintah pembuatannya di .env.example)

# 2. Siapkan database
npx prisma db push

# 3. Jalankan
npm run dev                 # buka http://localhost:3000
```

Login default: **admin / admin123** (ubah `AUTH_USERNAME` / `AUTH_PASSWORD` di `.env`).

## Alur pemakaian nyata

1. **Buat akun** di halaman `/accounts`: nama, broker, login, server,
   password investor (opsional untuk sinkronisasi), cent kalau akun USC.
2. **Salin token** akun (tombol "Salin").
3. **Di VPS**: ikuti `bridge/README.md` — install Python, `pip install -r requirements.txt`,
   salin `config.example.json` → `config.json`, isi `app_url` + `login` + `token`,
   lalu jalankan `python mt5_bridge.py`.
4. Data masuk otomatis: dashboard, riwayat, dan posisi langsung terisi.

## Deployment

### Opsi A — Docker (disarankan)

Buat secret dulu (satu kali):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # untuk SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # untuk ENCRYPTION_KEY
```

Lalu:

```bash
docker build -t freebuff-monitor .
docker run -d -p 3000:3000 \
  -e AUTH_USERNAME=admin \
  -e AUTH_PASSWORD='ganti-ini' \
  -e SESSION_SECRET='<hasil-node-1>' \
  -e ENCRYPTION_KEY='<hasil-node-2>' \
  -v freebuff-data:/app/prisma \
  freebuff-monitor
```

Data tersimpan di volume `freebuff-data` (file SQLite).
Ganti `AUTH_PASSWORD` dengan password kuat — bisa juga berupa bcrypt hash (`$2...$`).

> **Catatan untuk akun cent**: nilai di DB tersimpan apa adanya (USC). Semua
> tampilan otomatis membagi 100 dan memberi label "USC → USD" — tidak ada data
> yang perlu diubah manual.

### Opsi B — VPS langsung

```bash
npm ci
npm run build
npx prisma db push          # jalankan sekali saat setup
npm run start               # di belakang PM2 / systemd
```

Lalu pasang reverse proxy (Caddy/Nginx) untuk HTTPS — disarankan, karena
password investor terenkripsi tapi trafik tetap lebih aman via TLS.

## Perintah lain

| Perintah           | Fungsi                                  |
| ------------------ | --------------------------------------- |
| `npm run dev`      | Development server                      |
| `npm run build`    | Production build                        |
| `npm start`        | Jalankan production build               |
| `npm test`         | Unit test (vitest)                      |
| `npm run lint`     | ESLint                                  |

## Keamanan

- Password admin: simpan plaintext di `.env` **atau** bcrypt hash (`AUTH_PASSWORD="$2..."`).
- Password investor: dienkripsi **AES-256-GCM** (kunci `ENCRYPTION_KEY`, 32 byte hex).
- Session: stateless HMAC-SHA256, cookie `httpOnly` + `sameSite=lax`, kedaluwarsa 7 hari.
- Bridge: autentikasi per-akun via `Authorization: Bearer <token>` (24 byte acak),
  hanya bisa menulis data sinkron.
- Ganti **semua** nilai di `.env` sebelum digunakan publik.

## Struktur proyek

```
app/
  (app)/            # halaman terproteksi: dashboard, riwayat, posisi, akun
  api/              # route handler: login, logout, accounts, bridge/sync
  login/            # halaman login
lib/
  session.ts        # sign/verify session (murni, aman untuk proxy)
  auth.ts           # getSession + cek kredensial
  crypto.ts         # AES-256-GCM untuk password investor
  metrics.ts        # mesin metrik ala Myfxbook (pure functions, diuji)
  sync.ts           # proses payload bridge → database
  queries.ts        # loader data untuk halaman
bridge/             # Python bridge + panduan setup VPS
prisma/schema.prisma
tests/              # unit test vitest
```

## Batasan

- Sinkronisasi butuh VPS Windows tempat terminal MT5 berjalan (paket
  `MetaTrader5` tidak tersedia untuk Linux/Mac).
- Data riwayat diambil dari **deal history terminal** — pastikan terminal
  terbuka minimal sekali sehari agar history lengkap.
- Untuk banyak akun di satu VPS: isi beberapa entri di `accounts[]` — bridge
  memprosesnya bergantian tiap siklus.